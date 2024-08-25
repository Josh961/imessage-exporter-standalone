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

  // Store operations
  getLastInputFolder: () => ipcRenderer.invoke('get-last-input-folder'),
  getLastOutputFolder: () => ipcRenderer.invoke('get-last-output-folder'),
  saveLastInputFolder: (folder) => ipcRenderer.invoke('save-last-input-folder', folder),
  saveLastOutputFolder: (folder) => ipcRenderer.invoke('save-last-output-folder', folder),

  // iMessage exporter operations
  listContacts: (inputFolder) => ipcRenderer.invoke('list-contacts', inputFolder),
  runExporter: (exportParams) => ipcRenderer.invoke('run-exporter', exportParams)
});
