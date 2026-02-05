export type BackupSource = 'mac-messages' | 'iphone-backup';

export interface Contact {
  type: 'CONTACT' | 'GROUP';
  contact: string;
  messageCount: number;
  firstMessageDate: string;
  lastMessageDate: string;
  participants?: string;
  displayName?: string;
}

export interface IPhoneBackup {
  id: string;
  path: string;
  folderName: string;
  backupDate: Date;
}

export interface ExportProgress {
  phase: 'scanning' | 'exporting' | 'copying-attachments' | 'complete';
  current: number;
  total: number;
  percentage: number;
  message?: string;
}

export interface ExportResult {
  success: boolean;
  zipPath?: string;
  hasMessages?: boolean;
  error?: string;
}

export interface ExportParams {
  inputFolder: string;
  outputFolder: string;
  startDate: string;
  endDate?: string;
  selectedContacts: (string | string[])[];
  includeVideos: boolean;
  debugMode: boolean;
  isFullExport?: boolean;
  isFilteredExport?: boolean;
}

export type WizardStep = 1 | 2 | 3 | 4;

export interface WizardState {
  currentStep: WizardStep;
  backupSource: BackupSource | null;
  inputFolder: string;
  outputFolder: string;
  contacts: Contact[];
  selectedContact: Contact | null;
  startDate: string;
  endDate: string;
  exportStatus: 'idle' | 'exporting' | 'success' | 'error';
  exportProgress: ExportProgress | null;
  exportError: string | null;
  exportZipPath: string | null;
}

// Electron API types
export interface ElectronAPI {
  getPlatform: () => Promise<string>;
  onShowPermissionsModal: (callback: () => void) => void;
  openSystemPreferences: () => Promise<void>;
  checkFullDiskAccess: () => Promise<boolean>;
  restartApp: () => Promise<void>;
  openExternalLink: (url: string) => Promise<void>;
  expandPath: (inputPath: string) => Promise<string>;
  checkPathExists: (checkPath: string) => Promise<boolean>;
  getNestedFolders: (folderPath: string) => Promise<string[]>;
  getDocumentsFolder: () => Promise<string>;
  selectFolder: (currentPath: string, type: 'input' | 'output') => Promise<string | null>;
  showItemInFolder: (filePath: string) => Promise<void>;
  getLastInputFolder: () => Promise<string>;
  getLastOutputFolder: () => Promise<string>;
  saveLastInputFolder: (folder: string) => Promise<void>;
  saveLastOutputFolder: (folder: string) => Promise<void>;
  getDefaultMessagesFolder: () => Promise<string>;
  scanIphoneBackups: () => Promise<{ success: boolean; backups: IPhoneBackup[]; error?: string; }>;
  listContacts: (inputFolder: string) => Promise<{ success: boolean; contacts: Contact[]; error?: string; }>;
  runExporter: (exportParams: ExportParams) => Promise<ExportResult>;
  onExportProgress: (callback: (data: ExportProgress) => void) => () => void;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
