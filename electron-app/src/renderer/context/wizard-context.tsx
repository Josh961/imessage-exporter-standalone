import { createContext, ReactNode, useCallback, useContext, useEffect, useReducer } from 'react';
import type { BackupSource, Contact, ExportProgress, WizardState, WizardStep } from '../types';

type WizardAction =
  | { type: 'SET_STEP'; step: WizardStep }
  | { type: 'SET_BACKUP_SOURCE'; source: BackupSource }
  | { type: 'SET_INPUT_FOLDER'; folder: string }
  | { type: 'SET_OUTPUT_FOLDER'; folder: string }
  | { type: 'SET_CONTACTS'; contacts: Contact[] }
  | { type: 'SET_SELECTED_CONTACT'; contact: Contact | null }
  | { type: 'SET_START_DATE'; date: string }
  | { type: 'SET_END_DATE'; date: string }
  | { type: 'SET_EXPORT_STATUS'; status: WizardState['exportStatus'] }
  | { type: 'SET_EXPORT_PROGRESS'; progress: ExportProgress | null }
  | { type: 'SET_EXPORT_ERROR'; error: string | null }
  | { type: 'SET_EXPORT_ZIP_PATH'; path: string | null }
  | { type: 'RESET' };

const initialState: WizardState = {
  currentStep: 1,
  backupSource: null,
  inputFolder: '',
  outputFolder: '',
  contacts: [],
  selectedContact: null,
  startDate: '',
  endDate: '',
  exportStatus: 'idle',
  exportProgress: null,
  exportError: null,
  exportZipPath: null,
};

function wizardReducer(state: WizardState, action: WizardAction): WizardState {
  switch (action.type) {
    case 'SET_STEP':
      return { ...state, currentStep: action.step };
    case 'SET_BACKUP_SOURCE':
      return { ...state, backupSource: action.source };
    case 'SET_INPUT_FOLDER':
      return { ...state, inputFolder: action.folder };
    case 'SET_OUTPUT_FOLDER':
      return { ...state, outputFolder: action.folder };
    case 'SET_CONTACTS':
      return { ...state, contacts: action.contacts };
    case 'SET_SELECTED_CONTACT':
      return { ...state, selectedContact: action.contact };
    case 'SET_START_DATE':
      return { ...state, startDate: action.date };
    case 'SET_END_DATE':
      return { ...state, endDate: action.date };
    case 'SET_EXPORT_STATUS':
      return { ...state, exportStatus: action.status };
    case 'SET_EXPORT_PROGRESS':
      return { ...state, exportProgress: action.progress };
    case 'SET_EXPORT_ERROR':
      return { ...state, exportError: action.error };
    case 'SET_EXPORT_ZIP_PATH':
      return { ...state, exportZipPath: action.path };
    case 'RESET':
      return { ...initialState, outputFolder: state.outputFolder };
    default:
      return state;
  }
}

interface WizardContextValue {
  state: WizardState;
  nextStep: () => void;
  prevStep: () => void;
  setBackupSource: (source: BackupSource) => void;
  setInputFolder: (folder: string) => void;
  setOutputFolder: (folder: string) => void;
  setContacts: (contacts: Contact[]) => void;
  setSelectedContact: (contact: Contact | null) => void;
  setStartDate: (date: string) => void;
  setEndDate: (date: string) => void;
  setExportStatus: (status: WizardState['exportStatus']) => void;
  setExportProgress: (progress: ExportProgress | null) => void;
  setExportError: (error: string | null) => void;
  setExportZipPath: (path: string | null) => void;
  reset: () => void;
}

const WizardContext = createContext<WizardContextValue | null>(null);

export function WizardProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(wizardReducer, initialState);

  const nextStep = useCallback(() => {
    if (state.currentStep < 4) {
      dispatch({ type: 'SET_STEP', step: (state.currentStep + 1) as WizardStep });
    }
  }, [state.currentStep]);

  const prevStep = useCallback(() => {
    if (state.currentStep > 1) {
      dispatch({ type: 'SET_STEP', step: (state.currentStep - 1) as WizardStep });
    }
  }, [state.currentStep]);

  const setBackupSource = useCallback((source: BackupSource) => {
    dispatch({ type: 'SET_BACKUP_SOURCE', source });
  }, []);

  const setInputFolder = useCallback((folder: string) => {
    dispatch({ type: 'SET_INPUT_FOLDER', folder });
  }, []);

  const setOutputFolder = useCallback((folder: string) => {
    dispatch({ type: 'SET_OUTPUT_FOLDER', folder });
  }, []);

  const setContacts = useCallback((contacts: Contact[]) => {
    dispatch({ type: 'SET_CONTACTS', contacts });
  }, []);

  const setSelectedContact = useCallback((contact: Contact | null) => {
    dispatch({ type: 'SET_SELECTED_CONTACT', contact });
  }, []);

  const setStartDate = useCallback((date: string) => {
    dispatch({ type: 'SET_START_DATE', date });
  }, []);

  const setEndDate = useCallback((date: string) => {
    dispatch({ type: 'SET_END_DATE', date });
  }, []);

  const setExportStatus = useCallback((status: WizardState['exportStatus']) => {
    dispatch({ type: 'SET_EXPORT_STATUS', status });
  }, []);

  const setExportProgress = useCallback((progress: ExportProgress | null) => {
    dispatch({ type: 'SET_EXPORT_PROGRESS', progress });
  }, []);

  const setExportError = useCallback((error: string | null) => {
    dispatch({ type: 'SET_EXPORT_ERROR', error });
  }, []);

  const setExportZipPath = useCallback((path: string | null) => {
    dispatch({ type: 'SET_EXPORT_ZIP_PATH', path });
  }, []);

  const reset = useCallback(() => {
    dispatch({ type: 'RESET' });
  }, []);

  // Initialize output folder from electron store
  useEffect(() => {
    const initOutputFolder = async () => {
      const lastOutput = await window.electronAPI.getLastOutputFolder();
      if (lastOutput) {
        dispatch({ type: 'SET_OUTPUT_FOLDER', folder: lastOutput });
      } else {
        const documentsFolder = await window.electronAPI.getDocumentsFolder();
        dispatch({ type: 'SET_OUTPUT_FOLDER', folder: documentsFolder });
      }
    };
    initOutputFolder();
  }, []);

  return (
    <WizardContext.Provider
      value={{
        state,
        nextStep,
        prevStep,
        setBackupSource,
        setInputFolder,
        setOutputFolder,
        setContacts,
        setSelectedContact,
        setStartDate,
        setEndDate,
        setExportStatus,
        setExportProgress,
        setExportError,
        setExportZipPath,
        reset,
      }}>
      {children}
    </WizardContext.Provider>
  );
}

export function useWizard() {
  const context = useContext(WizardContext);
  if (!context) {
    throw new Error('useWizard must be used within a WizardProvider');
  }
  return context;
}
