export interface ElectronAPI {
  runExporter: (params: string) => Promise<ExporterResult>;
}

export interface ExporterResult {
  success: boolean;
  output?: string;
  error?: string;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
