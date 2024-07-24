const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  runExporter: (params) => ipcRenderer.invoke('run-exporter', params),
  selectFolder: () => ipcRenderer.invoke('select-folder'),
  expandPath: (path) => ipcRenderer.invoke('expand-path', path),
  checkPathExists: (path) => ipcRenderer.invoke('check-path-exists', path),
  getNestedFolders: (path) => ipcRenderer.invoke('get-nested-folders', path),
  getDocumentsFolder: () => ipcRenderer.invoke('get-documents-folder'),
  selectFolder: (currentPath, type) => ipcRenderer.invoke('select-folder', currentPath, type),
  getLastInputFolder: () => ipcRenderer.invoke('get-last-input-folder'),
  getLastOutputFolder: () => ipcRenderer.invoke('get-last-output-folder'),
  openExternalLink: (url) => ipcRenderer.invoke('open-external-link', url),
  saveLastInputFolder: (folder) => ipcRenderer.invoke('save-last-input-folder', folder),
  saveLastOutputFolder: (folder) => ipcRenderer.invoke('save-last-output-folder', folder),
  listContacts: (inputFolder) => ipcRenderer.invoke('list-contacts', inputFolder)
});
