import { useEffect, useState } from "react";
import { useWizard } from "../../context/wizard-context";
import { useLocalStorage } from "../../hooks/use-local-storage";
import { BackupLocationSettings } from "../backup-location-settings";
import { BackupPasswordModal } from "./backup-password-modal";

interface SettingsModalProps {
  onClose: () => void;
}

export function SettingsModal({ onClose }: SettingsModalProps) {
  const {
    state,
    setOutputFolder,
    setInputFolder,
    setBackupPassword,
    setContacts,
    setBackupSource,
    resetToContactSelect,
    refreshBackupScan,
  } = useWizard();
  const [debugMode, setDebugMode] = useLocalStorage("debugMode", false);
  const [simulateEncryptedBackup] = useLocalStorage("simulateEncryptedBackup", false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [loadingContacts, setLoadingContacts] = useState(false);
  const [contactsError, setContactsError] = useState<string | null>(null);
  const [pendingInputFolder, setPendingInputFolder] = useState<string | null>(null);
  const [backupPasswordError, setBackupPasswordError] = useState<string | null>(null);
  const [unlockingBackup, setUnlockingBackup] = useState(false);
  const isDevelopment = import.meta.env.DEV;

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [onClose]);

  const handleSelectOutputFolder = async () => {
    const result = await window.electronAPI.selectFolder(state.outputFolder, "output");
    if (result) {
      setOutputFolder(result);
      await window.electronAPI.saveLastOutputFolder(result);
    }
  };

  const handleSelectInputFolder = async () => {
    const result = await window.electronAPI.selectFolder(state.inputFolder, "input");
    if (result) {
      await loadCustomInputFolder(result);
    }
  };

  const callListContacts = (folder: string, backupPassword?: string) => {
    return backupPassword
      ? window.electronAPI.listContacts(folder, { backupPassword })
      : window.electronAPI.listContacts(folder);
  };

  const loadCustomInputFolder = async (folder: string, backupPassword?: string) => {
    setLoadingContacts(true);
    setContactsError(null);
    try {
      const contactsResult =
        isDevelopment && simulateEncryptedBackup && !backupPassword
          ? {
              success: false as const,
              errorCode: "ENCRYPTED_BACKUP_PASSWORD_REQUIRED" as const,
              error: "This iPhone backup is encrypted. Enter the backup password to continue.",
            }
          : await callListContacts(folder, backupPassword);
      if (contactsResult.success) {
        const filteredContacts = contactsResult.contacts.filter(
          (c) => c.contact && c.messageCount >= 20,
        );
        if (filteredContacts.length === 0) {
          setContactsError(
            "No contacts found with enough messages. Please check your backup folder.",
          );
          return false;
        }
        setInputFolder(folder);
        setBackupPassword(backupPassword || null);
        await window.electronAPI.saveLastInputFolder(folder);
        setBackupSource("iphone-backup");
        setContacts(filteredContacts);
        resetToContactSelect();
        onClose();
        return true;
      }

      if (contactsResult.errorCode === "ENCRYPTED_BACKUP_PASSWORD_REQUIRED") {
        setPendingInputFolder(folder);
        setBackupPasswordError(null);
        return false;
      }

      if (contactsResult.errorCode === "INVALID_BACKUP_PASSWORD") {
        setPendingInputFolder(folder);
        setBackupPasswordError(
          contactsResult.error || "That backup password was not accepted. Try again.",
        );
        return false;
      }

      setContactsError(contactsResult.error || "Failed to load contacts from this folder");
      return false;
    } catch {
      setContactsError("Failed to load contacts from this folder");
      return false;
    } finally {
      setLoadingContacts(false);
    }
  };

  const handleUnlockCustomInputFolder = async (password: string) => {
    if (!pendingInputFolder) return;
    setUnlockingBackup(true);
    setBackupPasswordError(null);
    try {
      const loaded = await loadCustomInputFolder(pendingInputFolder, password);
      if (loaded) {
        setPendingInputFolder(null);
      }
    } finally {
      setUnlockingBackup(false);
    }
  };

  const getFolderName = (folder: string) => {
    const normalized = folder.replace(/[\\/]+$/, "");
    const separatorIndex = Math.max(normalized.lastIndexOf("/"), normalized.lastIndexOf("\\"));
    return normalized.slice(separatorIndex + 1) || "this iPhone backup";
  };

  return (
    <>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
        onClick={onClose}
      >
        <div
          className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-6 shadow-xl"
          onClick={(e) => e.stopPropagation()}
        >
          <h2 className="mb-6 text-xl font-semibold text-slate-800">Settings</h2>

          <div className="space-y-6">
            {/* Output folder */}
            <div>
              <label
                htmlFor="output-folder"
                className="mb-2 block text-sm font-medium text-slate-700"
              >
                Export destination folder
              </label>
              <div className="flex gap-2">
                <input
                  id="output-folder"
                  aria-label="Export destination folder"
                  type="text"
                  value={state.outputFolder}
                  readOnly
                  className="flex-1 truncate rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-600"
                />
                <button
                  onClick={handleSelectOutputFolder}
                  className="shrink-0 rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Change
                </button>
              </div>
            </div>

            {/* Debug mode */}
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium text-slate-700">Debug mode</div>
                <p className="text-xs text-slate-500">Create log file with export details</p>
              </div>
              <button
                aria-label="Toggle debug mode"
                onClick={() => setDebugMode(!debugMode)}
                className={`relative h-6 w-11 rounded-full transition-colors ${debugMode ? "bg-sky-500" : "bg-slate-300"}`}
              >
                <span
                  className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${debugMode ? "left-[22px]" : "left-0.5"}`}
                />
              </button>
            </div>

            {/* Advanced settings */}
            <div className="border-t border-slate-200 pt-4">
              <button
                onClick={() => setShowAdvanced(!showAdvanced)}
                className="flex w-full items-center justify-between text-sm font-medium text-slate-600 hover:text-slate-800"
              >
                <span>Advanced settings</span>
                <svg
                  className={`h-4 w-4 transition-transform ${showAdvanced ? "rotate-180" : ""}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 9l-7 7-7-7"
                  />
                </svg>
              </button>

              {showAdvanced && (
                <div className="mt-4 space-y-4">
                  {/* Custom input folder */}
                  <div>
                    <label
                      htmlFor="custom-input-folder"
                      className="mb-2 block text-sm font-medium text-slate-700"
                    >
                      Custom input folder
                    </label>
                    <p className="mb-2 text-xs text-slate-500">
                      Override the backup source with a custom folder.
                    </p>
                    <div className="flex gap-2">
                      <input
                        id="custom-input-folder"
                        aria-label="Custom input folder"
                        type="text"
                        value={state.inputFolder}
                        readOnly
                        className="flex-1 truncate rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-600"
                      />
                      <button
                        onClick={handleSelectInputFolder}
                        disabled={loadingContacts}
                        className="shrink-0 rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                      >
                        {loadingContacts ? "Loading..." : "Change"}
                      </button>
                    </div>
                    {contactsError && <p className="mt-2 text-xs text-red-600">{contactsError}</p>}
                  </div>

                  {/* iPhone backup location */}
                  <BackupLocationSettings onBackupsChanged={refreshBackupScan} />
                </div>
              )}
            </div>
          </div>

          <div className="mt-6 flex justify-end">
            <button
              onClick={onClose}
              className="rounded-lg border border-slate-300 px-6 py-2 font-medium text-slate-700 hover:bg-slate-50"
            >
              Close
            </button>
          </div>
        </div>
      </div>

      {pendingInputFolder && (
        <BackupPasswordModal
          backupName={getFolderName(pendingInputFolder)}
          error={backupPasswordError}
          loading={unlockingBackup}
          onCancel={() => {
            setPendingInputFolder(null);
            setBackupPasswordError(null);
          }}
          onSubmit={handleUnlockCustomInputFolder}
        />
      )}
    </>
  );
}
