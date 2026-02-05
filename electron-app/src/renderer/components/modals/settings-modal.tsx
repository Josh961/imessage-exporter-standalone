import { useEffect, useState } from 'react';
import { useWizard } from '../../context/wizard-context';
import { useLocalStorage } from '../../hooks/use-local-storage';

interface SettingsModalProps {
  onClose: () => void;
}

export function SettingsModal({ onClose }: SettingsModalProps) {
  const { state, setOutputFolder, setInputFolder } = useWizard();
  const [debugMode, setDebugMode] = useLocalStorage('debugMode', false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [onClose]);

  const handleSelectOutputFolder = async () => {
    const result = await window.electronAPI.selectFolder(state.outputFolder, 'output');
    if (result) {
      setOutputFolder(result);
      await window.electronAPI.saveLastOutputFolder(result);
    }
  };

  const handleSelectInputFolder = async () => {
    const result = await window.electronAPI.selectFolder(state.inputFolder, 'input');
    if (result) {
      setInputFolder(result);
      await window.electronAPI.saveLastInputFolder(result);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h2 className="mb-6 text-xl font-semibold text-slate-800">Settings</h2>

        <div className="space-y-6">
          {/* Output folder */}
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700">Export destination folder</label>
            <div className="flex gap-2">
              <input type="text" value={state.outputFolder} readOnly className="flex-1 truncate rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-600" />
              <button onClick={handleSelectOutputFolder} className="shrink-0 rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
                Change
              </button>
            </div>
          </div>

          {/* Debug mode */}
          <div className="flex items-center justify-between">
            <div>
              <label className="text-sm font-medium text-slate-700">Debug mode</label>
              <p className="text-xs text-slate-500">Create log file with export details</p>
            </div>
            <button onClick={() => setDebugMode(!debugMode)} className={`relative h-6 w-11 rounded-full transition-colors ${debugMode ? 'bg-sky-500' : 'bg-slate-300'}`}>
              <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${debugMode ? 'left-[22px]' : 'left-0.5'}`} />
            </button>
          </div>

          {/* Advanced settings */}
          <div className="border-t border-slate-200 pt-4">
            <button onClick={() => setShowAdvanced(!showAdvanced)} className="flex w-full items-center justify-between text-sm font-medium text-slate-600 hover:text-slate-800">
              <span>Advanced settings</span>
              <svg className={`h-4 w-4 transition-transform ${showAdvanced ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {showAdvanced && (
              <div className="mt-4 space-y-4">
                {/* Custom input folder */}
                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700">Custom input folder</label>
                  <p className="mb-2 text-xs text-slate-500">Override the backup source with a custom folder.</p>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={state.inputFolder}
                      readOnly
                      className="flex-1 truncate rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-600"
                    />
                    <button
                      onClick={handleSelectInputFolder}
                      className="shrink-0 rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
                      Change
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="mt-6 flex justify-end">
          <button onClick={onClose} className="rounded-lg border border-slate-300 px-6 py-2 font-medium text-slate-700 hover:bg-slate-50">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
