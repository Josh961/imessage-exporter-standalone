import fs from "fs/promises";
import path from "path";

// Apple's backup tools (iTunes, Apple Devices, Finder) always write to a fixed
// MobileSync/Backup folder. The supported way to store backups elsewhere is to
// replace that folder with a link: a directory junction on Windows (works
// without admin rights) or a symlink on macOS. These helpers manage that link
// for FUTURE backups only — existing backups are never copied to the new
// drive; they are set aside next to the link (as "Backup (old)") where the
// user can delete them to free up space.

const PREVIOUS_FOLDER_BASE_NAME = "Backup (old)";
const PREVIOUS_FOLDER_PATTERN = /^Backup \(old( \d+)?\)$/i;

export class BackupLocationError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "BackupLocationError";
    this.code = code;
    this.friendly = true;
  }
}

export function getDefaultBackupLocations({ platform, home, appData }) {
  if (platform === "darwin") {
    return [
      {
        id: "mac-mobilesync",
        label: "Finder iPhone backups",
        defaultPath: path.join(home, "Library", "Application Support", "MobileSync", "Backup"),
      },
    ];
  }
  if (platform === "win32") {
    return [
      {
        id: "win-apple-devices",
        label: "Apple Devices & Microsoft Store iTunes",
        defaultPath: path.join(home, "Apple", "MobileSync", "Backup"),
      },
      {
        id: "win-itunes-desktop",
        label: "iTunes (desktop installer)",
        defaultPath: path.join(appData, "Apple Computer", "MobileSync", "Backup"),
      },
    ];
  }
  return [];
}

export async function getBackupLocationStatus(location) {
  const { defaultPath } = location;
  let exists = false;
  let isLink = false;
  let linkTarget = null;
  let targetExists = false;

  let linkStats = null;
  try {
    linkStats = await fs.lstat(defaultPath);
  } catch {
    // Folder doesn't exist yet (no backup has ever been made)
  }

  if (linkStats) {
    exists = true;
    if (linkStats.isSymbolicLink()) {
      isLink = true;
      try {
        linkTarget = normalizeLinkTarget(await fs.readlink(defaultPath));
      } catch {
        linkTarget = null;
      }
      try {
        targetExists = (await fs.stat(defaultPath)).isDirectory();
      } catch {
        targetExists = false;
      }
    }
  }

  const backupCount = await countBackupFolders(defaultPath);

  const previousPaths = await findPreviousBackupFolders(defaultPath);
  let previousBackupCount = 0;
  for (const previousPath of previousPaths) {
    previousBackupCount += await countBackupFolders(previousPath);
  }

  return {
    ...location,
    exists,
    isLink,
    linkTarget,
    targetExists,
    backupCount,
    previousPaths,
    previousBackupCount,
  };
}

// Points the default backup path at targetBase/MobileSync/Backup for future
// backups. Existing backups stay on this computer, renamed aside so the link
// can take the folder's place.
export async function relocateBackupLocation({ location, targetBase, platform }) {
  const { defaultPath } = location;

  let targetBaseStats;
  try {
    targetBaseStats = await fs.stat(targetBase);
  } catch {
    targetBaseStats = null;
  }
  if (!targetBaseStats || !targetBaseStats.isDirectory()) {
    throw new BackupLocationError(
      "TARGET_MISSING",
      "That folder isn't available. Reconnect the drive and try again.",
    );
  }

  const status = await getBackupLocationStatus(location);
  if (status.isLink) {
    throw new BackupLocationError(
      "ALREADY_MOVED",
      "This backup location has already been moved. Revert it first to move it somewhere else.",
    );
  }

  const target = path.resolve(path.join(targetBase, "MobileSync", "Backup"));
  if (isSamePath(target, defaultPath, platform)) {
    throw new BackupLocationError(
      "SAME_LOCATION",
      "Backups are already stored in that folder. Choose a different folder.",
    );
  }
  if (isInsidePath(defaultPath, target, platform)) {
    throw new BackupLocationError(
      "TARGET_INSIDE_SOURCE",
      "Choose a folder that isn't inside the current backup folder.",
    );
  }

  await fs.mkdir(target, { recursive: true });

  if (status.exists) {
    // Keep existing backups on this computer, set aside next to the link
    await fs.rename(defaultPath, await findAvailablePreviousPath(defaultPath));
  } else {
    await fs.mkdir(path.dirname(defaultPath), { recursive: true });
  }

  await fs.symlink(target, defaultPath, platform === "win32" ? "junction" : "dir");

  return getBackupLocationStatus(location);
}

// Removes the link so future backups are saved on this computer again. Any
// set-aside previous backups are restored; backups already saved on the other
// drive stay there.
export async function revertBackupLocation({ location, platform }) {
  const { defaultPath } = location;

  const status = await getBackupLocationStatus(location);
  if (!status.isLink) {
    throw new BackupLocationError(
      "NOT_MOVED",
      "This backup location hasn't been moved, so there's nothing to revert.",
    );
  }

  if (platform === "win32") {
    await fs.rmdir(defaultPath);
  } else {
    await fs.unlink(defaultPath);
  }

  const restorablePath = path.join(path.dirname(defaultPath), PREVIOUS_FOLDER_BASE_NAME);
  if (await isDirectory(restorablePath)) {
    await fs.rename(restorablePath, defaultPath);
  } else {
    await fs.mkdir(defaultPath, { recursive: true });
  }

  return getBackupLocationStatus(location);
}

// Lists every stored backup this location knows about: backups in the active
// folder (through the link when moved) and previous backups set aside by a
// move, with sizes so the user can decide what to delete.
export async function listStoredBackups(location) {
  const { defaultPath } = location;
  const backups = [];

  await collectBackups(defaultPath, "current", backups);
  for (const previousPath of await findPreviousBackupFolders(defaultPath)) {
    await collectBackups(previousPath, "previous", backups);
  }

  return backups.toSorted((a, b) => b.backupDate - a.backupDate);
}

export async function deleteStoredBackup({ location, source, folderName }) {
  if (
    typeof folderName !== "string" ||
    folderName.length === 0 ||
    folderName === "." ||
    folderName === ".." ||
    path.basename(folderName) !== folderName
  ) {
    throw new BackupLocationError("NOT_FOUND", "That backup could not be found.");
  }

  const { defaultPath } = location;
  let backupPath = null;
  let containingFolder = null;

  if (source === "current") {
    containingFolder = defaultPath;
    backupPath = path.join(defaultPath, folderName);
  } else if (source === "previous") {
    for (const previousPath of await findPreviousBackupFolders(defaultPath)) {
      const candidate = path.join(previousPath, folderName);
      if (await isDirectory(candidate)) {
        containingFolder = previousPath;
        backupPath = candidate;
        break;
      }
    }
  }

  if (!backupPath || !(await isDirectory(backupPath))) {
    throw new BackupLocationError("NOT_FOUND", "That backup could not be found.");
  }

  await fs.rm(backupPath, { recursive: true, force: true });

  // A previous-backups folder that is now empty is just clutter — remove it
  if (source === "previous") {
    await removeIfEmpty(containingFolder);
  }
}

// All folders a backup scanner should look in for these locations: each
// active folder (read through the link when moved) plus any set-aside
// previous folders, so existing backups stay visible after a move.
export async function getScannableBackupPaths(locations) {
  const paths = [];
  for (const location of locations) {
    paths.push(location.defaultPath);
    paths.push(...(await findPreviousBackupFolders(location.defaultPath)));
  }
  return paths;
}

async function collectBackups(folder, source, backups) {
  let entries;
  try {
    entries = await fs.readdir(folder, { withFileTypes: true });
  } catch {
    return; // Missing or unreadable (e.g. linked drive disconnected)
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const backupPath = path.join(folder, entry.name);

    // Finder reuses one folder per device, so the folder's own dates reflect
    // the first-ever backup. Status.plist is rewritten when each backup
    // finishes, making its mtime the date of the latest backup.
    let backupDate;
    try {
      backupDate = (await fs.stat(path.join(backupPath, "Status.plist"))).mtime;
    } catch {
      backupDate = (await fs.stat(backupPath)).mtime;
    }

    backups.push({
      folderName: entry.name,
      path: backupPath,
      source,
      backupDate,
      sizeBytes: await directorySize(backupPath),
    });
  }
}

async function findPreviousBackupFolders(defaultPath) {
  const parent = path.dirname(defaultPath);
  let entries;
  try {
    entries = await fs.readdir(parent, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries
    .filter((entry) => entry.isDirectory() && PREVIOUS_FOLDER_PATTERN.test(entry.name))
    .map((entry) => path.join(parent, entry.name))
    .toSorted();
}

async function findAvailablePreviousPath(defaultPath) {
  const parent = path.dirname(defaultPath);
  let candidate = path.join(parent, PREVIOUS_FOLDER_BASE_NAME);
  let counter = 2;
  while (await pathExists(candidate)) {
    candidate = path.join(parent, `Backup (old ${counter})`);
    counter++;
  }
  return candidate;
}

async function countBackupFolders(folder) {
  try {
    const entries = await fs.readdir(folder, { withFileTypes: true });
    return entries.filter((entry) => entry.isDirectory()).length;
  } catch {
    return 0;
  }
}

async function pathExists(checkPath) {
  try {
    await fs.lstat(checkPath);
    return true;
  } catch {
    return false;
  }
}

async function isDirectory(checkPath) {
  try {
    return (await fs.stat(checkPath)).isDirectory();
  } catch {
    return false;
  }
}

function normalizeLinkTarget(target) {
  const withoutPrefix = target.replace(/^\\\\\?\\/, "");
  const trimmed = withoutPrefix.replace(/[\\/]+$/, "");
  return trimmed.length > 0 ? trimmed : withoutPrefix;
}

function normalizeForCompare(inputPath, platform) {
  const resolved = path.resolve(inputPath);
  return platform === "win32" ? resolved.toLowerCase() : resolved;
}

function isSamePath(a, b, platform) {
  return normalizeForCompare(a, platform) === normalizeForCompare(b, platform);
}

function isInsidePath(parent, child, platform) {
  const relative = path.relative(
    normalizeForCompare(parent, platform),
    normalizeForCompare(child, platform),
  );
  return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
}

async function directorySize(dir) {
  let total = 0;
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      total += await directorySize(entryPath);
    } else if (entry.isFile()) {
      total += (await fs.stat(entryPath)).size;
    }
  }
  return total;
}

async function removeIfEmpty(dir) {
  try {
    await fs.rmdir(dir);
    return true;
  } catch {
    return false;
  }
}
