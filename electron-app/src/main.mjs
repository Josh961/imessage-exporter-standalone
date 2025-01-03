import archiver from 'archiver';
import { exec } from 'child_process';
import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron';
import Store from 'electron-store';
import { createWriteStream } from 'fs';
import fs, { rm } from 'fs/promises';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const store = new Store();

let mainWindow;

// Define executables for different platforms
const EXECUTABLES = {
  darwin: 'imessage-exporter-mac',
  win32: 'imessage-exporter-win.exe'
};

// Application lifecycle
app.whenReady().then(() => {
  createWindow();

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, 'index.html'));

  mainWindow.webContents.on('did-finish-load', () => {
    checkFullDiskAccess();
  });
}


async function checkFullDiskAccess() {
  const hasAccess = await checkFullDiskAccessPermission();
  if (!hasAccess) {
    mainWindow.webContents.send('show-permissions-modal');
  }
}

async function checkFullDiskAccessPermission() {
  if (process.platform === 'darwin') {
    const protectedDirs = [
      path.join(app.getPath('home'), 'Library', 'Messages'),
      path.join(app.getPath('home'), 'Library', 'Mail'),
      path.join(app.getPath('home'), 'Library', 'Safari'),
      path.join(app.getPath('home'), 'Library', 'Cookies'),
      path.join(app.getPath('home'), 'Library', 'HomeKit'),
      path.join(app.getPath('home'), 'Library', 'IdentityServices')
    ];

    for (const dir of protectedDirs) {
      try {
        await fs.readdir(dir);
        return true; // If we can read any directory, we have full disk access
      } catch (err) {
        if (err.code !== 'ENOENT') { // Ignore "no such file or directory" errors
          console.log(`Access denied to ${dir}`);
        }
        // Continue checking other directories
      }
    }
    return false; // If we couldn't read any of the directories, we don't have full disk access
  }
  return true; // For non-macOS platforms
}

// IPC Handlers
// System information
ipcMain.handle('get-platform', () => {
  return process.platform;
});

ipcMain.handle('open-system-preferences', () => {
  shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles');
});

ipcMain.handle('check-full-disk-access', checkFullDiskAccessPermission);

ipcMain.handle('restart-app', () => {
  app.relaunch();
  app.exit(0);
});

// File and folder operations
ipcMain.handle('open-external-link', (event, url) => shell.openExternal(url));

ipcMain.handle('expand-path', async (event, inputPath) => {
  if (process.platform === 'win32') {
    return inputPath.replace(/%([^%]+)%/g, (_, n) => process.env[n]);
  } else {
    return inputPath.replace(/^~/, os.homedir());
  }
});

ipcMain.handle('check-path-exists', async (event, checkPath) => {
  try {
    await fs.access(checkPath);
    return true;
  } catch {
    return false;
  }
});

ipcMain.handle('get-nested-folders', async (event, folderPath) => {
  try {
    const entries = await fs.readdir(folderPath, { withFileTypes: true });
    return entries
      .filter(entry => entry.isDirectory())
      .map(entry => path.join(folderPath, entry.name));
  } catch (error) {
    console.error('Error getting nested folders:', error);
    return [];
  }
});

ipcMain.handle('get-documents-folder', () => app.getPath('documents'));

ipcMain.handle('select-folder', async (event, currentPath, type) => {
  let defaultPath = app.getPath('documents');

  if (currentPath) {
    try {
      await fs.access(currentPath);
      defaultPath = currentPath;
    } catch (error) {
      console.error(`Current path does not exist: ${currentPath}`);
    }
  } else if (type === 'input') {
    defaultPath = store.get('lastInputFolder', defaultPath);
  } else if (type === 'output') {
    defaultPath = store.get('lastOutputFolder', defaultPath);
  }

  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
    defaultPath: defaultPath
  });

  if (result.canceled) {
    return null;
  } else {
    const selectedPath = result.filePaths[0];
    if (type === 'input') {
      store.set('lastInputFolder', selectedPath);
    } else if (type === 'output') {
      store.set('lastOutputFolder', selectedPath);
    }
    return selectedPath;
  }
});

// Store operations
ipcMain.handle('get-last-input-folder', () => store.get('lastInputFolder', ''));
ipcMain.handle('get-last-output-folder', () => store.get('lastOutputFolder', app.getPath('documents')));
ipcMain.handle('save-last-input-folder', (event, folder) => store.set('lastInputFolder', folder));
ipcMain.handle('save-last-output-folder', (event, folder) => store.set('lastOutputFolder', folder));

// iMessage exporter operations
ipcMain.handle('list-contacts', async (event, inputFolder) => {
  const executablePath = getResourcePath();
  const chatDbPath = getChatDbPath(inputFolder);

  return new Promise((resolve) => {
    exec(`"${executablePath}" -b -p "${chatDbPath}" -n`, (error, stdout, stderr) => {
      if (error) {
        resolve({ success: false, error: error.message });
      } else {
        const contacts = stdout.split('\n')
          .filter(line => line.trim().length > 0)
          .map(line => {
            const [type, contact, messageCount, lastMessageDate, participants] = line.split('|');
            return { type, contact, messageCount: parseInt(messageCount), lastMessageDate, participants };
          });
        resolve({ success: true, contacts });
      }
    });
  });
});

ipcMain.handle('run-exporter', async (event, exportParams) => {
  const { inputFolder, outputFolder, startDate, endDate, selectedContacts, includeVideos, debugMode } = exportParams;

  try {
    const uniqueTempFolder = await createUniqueFolder(outputFolder);
    const uniqueZipPath = await getUniqueZipPath(outputFolder);
    const executablePath = getResourcePath();
    const chatDbPath = getChatDbPath(inputFolder);

    let params = `-f txt -c basic -b${!includeVideos ? ' -v' : ''} -p "${chatDbPath}" -o "${uniqueTempFolder}"`;
    if (startDate) params += ` -s ${startDate}`;
    if (endDate) params += ` -e ${endDate}`;

    if (selectedContacts && selectedContacts.length > 0) {
      const contactsString = selectedContacts.map(contact =>
        contact.includes(',') ? `"${contact}"` : contact
      ).join(';');
      params += ` -t "${contactsString}"`;
    }

    const command = `"${executablePath}" ${params}`;

    return new Promise((resolve) => {
      exec(command, async (error, stdout, stderr) => {
        if (error) {
          resolve({ success: false, error: error.message });
        } else {
          try {
            await sanitizeFileNames(uniqueTempFolder);

            // Create debug log if debug mode is enabled
            if (debugMode) {
              const logContent = `Command: ${command}\n\nOutput:\n${stdout}\n\nErrors:\n${stderr}`;
              await fs.writeFile(path.join(uniqueTempFolder, 'debug.log'), logContent);
            }

            const finalZipPath = await zipFolder(uniqueTempFolder, uniqueZipPath);
            resolve({ success: true, zipPath: finalZipPath });
          } catch (err) {
            resolve({ success: false, error: err.message });
          }
        }
      });
    });
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Utility functions
function getResourcePath() {
  const executableName = getExecutableName();
  return app.isPackaged
    ? path.join(process.resourcesPath, executableName)
    : path.join(__dirname, '..', 'resources', executableName);
}

function getExecutableName() {
  return EXECUTABLES[process.platform] || EXECUTABLES.win32; // Default to Windows executable if platform is not recognized
}

async function createUniqueFolder(basePath) {
  const { uniqueName, fullPath } = await createUniqueName(basePath, 'imessage-export-temp');
  await fs.mkdir(fullPath, { recursive: true });
  return fullPath;
}

async function getUniqueZipPath(basePath) {
  const { fullPath } = await createUniqueName(basePath, 'imessage-export', '.zip');
  return fullPath;
}

async function createUniqueName(basePath, prefix, extension = '') {
  let counter = 2; // Start at 2
  let uniqueName = prefix;
  let fullPath = path.join(basePath, uniqueName + extension);

  try {
    await fs.access(fullPath);
    // If the file exists without a number, immediately move to numbered versions
    uniqueName = `${prefix}(${counter})`;
    fullPath = path.join(basePath, uniqueName + extension);
    counter++;
  } catch {
    // If the file doesn't exist, we can use the name without a number
    return { uniqueName, fullPath };
  }

  while (true) {
    try {
      await fs.access(fullPath);
      uniqueName = `${prefix}(${counter})`;
      fullPath = path.join(basePath, uniqueName + extension);
      counter++;
    } catch {
      break;
    }
  }

  return { uniqueName, fullPath };
}

function getChatDbPath(inputPath) {
  if (process.platform === 'darwin' && (inputPath.endsWith('Library/Messages') || inputPath.endsWith('Library/Messages/'))) {
    return path.join(inputPath, 'chat.db');
  }
  return inputPath;
}

async function sanitizeFileNames(directory) {
  try {
    const files = await fs.readdir(directory);
    for (const file of files) {
      if (file.endsWith('.txt')) {
        const oldPath = path.join(directory, file);
        const newFileName = sanitizeFileName(file);
        const newPath = path.join(directory, newFileName);

        if (oldPath !== newPath) {
          await fs.rename(oldPath, newPath);
        }
      }
    }
  } catch (error) {
    console.error('Error sanitizing file names:', error);
  }
}

function sanitizeFileName(fileName) {
  // Remove emoji and special characters, replace spaces with underscores
  return fileName
    .replace(/[\u{1F600}-\u{1F64F}]/gu, '') // Remove emoji
    .replace(/[\u{1F300}-\u{1F5FF}]/gu, '') // Remove symbols & pictographs
    .replace(/[\u{1F680}-\u{1F6FF}]/gu, '') // Remove transport & map symbols
    .replace(/[\u{2600}-\u{26FF}]/gu, '')   // Remove miscellaneous symbols
    .replace(/[\u{2700}-\u{27BF}]/gu, '')   // Remove dingbats
    .replace(/_+/g, '_')                    // Replace multiple underscores with a single one
    .replace(/^_|_$/g, '')                  // Remove leading and trailing underscores
    .replace(/^\.+|\.+$/g, '')              // Remove leading and trailing dots
    .replace(/\.{2,}/g, '.');               // Replace multiple dots with a single one
}

async function zipFolder(folderPath, zipPath) {
  const output = createWriteStream(zipPath);
  const archive = archiver('zip');

  return new Promise((resolve, reject) => {
    output.on('close', async () => {
      try {
        await rm(folderPath, { recursive: true, force: true });
        resolve(zipPath);
      } catch (error) {
        console.error('Error deleting original folder:', error);
        resolve(zipPath);
      }
    });
    archive.on('error', reject);

    archive.pipe(output);
    archive.directory(folderPath, false);
    archive.finalize();
  });
}
