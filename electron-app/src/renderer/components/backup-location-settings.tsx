import { useCallback, useEffect, useState } from "react";
import { formatBytes } from "../lib/format-bytes";
import type { BackupLocationStatus, StoredBackup } from "../types";

type PendingAction =
  | { kind: "move"; location: BackupLocationStatus; targetBase: string }
  | { kind: "revert"; location: BackupLocationStatus };

interface StoredBackupItem extends StoredBackup {
  locationId: string;
}

function getVisibleLocations(locations: BackupLocationStatus[]): BackupLocationStatus[] {
  // Only show locations Apple software actually uses on this machine; if none
  // exist yet (no backup ever made), offer the primary default so the user can
  // still pick a drive before their first backup.
  const activeLocations = locations.filter((location) => location.exists);
  if (activeLocations.length > 0) return activeLocations;
  return locations.length > 0 ? [locations[0]] : [];
}

interface BackupLocationSettingsProps {
  // Notifies the host that stored backups changed (location moved/reverted or
  // a backup deleted), so screens showing scanned backups can refresh
  onBackupsChanged?: () => void;
}

export function BackupLocationSettings({ onBackupsChanged }: BackupLocationSettingsProps) {
  const [locations, setLocations] = useState<BackupLocationStatus[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [revertNotice, setRevertNotice] = useState<string | null>(null);
  const [showBackups, setShowBackups] = useState(false);
  const [backups, setBackups] = useState<StoredBackupItem[] | null>(null);
  const [pendingDelete, setPendingDelete] = useState<StoredBackupItem | null>(null);

  const refreshLocations = useCallback(async () => {
    try {
      const result = await window.electronAPI.getBackupLocations();
      if (result.success) {
        setLocations(result.locations);
        return result.locations;
      }
    } catch {
      // Leave the previous state in place
    } finally {
      setLoaded(true);
    }
    return null;
  }, []);

  const refreshBackups = useCallback(async (forLocations: BackupLocationStatus[]) => {
    const items: StoredBackupItem[] = [];
    for (const location of getVisibleLocations(forLocations)) {
      const result = await window.electronAPI.listStoredBackups(location.id);
      if (result.success) {
        items.push(
          ...result.backups.map((backup) => Object.assign(backup, { locationId: location.id })),
        );
      }
    }
    items.sort((a, b) => new Date(b.backupDate).getTime() - new Date(a.backupDate).getTime());
    setBackups(items);
  }, []);

  useEffect(() => {
    refreshLocations();
  }, [refreshLocations]);

  if (!loaded || locations.length === 0) {
    return null;
  }

  const visibleLocations = getVisibleLocations(locations);

  const startMove = async (location: BackupLocationStatus) => {
    setError(null);
    setNotice(null);
    setRevertNotice(null);
    const folder = await window.electronAPI.selectFolder("", "backup-target");
    if (folder) {
      setPending({ kind: "move", location, targetBase: folder });
    }
  };

  const startRevert = (location: BackupLocationStatus) => {
    setError(null);
    setNotice(null);
    setRevertNotice(null);
    setPending({ kind: "revert", location });
  };

  const confirmPending = async () => {
    if (!pending) return;
    setBusy(true);
    setError(null);
    try {
      const result =
        pending.kind === "move"
          ? await window.electronAPI.relocateBackupLocation(pending.location.id, pending.targetBase)
          : await window.electronAPI.revertBackupLocation(pending.location.id);
      if (result.success) {
        const updated = locations.map((location) =>
          location.id === result.location.id ? result.location : location,
        );
        setLocations(updated);
        // The moved state is already visible under the input box ("✓ Moved"),
        // so only the revert needs its own confirmation message.
        if (pending.kind === "revert") {
          setRevertNotice("Done! iPhone backups will be saved in the original location again.");
        }
        if (showBackups) {
          await refreshBackups(updated);
        }
        onBackupsChanged?.();
      } else {
        setError(result.error);
      }
    } catch {
      setError("Something went wrong while changing the backup location.");
    } finally {
      setPending(null);
      setBusy(false);
    }
  };

  const cancelPending = () => {
    if (busy) return;
    setPending(null);
  };

  const toggleBackups = async () => {
    setError(null);
    setNotice(null);
    setPendingDelete(null);
    if (showBackups) {
      setShowBackups(false);
      return;
    }
    setShowBackups(true);
    setBackups(null);
    await refreshBackups(locations);
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    setBusy(true);
    setError(null);
    try {
      const result = await window.electronAPI.deleteStoredBackup(
        pendingDelete.locationId,
        pendingDelete.source,
        pendingDelete.folderName,
      );
      if (result.success) {
        setNotice(`Backup deleted. Freed ${formatBytes(pendingDelete.sizeBytes)}.`);
        const updated = (await refreshLocations()) ?? locations;
        await refreshBackups(updated);
        onBackupsChanged?.();
      } else {
        setError(result.error || "Failed to delete this backup.");
      }
    } catch {
      setError("Failed to delete this backup.");
    } finally {
      setPendingDelete(null);
      setBusy(false);
    }
  };

  const describeBackupItem = (item: StoredBackupItem) => {
    if (item.source === "previous") return "old backups on this computer";
    const location = locations.find((entry) => entry.id === item.locationId);
    return location?.isLink ? "on the selected drive" : "on this computer";
  };

  const formatBackupDate = (backupDate: Date) =>
    new Date(backupDate).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });

  const totalStoredBytes = (backups ?? []).reduce((sum, backup) => sum + backup.sizeBytes, 0);

  return (
    <div>
      <div className="mb-2 block text-sm font-medium text-slate-700">iPhone backup location</div>
      <p className="mb-2 text-xs text-slate-500">
        Where iTunes, Apple Devices, or Finder saves new iPhone backups. Move it to another drive if
        this computer is low on space.
      </p>

      <div className="space-y-3">
        {visibleLocations.map((location) => (
          <div key={location.id}>
            {visibleLocations.length > 1 && (
              <div className="mb-1 text-xs font-medium text-slate-600">{location.label}</div>
            )}
            <div className="flex gap-2">
              <input
                aria-label={`Backup location (${location.label})`}
                type="text"
                value={location.isLink ? (location.linkTarget ?? "") : location.defaultPath}
                readOnly
                className="flex-1 truncate rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-600"
              />
              {location.isLink ? (
                <button
                  onClick={() => startRevert(location)}
                  disabled={busy}
                  className="shrink-0 rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  Revert
                </button>
              ) : (
                <button
                  onClick={() => startMove(location)}
                  disabled={busy}
                  className="shrink-0 rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  Move…
                </button>
              )}
            </div>
            {location.isLink && (
              <p className="mt-1 text-xs text-emerald-600">
                ✓ Moved. Future backups are saved to this drive.
              </p>
            )}
            {location.isLink && !location.targetExists && (
              <p className="mt-1 text-xs text-amber-600">
                This drive isn&apos;t connected right now. Connect it before backing up your iPhone,
                or revert to store backups on this computer again.
              </p>
            )}
          </div>
        ))}
      </div>

      {revertNotice && <p className="mt-2 text-xs text-emerald-600">{revertNotice}</p>}

      {pending && (
        <div className="mt-3 rounded-lg border border-sky-200 bg-sky-50 p-3">
          <p className="text-xs text-slate-700">
            {pending.kind === "move" ? (
              <>
                Future iPhone backups will be saved to a{" "}
                <span className="font-medium">MobileSync ⁄ Backup</span> folder inside{" "}
                <span className="font-medium">{pending.targetBase}</span>.
                {pending.location.backupCount > 0 && (
                  <>
                    {" "}
                    Your{" "}
                    {pending.location.backupCount === 1
                      ? "existing backup stays"
                      : `${pending.location.backupCount} existing backups stay`}{" "}
                    on this computer. Nothing is copied, and you can delete them here later to free
                    up space.
                  </>
                )}
              </>
            ) : (
              <>
                New backups will be saved to{" "}
                <span className="font-medium">{pending.location.defaultPath}</span> again.
                {pending.location.previousBackupCount > 0 &&
                  " Your previous backups will be restored."}{" "}
                Backups already on the other drive stay there.
              </>
            )}{" "}
            Quit iTunes, Apple Devices, or Finder before continuing.
          </p>
          <div className="mt-3 flex gap-2">
            <button
              onClick={confirmPending}
              disabled={busy}
              className="rounded-lg bg-sky-500 px-4 py-2 text-sm font-medium text-white hover:bg-sky-400 disabled:opacity-50"
            >
              {busy
                ? "Working…"
                : pending.kind === "move"
                  ? "Change location"
                  : "Restore default location"}
            </button>
            <button
              onClick={cancelPending}
              disabled={busy}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="mt-3">
        <button
          onClick={toggleBackups}
          disabled={busy}
          className="text-xs font-medium text-sky-600 hover:text-sky-500 disabled:opacity-50"
        >
          {showBackups ? "Hide stored backups" : "Manage stored backups (free up space)"}
        </button>

        {showBackups && (
          <div className="mt-2 rounded-lg border border-slate-200">
            {backups === null ? (
              <p className="p-3 text-xs text-slate-500">Checking stored backups…</p>
            ) : backups.length === 0 ? (
              <p className="p-3 text-xs text-slate-500">No stored backups found.</p>
            ) : (
              <>
                <ul className="divide-y divide-slate-100">
                  {backups.map((backup) => {
                    const key = `${backup.locationId}:${backup.source}:${backup.folderName}`;
                    const isPendingDelete =
                      pendingDelete !== null &&
                      pendingDelete.locationId === backup.locationId &&
                      pendingDelete.source === backup.source &&
                      pendingDelete.folderName === backup.folderName;
                    return (
                      <li key={key} className="p-3" title={backup.path}>
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <div className="text-sm text-slate-700">
                              iPhone backup · {formatBackupDate(backup.backupDate)}
                            </div>
                            <div className="truncate text-xs text-slate-500">
                              {formatBytes(backup.sizeBytes)} · {describeBackupItem(backup)}
                            </div>
                          </div>
                          {!isPendingDelete && (
                            <button
                              onClick={() => {
                                setError(null);
                                setNotice(null);
                                setPendingDelete(backup);
                              }}
                              disabled={busy}
                              aria-label={`Delete backup from ${formatBackupDate(backup.backupDate)}`}
                              className="shrink-0 rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
                            >
                              Delete
                            </button>
                          )}
                        </div>
                        {isPendingDelete && (
                          <div className="mt-2 rounded-lg border border-red-200 bg-red-50 p-2">
                            <p className="text-xs text-red-700">
                              Delete this backup permanently and free{" "}
                              {formatBytes(backup.sizeBytes)}? This can&apos;t be undone.
                            </p>
                            <div className="mt-2 flex gap-2">
                              <button
                                onClick={confirmDelete}
                                disabled={busy}
                                className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-500 disabled:opacity-50"
                              >
                                {busy ? "Deleting…" : "Delete backup"}
                              </button>
                              <button
                                onClick={() => setPendingDelete(null)}
                                disabled={busy}
                                className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
                <p className="border-t border-slate-200 p-3 text-xs text-slate-500">
                  Total: {formatBytes(totalStoredBytes)}
                </p>
              </>
            )}
          </div>
        )}
      </div>

      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
      {notice && <p className="mt-2 text-xs text-emerald-600">{notice}</p>}
    </div>
  );
}
