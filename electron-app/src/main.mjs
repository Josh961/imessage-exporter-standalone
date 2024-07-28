import { exec } from 'child_process';
import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron';
import Store from 'electron-store';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import os from 'os';

const EXECUTABLE_NAME = 'imessage-exporter.exe';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const store = new Store();

let mainWindow;

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

  // Check Full Disk Access after window is created
  setTimeout(async () => {
    const hasAccess = await checkFullDiskAccess();
    if (!hasAccess) {
      showPermissionsInstructions(mainWindow);
    }
  }, 2000); // 2 second delay
}

async function checkFullDiskAccess() {
  if (process.platform === 'darwin') {
    const messageDatabasePath = path.join(app.getPath('home'), 'Library', 'Messages', 'chat.db');
    try {
      await fs.access(messageDatabasePath, fs.constants.R_OK);
      return true;
    } catch (err) {
      console.error('Full Disk Access check failed:', err);
      return false;
    }
  }
  return true; // For non-macOS platforms
}

function showPermissionsInstructions(mainWindow) {
  dialog.showMessageBox(mainWindow, {
    type: 'info',
    title: 'Permissions Required',
    message: 'This app requires Full Disk Access to read your iMessages database and access to your Documents folder to save exported chats.',
    detail: 'Please follow these steps:\n\n1. Open System Settings\n2. Go to Privacy & Security \n3. Select "Full Disk Access" \n4. Click the + icon to add iMessage Exporter to the list\n5. Turn the toggle on to grant permissions\n\nAfter granting permissions, please restart the app.',
    buttons: ['OK']
  });
}

// IPC Handlers
// System information
ipcMain.handle('get-platform', () => {
  return process.platform;
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
  const executablePath = getResourcePath(EXECUTABLE_NAME);
  const chatDbPath = getChatDbPath(inputFolder);

  return new Promise((resolve) => {
    exec(`"${executablePath}" -p "${chatDbPath}" -t`, (error, stdout, stderr) => {
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
  const { inputFolder, outputFolder, startDate, endDate, selectedContacts } = exportParams;

  try {
    const uniqueOutputFolder = await createUniqueFolder(outputFolder);
    const executablePath = getResourcePath(EXECUTABLE_NAME);
    const chatDbPath = getChatDbPath(inputFolder);

    let params = `-f txt -c compatible -p "${chatDbPath}" -o "${uniqueOutputFolder}"`;
    if (startDate) params += ` -s ${startDate}`;
    if (endDate) params += ` -e ${endDate}`;

    if (selectedContacts && selectedContacts.length > 0) {
      selectedContacts.forEach(contact => {
        params += contact.includes(',') ? ` -n "${contact}"` : ` -n ${contact}`;
      });
    }

    return new Promise((resolve) => {
      exec(`"${executablePath}" ${params}`, (error, stdout, stderr) => {
        if (error) {
          resolve({ success: false, error: error.message });
        } else {
          resolve({ success: true, outputFolder: uniqueOutputFolder });
        }
      });
    });
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Utility functions
function getResourcePath(fileName) {
  return app.isPackaged
    ? path.join(process.resourcesPath, fileName)
    : path.join(__dirname, '..', 'resources', fileName);
}

async function createUniqueFolder(basePath) {
  let folderName = 'imessage-export';
  let fullPath = path.join(basePath, folderName);
  let counter = 2;

  while (true) {
    try {
      await fs.access(fullPath);
      folderName = `imessage-export(${counter})`;
      fullPath = path.join(basePath, folderName);
      counter++;
    } catch {
      break;
    }
  }

  await fs.mkdir(fullPath, { recursive: true });
  return fullPath;
}

function getChatDbPath(inputPath) {
  if (process.platform === 'darwin' && (inputPath.endsWith('Library/Messages') || inputPath.endsWith('Library/Messages/'))) {
    return path.join(inputPath, 'chat.db');
  }
  return inputPath;
}
