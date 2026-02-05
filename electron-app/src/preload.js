const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // System information
  getPlatform: () => ipcRenderer.invoke('get-platform'),

  // Permissions modal operations
  onShowPermissionsModal: (callback) => ipcRenderer.on('show-permissions-modal', callback),
  openSystemPreferences: () => ipcRenderer.invoke('open-system-preferences'),
  checkFullDiskAccess: () => ipcRenderer.invoke('check-full-disk-access'),
  restartApp: () => ipcRenderer.invoke('restart-app'),

  // File and folder operations
  openExternalLink: (url) => ipcRenderer.invoke('open-external-link', url),
  expandPath: (inputPath) => ipcRenderer.invoke('expand-path', inputPath),
  checkPathExists: (checkPath) => ipcRenderer.invoke('check-path-exists', checkPath),
  getNestedFolders: (folderPath) => ipcRenderer.invoke('get-nested-folders', folderPath),
  getDocumentsFolder: () => ipcRenderer.invoke('get-documents-folder'),
  selectFolder: (currentPath, type) => ipcRenderer.invoke('select-folder', currentPath, type),
  showItemInFolder: (filePath) => ipcRenderer.invoke('show-item-in-folder', filePath),

  // Store operations
  getLastInputFolder: () => ipcRenderer.invoke('get-last-input-folder'),
  getLastOutputFolder: () => ipcRenderer.invoke('get-last-output-folder'),
  saveLastInputFolder: (folder) => ipcRenderer.invoke('save-last-input-folder', folder),
  saveLastOutputFolder: (folder) => ipcRenderer.invoke('save-last-output-folder', folder),

  // Backup folder operations
  getDefaultMessagesFolder: () => ipcRenderer.invoke('get-default-messages-folder'),
  scanIphoneBackups: () => ipcRenderer.invoke('scan-iphone-backups'),

  // iMessage exporter operations
  listContacts: (inputFolder) => ipcRenderer.invoke('list-contacts', inputFolder),
  runExporter: (exportParams) => ipcRenderer.invoke('run-exporter', exportParams),

  // Progress updates
  onExportProgress: (callback) => {
    ipcRenderer.on('export-progress', (event, data) => callback(data));
    return () => ipcRenderer.removeAllListeners('export-progress');
  }
});
