import { vi } from "vitest";
import type { ElectronAPI } from "../types";

export type MockElectronAPI = {
  [Key in keyof ElectronAPI]: ReturnType<typeof vi.fn>;
};

export function installMockElectronAPI(overrides: Partial<MockElectronAPI> = {}): MockElectronAPI {
  const api: MockElectronAPI = {
    getPlatform: vi.fn().mockResolvedValue("darwin"),
    onShowPermissionsModal: vi.fn(),
    openSystemPreferences: vi.fn().mockResolvedValue(undefined),
    checkFullDiskAccess: vi.fn().mockResolvedValue(true),
    restartApp: vi.fn().mockResolvedValue(undefined),
    openExternalLink: vi.fn().mockResolvedValue(undefined),
    expandPath: vi.fn((inputPath: string) => Promise.resolve(inputPath)),
    checkPathExists: vi.fn().mockResolvedValue(true),
    getNestedFolders: vi.fn().mockResolvedValue([]),
    getDocumentsFolder: vi.fn().mockResolvedValue("/exports"),
    selectFolder: vi.fn().mockResolvedValue(null),
    showItemInFolder: vi.fn().mockResolvedValue(undefined),
    getLastInputFolder: vi.fn().mockResolvedValue("/messages"),
    getLastOutputFolder: vi.fn().mockResolvedValue("/exports"),
    saveLastInputFolder: vi.fn().mockResolvedValue(undefined),
    saveLastOutputFolder: vi.fn().mockResolvedValue(undefined),
    getDefaultMessagesFolder: vi.fn().mockResolvedValue("/messages"),
    scanIphoneBackups: vi.fn().mockResolvedValue({ success: true, backups: [] }),
    listContacts: vi.fn().mockResolvedValue({ success: true, contacts: [] }),
    runExporter: vi
      .fn()
      .mockResolvedValue({ success: true, hasMessages: true, zipPath: "/exports/book.zip" }),
    onExportProgress: vi.fn().mockReturnValue(vi.fn()),
    ...overrides,
  };

  Object.defineProperty(window, "electronAPI", {
    configurable: true,
    value: api,
  });

  return api;
}
