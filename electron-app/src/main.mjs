import archiver from 'archiver';
import { exec, spawn } from 'child_process';
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

// Utility functions for filtering
function normalizeIdentifier(identifier) {
  let normalized = identifier.replace(/[\+\s\(\)\-\.]/g, '');

  // For emails, convert to lowercase for case-insensitive matching
  if (normalized.includes('@')) {
    normalized = normalized.toLowerCase();
  }

  return normalized;
}

function identifiersMatch(filter, handle) {
  // Check for exact match first
  if (filter === handle) {
    return true;
  }

  // For phone numbers (both long and short), try intelligent matching
  const bothAreNumeric = !handle.includes('@') &&
    !filter.includes('@') &&
    /^\d+$/.test(handle) &&
    /^\d+$/.test(filter);

  if (bothAreNumeric) {
    // For long phone numbers (10+ digits), use suffix matching
    if (handle.length >= 10 && filter.length >= 10) {
      const handleSuffix = handle.slice(-10);
      const filterSuffix = filter.slice(-10);
      return handleSuffix === filterSuffix;
    }

    // For shorter numbers (5-9 digits), try suffix matching with the shorter length
    // This handles toll-free numbers, short codes, etc.
    if (handle.length >= 5 && filter.length >= 5) {
      const minLen = Math.min(handle.length, filter.length);
      const handleSuffix = handle.slice(-minLen);
      const filterSuffix = filter.slice(-minLen);
      return handleSuffix === filterSuffix;
    }
  }

  return false;
}

function extractIdentifiersFromFilename(filename) {
  // Remove .txt extension
  const nameWithoutExt = filename.replace(/\.txt$/, '');

  // Split by common separators and clean up
  const parts = nameWithoutExt.split(/[_\-\s,]+/).filter(part => part.length > 0);

  const identifiers = [];
  for (const part of parts) {
    // Check if it looks like an email
    if (part.includes('@')) {
      identifiers.push(part);
    }
    // Check if it looks like a phone number (5+ digits)
    else if (/\d{5,}/.test(part)) {
      // Extract the numeric part
      const numbers = part.match(/\d+/g);
      if (numbers) {
        identifiers.push(...numbers.filter(num => num.length >= 5));
      }
    }
  }

  return identifiers;
}

let mainWindow;

// Define executables for different platforms and architectures
const EXECUTABLES = {
  darwin: {
    arm64: 'imessage-exporter-mac-arm64',
    x64: 'imessage-exporter-mac-x64'
  },
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
    width: 1200,
    height: 950,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // In development, load from Vite dev server
  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
    mainWindow.webContents.openDevTools();
  } else {
    // In production, load from dist folder (relative to app root)
    const indexPath = app.isPackaged
      ? path.join(process.resourcesPath, '..', 'dist', 'index.html')
      : path.join(__dirname, '..', 'dist', 'index.html');
    mainWindow.loadFile(indexPath);
  }

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
ipcMain.handle('show-item-in-folder', (event, filePath) => shell.showItemInFolder(filePath));

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

// Backup folder operations
ipcMain.handle('get-default-messages-folder', () => {
  if (process.platform === 'darwin') {
    return path.join(app.getPath('home'), 'Library', 'Messages');
  }
  return '';
});

ipcMain.handle('scan-iphone-backups', async () => {
  let backupPath;

  if (process.platform === 'darwin') {
    backupPath = path.join(app.getPath('home'), 'Library', 'Application Support', 'MobileSync', 'Backup');
  } else if (process.platform === 'win32') {
    // Windows iTunes backup location
    backupPath = path.join(app.getPath('home'), 'Apple', 'MobileSync', 'Backup');
  } else {
    return { success: false, backups: [] };
  }

  try {
    // Check if backup directory exists
    await fs.access(backupPath);

    // Get all directories in the backup folder
    const entries = await fs.readdir(backupPath, { withFileTypes: true });
    const backupDirs = entries.filter(entry => entry.isDirectory());

    // Simply list the folders with their creation dates
    const backups = [];
    for (const entry of backupDirs) {
      const fullPath = path.join(backupPath, entry.name);
      const stats = await fs.stat(fullPath);

      backups.push({
        id: entry.name,
        path: fullPath,
        folderName: entry.name,
        backupDate: stats.birthtime  // Use birthtime for creation date
      });
    }

    // Sort by creation date, newest first
    backups.sort((a, b) => b.backupDate - a.backupDate);

    return { success: true, backups };
  } catch (error) {
    return { success: false, backups: [], error: error.message };
  }
});

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
            const parts = line.split('|');
            if (parts[0] === 'CONTACT') {
              // CONTACT format: CONTACT|contact_id|message_count|first_date|last_date
              const [type, contact, messageCount, firstMessageDate, lastMessageDate] = parts;
              return {
                type,
                contact,
                messageCount: parseInt(messageCount),
                firstMessageDate,
                lastMessageDate
              };
            } else if (parts[0] === 'GROUP') {
              // GROUP format: GROUP|name|message_count|first_date|last_date|participants
              const [type, contact, messageCount, firstMessageDate, lastMessageDate, participants] = parts;
              return {
                type,
                contact,
                messageCount: parseInt(messageCount),
                firstMessageDate,
                lastMessageDate,
                participants
              };
            } else {
              // Skip any other lines (like Total DMs, Total Group Chats, etc.)
              return null;
            }
          })
          .filter(contact => contact !== null)
          .sort((a, b) => {
            const dateA = new Date(a.lastMessageDate).getTime() || 0;
            const dateB = new Date(b.lastMessageDate).getTime() || 0;
            return dateB - dateA;
          });
        resolve({ success: true, contacts });
      }
    });
  });
});

ipcMain.handle('run-exporter', async (event, exportParams) => {
  const { inputFolder, outputFolder, startDate, endDate, selectedContacts, includeVideos = true, debugMode, isFullExport, isFilteredExport } = exportParams;

  try {
    const uniqueTempFolder = await createUniqueFolder(outputFolder);
    const uniqueZipPath = await getUniqueZipPath(outputFolder);
    const executablePath = getResourcePath();
    const chatDbPath = getChatDbPath(inputFolder);

    let params = [];
    params.push('-f', 'txt', '-c', 'basic', '-b');
    if (!includeVideos) params.push('-v');
    params.push('-p', chatDbPath, '-o', uniqueTempFolder);
    if (startDate) params.push('-s', startDate);
    if (endDate) params.push('-e', endDate);

    if (!isFullExport && !isFilteredExport && selectedContacts && selectedContacts.length > 0) {
      const contactsString = selectedContacts.map(contact =>
        contact.includes(',') ? `"${contact}"` : contact
      ).join(';');
      params.push('-t', contactsString);
    }

    return new Promise((resolve) => {
      const exportProcess = spawn(executablePath, params);
      let stdout = '';
      let stderr = '';

      // Listen for progress updates from the Rust exporter
      exportProcess.stdout.on('data', (data) => {
        const output = data.toString();
        stdout += output;

        // Parse progress updates
        const lines = output.split('\n');
        for (const line of lines) {
          if (line.startsWith('PROGRESS_JSON: ')) {
            try {
              const progressData = JSON.parse(line.substring('PROGRESS_JSON: '.length));
              // Send progress update to renderer
              if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('export-progress', progressData);
              }
            } catch (e) {
              // Ignore JSON parse errors
            }
          }
        }
      });

      exportProcess.stderr.on('data', (data) => {
        const output = data.toString();
        stderr += output;

        // Also check stderr for progress updates (Rust might write there)
        const lines = output.split('\n');
        for (const line of lines) {
          if (line.startsWith('PROGRESS_JSON: ')) {
            try {
              const progressData = JSON.parse(line.substring('PROGRESS_JSON: '.length));
              // Send progress update to renderer
              if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('export-progress', progressData);
              }
            } catch (e) {
              // Ignore JSON parse errors
            }
          }
        }
      });

      exportProcess.on('close', async (code) => {
        const error = code !== 0 ? new Error(`Process exited with code ${code}`) : null;
        const command = `"${executablePath}" ${params.join(' ')}`;
        const debugLogContent = debugMode ?
          `Command: ${command}\n\nOutput:\n${stdout}\n\nErrors:\n${stderr}${error ? '\n\nError:\n' + error.message : ''}` :
          null;

        if (error) {
          if (debugMode) {
            const { fullPath: debugLogPath } = await createUniqueName(outputFolder, 'debug', '.log');
            await fs.writeFile(debugLogPath, debugLogContent);
          }
          await deleteTempFolder(uniqueTempFolder);
          resolve({ success: false, error: error.message + (debugMode ? ' Debug log has been written to the export folder.' : '') });
        } else {
          try {
            // Keep progress bar at 100% during post-processing (zipping, filtering)
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.webContents.send('export-progress', { phase: 'complete', current: 0, total: 0, percentage: 100, message: 'Finalizing...' });
            }

            if (stdout.includes('No chatrooms were found with the supplied contacts.')) {
              if (debugMode) {
                const { fullPath: debugLogPath } = await createUniqueName(outputFolder, 'debug', '.log');
                await fs.writeFile(debugLogPath, debugLogContent);
              }
              await deleteTempFolder(uniqueTempFolder);
              resolve({ success: false, error: 'No chats were found with the supplied contacts.' + (debugMode ? ' Debug log has been written to the export folder.' : '') });
              return;
            }

            await sanitizeFileNames(uniqueTempFolder);

            let filteringLog = '';
            if (isFilteredExport && selectedContacts && selectedContacts.length > 0) {
              filteringLog = await filterExportedFiles(uniqueTempFolder, selectedContacts);
            }

            if (debugMode) {
              const fullDebugContent = debugLogContent + (filteringLog ? '\n\n=== FILTERING LOG ===\n' + filteringLog : '');
              await fs.writeFile(path.join(uniqueTempFolder, 'debug.log'), fullDebugContent);
            }

            // Check if we actually exported any messages (excluding orphaned.txt)
            const files = await fs.readdir(uniqueTempFolder);
            const txtFiles = files.filter(file => file.endsWith('.txt') && file !== 'orphaned.txt');
            const hasMessages = txtFiles.length > 0;

            if (!hasMessages) {
              // No messages found - don't create zip, just clean up and return
              await deleteTempFolder(uniqueTempFolder);
              resolve({ success: true, hasMessages: false });
              return;
            }

            const finalZipPath = await zipFolder(uniqueTempFolder, uniqueZipPath);
            resolve({ success: true, zipPath: finalZipPath, hasMessages });
          } catch (err) {
            if (debugMode) {
              const { fullPath: debugLogPath } = await createUniqueName(outputFolder, 'debug', '.log');
              await fs.writeFile(debugLogPath, debugLogContent);
            }
            await deleteTempFolder(uniqueTempFolder);
            resolve({ success: false, error: err.message + (debugMode ? ' Debug log has been written to the export folder.' : '') });
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
  if (process.platform === 'darwin') {
    // Detect CPU architecture for macOS
    const arch = process.arch; // Will be 'arm64' for Apple Silicon or 'x64' for Intel
    return EXECUTABLES.darwin[arch] || EXECUTABLES.darwin.x64; // Default to x64 if arch not recognized
  }
  return EXECUTABLES[process.platform] || EXECUTABLES.win32; // Default to Windows executable if platform is not recognized
}

async function createUniqueFolder(basePath) {
  const { fullPath } = await createUniqueName(basePath, 'imessage-export-temp');
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
      await deleteTempFolder(folderPath);
      resolve(zipPath);
    });
    archive.on('error', reject);

    archive.pipe(output);
    archive.directory(folderPath, false);
    archive.finalize();
  });
}

async function deleteTempFolder(folderPath) {
  try {
    await rm(folderPath, { recursive: true, force: true });
  } catch (error) {
    console.error('Error deleting temp folder:', error);
  }
}

async function filterExportedFiles(tempFolder, selectedContacts) {
  const logMessages = [];

  try {
    const files = await fs.readdir(tempFolder);
    const txtFiles = files.filter(file => file.endsWith('.txt'));

    logMessages.push(`Starting filtered export cleanup...`);
    logMessages.push(`Found ${txtFiles.length} conversation files to process`);
    logMessages.push(`Selected contacts: ${JSON.stringify(selectedContacts, null, 2)}`);

    // Helper function to check if a group matches
    const isGroupMatch = (filename, selectedContact) => {
      if (!Array.isArray(selectedContact)) return false;

      const filenameIdentifiers = extractIdentifiersFromFilename(filename);
      const normalizedFilename = filenameIdentifiers.map(normalizeIdentifier);
      const normalizedSelected = selectedContact.map(normalizeIdentifier);

      // Check if all selected contacts have a match in the filename
      return normalizedSelected.every(selectedId =>
        normalizedFilename.some(filenameId => identifiersMatch(selectedId, filenameId))
      ) && normalizedSelected.length === normalizedFilename.length;
    };

    // Helper function to check if an individual contact matches EXACTLY (no group chats)
    const isIndividualMatch = (filename, selectedContact) => {
      if (Array.isArray(selectedContact)) return false;

      const filenameIdentifiers = extractIdentifiersFromFilename(filename);
      const normalizedFilename = filenameIdentifiers.map(normalizeIdentifier);
      const normalizedSelected = normalizeIdentifier(selectedContact);

      // For individual contacts, the file should contain EXACTLY one identifier that matches
      const result = normalizedFilename.length === 1 &&
        normalizedFilename.some(filenameId => identifiersMatch(normalizedSelected, filenameId));

      return result;
    };

    // Determine which files to keep
    const filesToKeep = new Set();

    logMessages.push(`\nAnalyzing conversation files...`);
    for (const txtFile of txtFiles) {
      const shouldKeep = selectedContacts.some(selectedContact => {
        if (Array.isArray(selectedContact)) {
          return isGroupMatch(txtFile, selectedContact);
        } else {
          return isIndividualMatch(txtFile, selectedContact);
        }
      });

      if (shouldKeep) {
        filesToKeep.add(txtFile);
        // Log which contact type matched
        const matchingContact = selectedContacts.find(selectedContact => {
          if (Array.isArray(selectedContact)) {
            return isGroupMatch(txtFile, selectedContact);
          } else {
            return isIndividualMatch(txtFile, selectedContact);
          }
        });

        if (Array.isArray(matchingContact)) {
          logMessages.push(`✓ Keeping group chat file: ${txtFile} (matches ${matchingContact.join(', ')})`);
        } else {
          logMessages.push(`✓ Keeping individual chat file: ${txtFile} (matches ${matchingContact})`);
        }
      } else {
        logMessages.push(`✗ Will delete unmatched file: ${txtFile}`);
      }
    }

    // Delete files that don't match selected contacts
    logMessages.push(`\nDeleting unmatched conversation files...`);
    for (const txtFile of txtFiles) {
      if (!filesToKeep.has(txtFile)) {
        const filePath = path.join(tempFolder, txtFile);
        await fs.unlink(filePath);
        logMessages.push(`Deleted: ${txtFile}`);
      }
    }

    // Handle attachments folder - only keep attachments referenced by kept files
    const attachmentsFolder = path.join(tempFolder, 'attachments');
    try {
      await fs.access(attachmentsFolder);

      // Read all kept txt files to find referenced attachments
      const referencedAttachmentPaths = new Set();

      logMessages.push(`\nScanning kept files for attachment references...`);
      for (const keptFile of filesToKeep) {
        const filePath = path.join(tempFolder, keptFile);
        const content = await fs.readFile(filePath, 'utf8');
        const lines = content.split('\n');
        let attachmentCount = 0;

        for (const line of lines) {
          const trimmedLine = line.trim();
          // Check if line looks like an attachment path (starts with "attachments\" or "attachments/")
          if (trimmedLine.startsWith('attachments\\') || trimmedLine.startsWith('attachments/')) {
            // Normalize path separators and add to referenced set
            const normalizedPath = trimmedLine.replace(/\\/g, '/');
            referencedAttachmentPaths.add(normalizedPath);
            attachmentCount++;
          }
        }

        if (attachmentCount > 0) {
          logMessages.push(`Found ${attachmentCount} attachment references in ${keptFile}`);
        }
      }

      logMessages.push(`Total unique attachments referenced: ${referencedAttachmentPaths.size}`);

      // Recursively process attachments folder to delete unreferenced files and empty folders
      const attachmentLog = await cleanupAttachmentsFolder(attachmentsFolder, referencedAttachmentPaths, tempFolder);
      logMessages.push(...attachmentLog);

    } catch (error) {
      // Attachments folder doesn't exist, which is fine
      logMessages.push('No attachments folder found');
    }

    logMessages.push(`\n=== FILTERING SUMMARY ===`);
    logMessages.push(`Kept ${filesToKeep.size} out of ${txtFiles.length} conversation files`);
    logMessages.push(`Deleted ${txtFiles.length - filesToKeep.size} conversation files`);
    logMessages.push(`Filtered export cleanup complete`);

    return logMessages.join('\n');

  } catch (error) {
    logMessages.push(`ERROR during filtering: ${error.message}`);
    logMessages.push(`Stack trace: ${error.stack}`);
    return logMessages.join('\n');
  }
}

async function cleanupAttachmentsFolder(attachmentsFolder, referencedAttachmentPaths, tempFolder) {
  const logMessages = [];

  try {
    // Get all subdirectories in attachments folder (like "25", "26", etc.)
    const attachmentSubdirs = await fs.readdir(attachmentsFolder, { withFileTypes: true });

    logMessages.push(`\nProcessing attachments folder with ${attachmentSubdirs.length} subdirectories...`);

    for (const subdir of attachmentSubdirs) {
      if (subdir.isDirectory()) {
        const subdirPath = path.join(attachmentsFolder, subdir.name);
        const subdirFiles = await fs.readdir(subdirPath);
        let hasReferencedFiles = false;
        let keptCount = 0;
        let deletedCount = 0;

        // Check each file in the subdirectory
        for (const fileName of subdirFiles) {
          const relativePath = `attachments/${subdir.name}/${fileName}`;

          if (referencedAttachmentPaths.has(relativePath)) {
            hasReferencedFiles = true;
            keptCount++;
          } else {
            // Delete unreferenced file
            const filePath = path.join(subdirPath, fileName);
            await fs.unlink(filePath);
            deletedCount++;
          }
        }

        logMessages.push(`Subdirectory ${subdir.name}: kept ${keptCount}, deleted ${deletedCount} files`);

        // If no files are left in the subdirectory, delete the subdirectory
        if (!hasReferencedFiles) {
          try {
            await fs.rmdir(subdirPath);
            logMessages.push(`Deleted empty attachment subdirectory: ${subdir.name}`);
          } catch (error) {
            // Directory might not be empty due to hidden files, etc.
            logMessages.push(`Could not delete subdirectory ${subdir.name}: ${error.message}`);
          }
        }
      }
    }

    // Check if attachments folder is now empty and delete if so
    try {
      const remainingItems = await fs.readdir(attachmentsFolder);
      if (remainingItems.length === 0) {
        await fs.rmdir(attachmentsFolder);
        logMessages.push('Deleted empty attachments folder');
      } else {
        logMessages.push(`Attachments folder still contains ${remainingItems.length} items`);
      }
    } catch (error) {
      logMessages.push(`Could not delete attachments folder: ${error.message}`);
    }

  } catch (error) {
    logMessages.push(`ERROR cleaning up attachments folder: ${error.message}`);
  }

  return logMessages;
}
