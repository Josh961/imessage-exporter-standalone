import { useCallback } from 'react';
import { useWizard } from '../../context/wizard-context';
import { useLocalStorage } from '../../hooks/use-local-storage';
import { ProgressBar } from '../progress-bar';

export function Step4Export() {
  const { state, setExportStatus, setExportProgress, setExportError, setExportZipPath, prevStep, reset } = useWizard();

  const [debugMode] = useLocalStorage('debugMode', false);

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    date.setMinutes(date.getMinutes() + date.getTimezoneOffset());
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const getContactName = (): string => {
    if (!state.selectedContact) return '';
    return state.selectedContact.displayName || state.selectedContact.contact;
  };

  const getDateRangeText = (): string => {
    const start = formatDate(state.startDate);
    if (state.endDate) {
      return `${start} to ${formatDate(state.endDate)}`;
    }
    return `${start} onwards`;
  };

  const runExport = useCallback(async () => {
    if (!state.selectedContact) return;

    setExportStatus('exporting');
    setExportError(null);
    setExportProgress(null);

    // Prepare selected contacts for export
    let selectedContacts: (string | string[])[];
    if (state.selectedContact.type === 'GROUP' && state.selectedContact.participants) {
      selectedContacts = [state.selectedContact.participants.split(',').map((p) => p.trim())];
    } else {
      selectedContacts = [state.selectedContact.contact];
    }

    const unsubscribe = window.electronAPI.onExportProgress((progressData) => {
      setExportProgress(progressData);
    });

    try {
      const result = await window.electronAPI.runExporter({
        inputFolder: state.inputFolder,
        outputFolder: state.outputFolder,
        startDate: state.startDate,
        endDate: state.endDate || '',
        selectedContacts,
        includeVideos: true, // Always include videos in simplified version
        debugMode,
        isFullExport: false,
      });

      unsubscribe();

      if (result.success) {
        if (result.hasMessages === false) {
          setExportStatus('error');
          setExportError('No messages found in the specified date range.');
        } else {
          setExportStatus('success');
          setExportZipPath(result.zipPath || null);
        }
      } else {
        setExportStatus('error');
        setExportError(result.error || 'Export failed');
      }
    } catch (err) {
      unsubscribe();
      setExportStatus('error');
      setExportError(err instanceof Error ? err.message : 'An unexpected error occurred');
    }
  }, [
    state.selectedContact,
    state.inputFolder,
    state.outputFolder,
    state.startDate,
    state.endDate,
    debugMode,
    setExportStatus,
    setExportError,
    setExportProgress,
    setExportZipPath,
  ]);

  // Auto-start is disabled; user must click Export

  const handleExportAnother = () => {
    reset();
  };

  const getProgressText = (): string => {
    if (!state.exportProgress) return 'Initializing...';

    switch (state.exportProgress.phase) {
      case 'scanning':
        return state.exportProgress.message || `Scanning... found ${state.exportProgress.total.toLocaleString()} messages`;
      case 'exporting':
        return `Exporting: ${state.exportProgress.current.toLocaleString()} / ${state.exportProgress.total.toLocaleString()}`;
      case 'copying-attachments':
        return `Copying attachments: ${state.exportProgress.current.toLocaleString()} / ${state.exportProgress.total.toLocaleString()}`;
      case 'complete':
        return 'Export complete!';
      default:
        return 'Processing...';
    }
  };

  if (state.exportStatus === 'exporting') {
    return (
      <div className="rounded-3xl bg-white p-8 shadow-md">
        <h2 className="mb-6 text-center text-2xl font-semibold text-slate-800">Exporting messages</h2>
        <ProgressBar percentage={state.exportProgress?.percentage || 0} text={getProgressText()} />
        <p className="mt-4 text-center text-sm text-slate-500">Please don't close the app while exporting.</p>
      </div>
    );
  }

  const handleOpenFolder = async () => {
    if (state.exportZipPath) {
      await window.electronAPI.showItemInFolder(state.exportZipPath);
    }
  };

  if (state.exportStatus === 'success') {
    return (
      <div className="rounded-3xl bg-white p-8 shadow-md">
        <div className="mb-6 flex justify-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
            <svg className="h-8 w-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
        </div>
        <h2 className="mb-2 text-center text-2xl font-semibold text-slate-800">Export complete!</h2>
        <p className="mb-6 text-center text-slate-600">Your messages have been exported successfully.</p>
        {state.exportZipPath && (
          <div className="mb-6 rounded-xl bg-slate-50 p-4">
            <p className="text-sm text-slate-600">
              <span className="font-medium">Saved to:</span>
            </p>
            <p className="mt-1 break-all text-sm text-slate-700">{state.exportZipPath}</p>
          </div>
        )}
        <div className="flex gap-3">
          <button onClick={handleOpenFolder} className="flex-1 rounded-xl border border-slate-300 px-6 py-3 font-semibold text-slate-700 transition-all hover:bg-slate-50">
            Open folder
          </button>
          <button onClick={handleExportAnother} className="flex-1 rounded-xl bg-sky-500 px-6 py-3 font-semibold text-white transition-all hover:bg-sky-600">
            Export another
          </button>
        </div>
      </div>
    );
  }

  if (state.exportStatus === 'error') {
    return (
      <div className="rounded-3xl bg-white p-8 shadow-md">
        <div className="mb-6 flex justify-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-red-100">
            <svg className="h-8 w-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
        </div>
        <h2 className="mb-2 text-center text-2xl font-semibold text-slate-800">Export failed</h2>
        <p className="mb-6 text-center text-red-600">{state.exportError}</p>
        <div className="flex gap-3">
          <button onClick={prevStep} className="flex-1 rounded-xl border border-slate-300 px-6 py-3 font-semibold text-slate-700 transition-all hover:bg-slate-50">
            Go back
          </button>
          <button onClick={runExport} className="flex-1 rounded-xl bg-sky-500 px-6 py-3 font-semibold text-white transition-all hover:bg-sky-600">
            Try again
          </button>
        </div>
      </div>
    );
  }

  // Default: idle state - show summary and export button
  return (
    <div className="rounded-3xl bg-white p-8 shadow-md">
      <h2 className="mb-6 text-center text-2xl font-semibold text-slate-800">Ready to export</h2>

      <div className="mb-6 space-y-4 rounded-xl bg-slate-50 p-4">
        <div className="flex justify-between">
          <span className="text-slate-600">Contact:</span>
          <span className="font-medium text-slate-800">{getContactName()}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-600">Date range:</span>
          <span className="font-medium text-slate-800">{getDateRangeText()}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-600">Messages:</span>
          <span className="font-medium text-slate-800">{state.selectedContact?.messageCount.toLocaleString()} available</span>
        </div>
      </div>

      <div className="flex gap-3">
        <button onClick={prevStep} className="flex-1 rounded-xl border border-slate-300 px-6 py-3 font-semibold text-slate-700 transition-all hover:bg-slate-50">
          Back
        </button>
        <button onClick={runExport} className="flex-1 rounded-xl bg-sky-500 px-6 py-3 font-semibold text-white transition-all hover:bg-sky-600">
          Export messages
        </button>
      </div>
    </div>
  );
}
