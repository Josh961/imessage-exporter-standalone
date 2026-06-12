import { useCallback, useEffect, useState } from "react";
import { useWizard } from "../../context/wizard-context";
import { useLocalStorage } from "../../hooks/use-local-storage";
import type { IPhoneBackup } from "../../types";
import { BackupPasswordModal } from "../modals/backup-password-modal";

interface Step1BackupSourceProps {
  platform: string;
}

const DEV_BACKUP_ID = "__dev_iphone_backup__";

function isDevBackup(backup: IPhoneBackup) {
  return backup.id === DEV_BACKUP_ID;
}

export function Step1BackupSource({ platform }: Step1BackupSourceProps) {
  const { setBackupSource, setInputFolder, setBackupPassword, setContacts, nextStep } = useWizard();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [backups, setBackups] = useState<IPhoneBackup[]>([]);
  const [backupScanComplete, setBackupScanComplete] = useState(false);
  const [showBackupModal, setShowBackupModal] = useState(false);
  const [showNoBackupsModal, setShowNoBackupsModal] = useState(false);
  const [recheckingBackups, setRecheckingBackups] = useState(false);
  const [recheckFoundNothing, setRecheckFoundNothing] = useState(false);
  const [encryptedBackup, setEncryptedBackup] = useState<IPhoneBackup | null>(null);
  const [backupPasswordError, setBackupPasswordError] = useState<string | null>(null);
  const [unlockingBackup, setUnlockingBackup] = useState(false);
  const [simulateEncryptedBackup] = useLocalStorage("simulateEncryptedBackup", false);

  const isMac = platform === "darwin";
  const isDevelopment = import.meta.env.DEV;
  const shouldAddDevBackup = isDevelopment && isMac;

  const addDevBackup = useCallback(
    async (scannedBackups: IPhoneBackup[]) => {
      if (!shouldAddDevBackup || scannedBackups.some(isDevBackup)) {
        return scannedBackups;
      }

      const defaultFolder = await window.electronAPI.getDefaultMessagesFolder();
      if (!defaultFolder) {
        return scannedBackups;
      }

      return [
        ...scannedBackups,
        {
          id: DEV_BACKUP_ID,
          path: defaultFolder,
          folderName: "Dev iPhone backup",
          backupDate: new Date("2024-01-01T12:00:00Z"),
        },
      ];
    },
    [shouldAddDevBackup],
  );

  // Scan for backups on mount
  useEffect(() => {
    if (!platform) return;

    const scanBackups = async () => {
      let scannedBackups: IPhoneBackup[] = [];
      try {
        const result = await window.electronAPI.scanIphoneBackups();
        if (result.success) {
          scannedBackups = result.backups;
        }
      } catch {
        // Silently fail - will show "No backups found"
      } finally {
        const backupsWithDevBackup = await addDevBackup(scannedBackups);
        setBackups(backupsWithDevBackup);
        setBackupScanComplete(true);
      }
    };
    scanBackups();
  }, [addDevBackup, platform]);

  const handleMacMessages = async () => {
    setLoading(true);
    setError(null);
    try {
      const defaultFolder = await window.electronAPI.getDefaultMessagesFolder();
      if (defaultFolder) {
        setBackupSource("mac-messages");
        setInputFolder(defaultFolder);
        setBackupPassword(null);
        await window.electronAPI.saveLastInputFolder(defaultFolder);
        await loadContacts(defaultFolder);
      }
    } catch {
      setError("Failed to access Mac Messages");
    } finally {
      setLoading(false);
    }
  };

  const handleIphoneBackup = async () => {
    if (backups.length === 0) {
      // No backups found - show help modal
      setRecheckFoundNothing(false);
      setShowNoBackupsModal(true);
    } else if (backups.some(isDevBackup)) {
      setShowBackupModal(true);
    } else if (backups.length === 1) {
      // Only one backup - select it directly
      await selectBackup(backups[0]);
    } else {
      // Multiple backups - show selection modal
      setShowBackupModal(true);
    }
  };

  const selectBackup = async (backup: IPhoneBackup) => {
    setShowBackupModal(false);
    setLoading(true);
    setError(null);
    try {
      setBackupSource("iphone-backup");
      setInputFolder(backup.path);
      setBackupPassword(null);
      await window.electronAPI.saveLastInputFolder(backup.path);
      await loadContacts(backup.path, undefined, backup);
    } catch {
      setError("Failed to load backup");
      setLoading(false);
    }
  };

  const callListContacts = (folder: string, backupPassword?: string) => {
    return backupPassword
      ? window.electronAPI.listContacts(folder, { backupPassword })
      : window.electronAPI.listContacts(folder);
  };

  const loadContacts = async (folder: string, backupPassword?: string, backup?: IPhoneBackup) => {
    try {
      const result =
        isDevelopment && simulateEncryptedBackup && backup && !backupPassword
          ? {
              success: false as const,
              errorCode: "ENCRYPTED_BACKUP_PASSWORD_REQUIRED" as const,
              error: "This iPhone backup is encrypted. Enter the backup password to continue.",
            }
          : await callListContacts(folder, backupPassword);
      if (result.success) {
        const filteredContacts = result.contacts.filter((c) => c.contact && c.messageCount >= 20);
        if (filteredContacts.length === 0) {
          if (backupPassword && backup) {
            setEncryptedBackup(null);
            setBackupPasswordError(null);
          }
          setError("No contacts found with enough messages. Please check your backup.");
          setLoading(false);
          return false;
        }
        setContacts(filteredContacts);
        setBackupPassword(backupPassword || null);
        setLoading(false);
        nextStep();
        return true;
      }

      if (result.errorCode === "ENCRYPTED_BACKUP_PASSWORD_REQUIRED" && backup) {
        setEncryptedBackup(backup);
        setBackupPasswordError(null);
        setLoading(false);
        return false;
      }

      if (result.errorCode === "INVALID_BACKUP_PASSWORD" && backup) {
        setEncryptedBackup(backup);
        setBackupPasswordError(result.error || "That backup password was not accepted. Try again.");
        setLoading(false);
        return false;
      } else {
        if (backupPassword && backup) {
          setEncryptedBackup(backup);
          setBackupPasswordError(result.error || "Failed to unlock this backup. Try again.");
        } else {
          setError(result.error || "Failed to load contacts");
        }
        setLoading(false);
        return false;
      }
    } catch {
      if (backupPassword && backup) {
        setEncryptedBackup(backup);
        setBackupPasswordError("Failed to unlock this backup. Try again.");
      } else {
        setError("Failed to load contacts");
      }
      setLoading(false);
      return false;
    }
  };

  const handleUnlockEncryptedBackup = async (password: string) => {
    if (!encryptedBackup) return;
    setUnlockingBackup(true);
    setBackupPasswordError(null);
    try {
      const loaded = await loadContacts(encryptedBackup.path, password, encryptedBackup);
      if (loaded) {
        setEncryptedBackup(null);
      }
    } finally {
      setUnlockingBackup(false);
    }
  };

  const formatDate = (date: Date) => {
    return new Date(date).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const handleCheckAgain = async () => {
    setRecheckingBackups(true);
    setRecheckFoundNothing(false);
    setBackupScanComplete(false);
    try {
      const result = await window.electronAPI.scanIphoneBackups();
      const backupsWithDevBackup = await addDevBackup(result.success ? result.backups : []);
      setBackups(backupsWithDevBackup);
      if (backupsWithDevBackup.length === 0) {
        // Still nothing - keep the help modal open and let the user know
        setRecheckFoundNothing(true);
      } else {
        setShowNoBackupsModal(false);
        if (backupsWithDevBackup.length === 1 && !isDevBackup(backupsWithDevBackup[0])) {
          await selectBackup(backupsWithDevBackup[0]);
        } else {
          setShowBackupModal(true);
        }
      }
    } catch {
      setRecheckFoundNothing(true);
    } finally {
      setRecheckingBackups(false);
      setBackupScanComplete(true);
    }
  };

  return (
    <>
      <div className="rounded-3xl bg-white p-8 shadow-md ring-1 ring-slate-950/5">
        <h2 className="mb-4 text-center text-2xl font-semibold text-slate-800">
          Choose backup source
        </h2>
        <p className="mb-8 text-center text-slate-600">
          Select where to export your messages from.
        </p>

        {error && (
          <div className="mb-6 rounded-xl bg-red-50 p-4 text-center text-red-700">{error}</div>
        )}

        {loading ? (
          <div className="space-y-4">
            <div className="h-11 w-full animate-pulse rounded-xl bg-slate-200" />
            <div className="max-h-80 overflow-y-auto rounded-xl border border-slate-200">
              {[
                "skeleton-1",
                "skeleton-2",
                "skeleton-3",
                "skeleton-4",
                "skeleton-5",
                "skeleton-6",
              ].map((key) => (
                <div
                  key={key}
                  className="flex items-center justify-between border-b border-slate-100 px-4 py-3 last:border-b-0"
                >
                  <div className="space-y-2">
                    <div className="h-4 w-32 animate-pulse rounded bg-slate-200" />
                    <div className="h-3 w-48 animate-pulse rounded bg-slate-100" />
                  </div>
                  <div className="h-4 w-4 animate-pulse rounded bg-slate-200" />
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className={`grid gap-4 ${isMac ? "sm:grid-cols-2" : ""}`}>
            {isMac && (
              <button
                onClick={handleMacMessages}
                disabled={loading}
                className="flex flex-col items-center rounded-xl border-2 border-slate-200 px-6 py-8 transition-all hover:border-sky-500 hover:bg-sky-50 disabled:opacity-50"
              >
                <svg
                  className="mb-4 h-12 w-12 text-slate-600"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                  />
                </svg>
                <span className="text-lg font-semibold text-slate-800">Mac messages</span>
                <span className="mt-2 text-sm text-slate-500">Export from Messages app</span>
              </button>
            )}

            <button
              onClick={handleIphoneBackup}
              disabled={loading || !backupScanComplete}
              className="flex flex-col items-center rounded-xl border-2 border-slate-200 px-6 py-8 transition-all hover:border-sky-500 hover:bg-sky-50 disabled:opacity-50"
            >
              <svg
                className="mb-4 h-12 w-12 text-slate-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z"
                />
              </svg>
              <span className="text-lg font-semibold text-slate-800">
                {isMac ? "iPhone backup" : "iTunes backup"}
              </span>
              {!backupScanComplete ? (
                <span className="mt-2 text-sm text-slate-400">Scanning...</span>
              ) : backups.length === 0 ? (
                <span className="mt-2 text-sm text-slate-500">No backups found</span>
              ) : backups.length === 1 && isDevBackup(backups[0]) ? (
                <span className="mt-2 text-sm text-amber-600">Dev backup available</span>
              ) : backups.length === 1 ? (
                <span className="mt-2 text-sm text-slate-500">
                  {formatDate(backups[0].backupDate)}
                </span>
              ) : (
                <span className="mt-2 text-sm text-sky-600">{backups.length} backups found</span>
              )}
            </button>
          </div>
        )}
      </div>

      {/* Multiple backups modal */}
      {showBackupModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setShowBackupModal(false)}
        >
          <div
            className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="mb-6 text-xl font-semibold text-slate-800">Select iPhone backup</h2>
            <div className="max-h-80 space-y-3 overflow-y-auto p-1">
              {backups.map((backup, index) => (
                <button
                  key={backup.id}
                  onClick={() => selectBackup(backup)}
                  className={`flex w-full items-center justify-between rounded-xl border px-5 py-4 text-left transition-all hover:border-sky-500 hover:bg-sky-50 ${
                    index === 0
                      ? "border-sky-300 bg-sky-50/50 ring-1 ring-sky-200"
                      : "border-slate-200"
                  }`}
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-slate-700">
                      {isDevBackup(backup) ? "Dev iPhone backup" : formatDate(backup.backupDate)}
                    </div>
                    <div className="mt-1 truncate text-xs text-slate-500">
                      {isDevBackup(backup)
                        ? "Uses Mac Messages data in dev"
                        : backup.folderName || backup.path}
                    </div>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
                      isDevBackup(backup)
                        ? "bg-amber-100 text-amber-800"
                        : index === 0
                          ? "bg-sky-100 text-sky-700"
                          : "hidden"
                    }`}
                  >
                    {isDevBackup(backup) ? "DEV" : "Latest"}
                  </span>
                </button>
              ))}
            </div>
            <div className="mt-6 flex justify-end">
              <button
                onClick={() => setShowBackupModal(false)}
                className="rounded-lg border border-slate-300 px-6 py-2 font-medium text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* No backups found modal */}
      {showNoBackupsModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setShowNoBackupsModal(false)}
        >
          <div
            className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="mb-4 text-xl font-semibold text-slate-800">No iPhone backups found</h2>
            <p className="mb-6 text-slate-600">
              To export messages from your iPhone, you'll need to create a local backup first.
            </p>

            <div className="rounded-xl bg-slate-50 p-5">
              <h3 className="mb-3 font-semibold text-slate-800">
                {isMac ? "How to create a backup on Mac:" : "How to create a backup:"}
              </h3>
              {isMac ? (
                <ol className="list-inside list-decimal space-y-2 text-sm text-slate-700">
                  <li>Connect your iPhone to your Mac with a cable</li>
                  <li>In the Finder sidebar, select your iPhone</li>
                  <li>
                    Click <span className="font-semibold">General</span> at the top
                  </li>
                  <li>
                    Select <span className="font-semibold">"Back up all data to this Mac"</span>
                    <div className="ml-5 mt-1">
                      <span className="rounded bg-amber-100 px-2 py-0.5 text-xs text-slate-700">
                        If encrypted, keep the password handy
                      </span>
                    </div>
                  </li>
                  <li>
                    Click <span className="font-semibold">Back Up Now</span>
                  </li>
                </ol>
              ) : (
                <ol className="list-inside list-decimal space-y-2 text-sm text-slate-700">
                  <li>Connect your iPhone via USB cable</li>
                  <li>Open iTunes and click the device button</li>
                  <li>
                    Click <span className="font-semibold">Summary</span>
                  </li>
                  <li>
                    Click <span className="font-semibold">Back Up Now</span>
                    <div className="ml-5 mt-1 space-y-1 text-xs">
                      <div>Save locally (not iCloud)</div>
                      <span className="rounded bg-amber-100 px-2 py-0.5 text-slate-700">
                        If encrypted, keep the password handy
                      </span>
                    </div>
                  </li>
                </ol>
              )}
            </div>

            <p className="mt-4 text-center text-sm text-slate-500">
              After creating a backup, click "Check again" below.
            </p>

            {recheckFoundNothing && (
              <div className="mt-4 rounded-xl bg-amber-50 p-3 text-center text-sm text-amber-800">
                Still no backups found. Make sure the backup has finished, then check again.
              </div>
            )}

            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => setShowNoBackupsModal(false)}
                className="rounded-lg border border-slate-300 px-6 py-2 font-medium text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={handleCheckAgain}
                disabled={recheckingBackups}
                className="rounded-lg bg-sky-500 px-6 py-2 font-medium text-white hover:bg-sky-600 disabled:opacity-50"
              >
                {recheckingBackups ? "Checking..." : "Check again"}
              </button>
            </div>
          </div>
        </div>
      )}

      {encryptedBackup && (
        <BackupPasswordModal
          backupName={encryptedBackup.folderName || "this iPhone backup"}
          error={backupPasswordError}
          loading={unlockingBackup}
          onCancel={() => {
            setEncryptedBackup(null);
            setBackupPasswordError(null);
          }}
          onSubmit={handleUnlockEncryptedBackup}
        />
      )}
    </>
  );
}
