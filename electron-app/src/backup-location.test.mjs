// @vitest-environment node
import fs from "fs/promises";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  deleteStoredBackup,
  getBackupLocationStatus,
  getDefaultBackupLocations,
  getScannableBackupPaths,
  listStoredBackups,
  relocateBackupLocation,
  revertBackupLocation,
} from "./backup-location.mjs";

// These tests exercise the real filesystem. Junctions (win32) and symlinks
// (darwin/linux) can both be created without elevated rights, so we always run
// with the real host platform.
const platform = process.platform;

let root;
let defaultPath;
let previousPath;
let targetBase;
let location;

async function writeBackup(basePath, backupId, files = { "Status.plist": "status" }) {
  const backupDir = path.join(basePath, backupId);
  await fs.mkdir(backupDir, { recursive: true });
  for (const [name, content] of Object.entries(files)) {
    const filePath = path.join(backupDir, name);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, content);
  }
  return backupDir;
}

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "backup-location-test-"));
  defaultPath = path.join(root, "home", "Apple", "MobileSync", "Backup");
  previousPath = path.join(root, "home", "Apple", "MobileSync", "Backup (old)");
  targetBase = path.join(root, "external");
  await fs.mkdir(targetBase, { recursive: true });
  location = { id: "test-location", label: "Test", defaultPath };
});

afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true });
});

describe("getDefaultBackupLocations", () => {
  it("returns the Finder MobileSync path on macOS", () => {
    const locations = getDefaultBackupLocations({
      platform: "darwin",
      home: "/Users/jane",
      appData: "/Users/jane/Library/Application Support",
    });
    expect(locations).toHaveLength(1);
    expect(locations[0].defaultPath).toBe(
      path.join("/Users/jane", "Library", "Application Support", "MobileSync", "Backup"),
    );
  });

  it("returns both the Apple Devices and desktop iTunes paths on Windows", () => {
    const locations = getDefaultBackupLocations({
      platform: "win32",
      home: "C:\\Users\\jane",
      appData: "C:\\Users\\jane\\AppData\\Roaming",
    });
    expect(locations.map((entry) => entry.id)).toEqual(["win-apple-devices", "win-itunes-desktop"]);
    expect(locations[0].defaultPath).toBe(
      path.join("C:\\Users\\jane", "Apple", "MobileSync", "Backup"),
    );
    expect(locations[1].defaultPath).toBe(
      path.join("C:\\Users\\jane\\AppData\\Roaming", "Apple Computer", "MobileSync", "Backup"),
    );
  });

  it("returns no locations on other platforms", () => {
    expect(getDefaultBackupLocations({ platform: "linux", home: "/", appData: "/" })).toEqual([]);
  });
});

describe("getBackupLocationStatus", () => {
  it("reports a missing folder", async () => {
    const status = await getBackupLocationStatus(location);
    expect(status).toMatchObject({
      exists: false,
      isLink: false,
      linkTarget: null,
      backupCount: 0,
      previousPaths: [],
      previousBackupCount: 0,
    });
  });

  it("reports a real folder and counts backups", async () => {
    await writeBackup(defaultPath, "device-a");
    await writeBackup(defaultPath, "device-b");
    await fs.writeFile(path.join(defaultPath, "stray-file.txt"), "not a backup");

    const status = await getBackupLocationStatus(location);
    expect(status).toMatchObject({ exists: true, isLink: false, backupCount: 2 });
  });

  it("reports a moved location with its target and set-aside backups", async () => {
    await writeBackup(defaultPath, "device-a");
    await relocateBackupLocation({ location, targetBase, platform });

    const status = await getBackupLocationStatus(location);
    expect(status.isLink).toBe(true);
    expect(status.targetExists).toBe(true);
    expect(path.resolve(status.linkTarget)).toBe(
      path.resolve(path.join(targetBase, "MobileSync", "Backup")),
    );
    expect(status.previousPaths).toEqual([previousPath]);
    expect(status.previousBackupCount).toBe(1);
  });
});

describe("relocateBackupLocation", () => {
  it("sets up a link even when no backup exists yet", async () => {
    const status = await relocateBackupLocation({ location, targetBase, platform });

    expect(status.isLink).toBe(true);
    expect(status.previousPaths).toEqual([]);
    // Writing through the default path must land on the external drive
    await fs.writeFile(path.join(defaultPath, "written-through-link.txt"), "hello");
    const external = await fs.readFile(
      path.join(targetBase, "MobileSync", "Backup", "written-through-link.txt"),
      "utf8",
    );
    expect(external).toBe("hello");
  });

  it("keeps existing backups on this computer, set aside next to the link", async () => {
    await writeBackup(defaultPath, "device-a", {
      "Status.plist": "status-a",
      [path.join("3d", "blob")]: "messages",
    });

    const status = await relocateBackupLocation({ location, targetBase, platform });

    expect(status.isLink).toBe(true);
    // Nothing was copied to the external drive
    expect(status.backupCount).toBe(0);
    // The old backups stayed local, untouched, in "Backup (old)"
    expect(status.previousPaths).toEqual([previousPath]);
    expect(status.previousBackupCount).toBe(1);
    const kept = await fs.readFile(path.join(previousPath, "device-a", "3d", "blob"), "utf8");
    expect(kept).toBe("messages");
  });

  it("picks a numbered set-aside name when Backup (old) already exists", async () => {
    await writeBackup(previousPath, "device-old");
    await writeBackup(defaultPath, "device-a");

    const status = await relocateBackupLocation({ location, targetBase, platform });

    expect(status.previousPaths.toSorted()).toEqual(
      [previousPath, path.join(path.dirname(defaultPath), "Backup (old 2)")].toSorted(),
    );
    expect(status.previousBackupCount).toBe(2);
  });

  it("rejects moving a location that is already moved", async () => {
    await relocateBackupLocation({ location, targetBase, platform });

    await expect(relocateBackupLocation({ location, targetBase, platform })).rejects.toMatchObject({
      code: "ALREADY_MOVED",
    });
  });

  it("rejects a target folder that no longer exists", async () => {
    await expect(
      relocateBackupLocation({ location, targetBase: path.join(root, "unplugged"), platform }),
    ).rejects.toMatchObject({ code: "TARGET_MISSING" });
  });

  it("rejects a target inside the current backup folder", async () => {
    await writeBackup(defaultPath, "device-a");

    await expect(
      relocateBackupLocation({
        location,
        targetBase: path.join(defaultPath, "device-a"),
        platform,
      }),
    ).rejects.toMatchObject({ code: "TARGET_INSIDE_SOURCE" });
  });

  it("rejects a target that resolves to the current location", async () => {
    await writeBackup(defaultPath, "device-a");

    await expect(
      relocateBackupLocation({
        location,
        targetBase: path.join(root, "home", "Apple"),
        platform,
      }),
    ).rejects.toMatchObject({ code: "SAME_LOCATION" });
  });
});

describe("revertBackupLocation", () => {
  it("removes the link and restores the set-aside backups", async () => {
    await writeBackup(defaultPath, "device-a", { "Status.plist": "status-a" });
    await relocateBackupLocation({ location, targetBase, platform });

    const status = await revertBackupLocation({ location, platform });

    expect(status.isLink).toBe(false);
    expect(status.exists).toBe(true);
    expect(status.backupCount).toBe(1);
    expect(status.previousPaths).toEqual([]);
    const restored = await fs.readFile(path.join(defaultPath, "device-a", "Status.plist"), "utf8");
    expect(restored).toBe("status-a");
  });

  it("leaves backups made on the external drive where they are", async () => {
    await relocateBackupLocation({ location, targetBase, platform });
    // Simulate iTunes writing a backup through the link
    await writeBackup(defaultPath, "device-new", { "Status.plist": "new" });

    const status = await revertBackupLocation({ location, platform });

    expect(status.isLink).toBe(false);
    expect(status.backupCount).toBe(0);
    const external = await fs.readFile(
      path.join(targetBase, "MobileSync", "Backup", "device-new", "Status.plist"),
      "utf8",
    );
    expect(external).toBe("new");
  });

  it("recreates an empty default folder when nothing was set aside", async () => {
    await relocateBackupLocation({ location, targetBase, platform });

    const status = await revertBackupLocation({ location, platform });

    expect(status).toMatchObject({ isLink: false, exists: true, backupCount: 0 });
  });

  it("rejects reverting a location that was never moved", async () => {
    await writeBackup(defaultPath, "device-a");

    await expect(revertBackupLocation({ location, platform })).rejects.toMatchObject({
      code: "NOT_MOVED",
    });
  });
});

describe("listStoredBackups", () => {
  it("lists backups from the active folder and set-aside folders with sizes", async () => {
    await writeBackup(defaultPath, "device-a", { "Status.plist": "12345678" });
    await relocateBackupLocation({ location, targetBase, platform });
    await writeBackup(defaultPath, "device-new", {
      "Status.plist": "abc",
      "Manifest.db": "0123456789",
    });

    const backups = await listStoredBackups(location);

    expect(backups).toHaveLength(2);
    const current = backups.find((backup) => backup.source === "current");
    const previous = backups.find((backup) => backup.source === "previous");
    expect(current).toMatchObject({ folderName: "device-new", sizeBytes: 13 });
    expect(previous).toMatchObject({ folderName: "device-a", sizeBytes: 8 });
    expect(previous.path).toBe(path.join(previousPath, "device-a"));
    expect(current.backupDate).toBeInstanceOf(Date);
  });

  it("returns an empty list when nothing is stored", async () => {
    expect(await listStoredBackups(location)).toEqual([]);
  });

  it("still lists local set-aside backups when the linked drive is gone", async () => {
    await writeBackup(defaultPath, "device-a");
    await relocateBackupLocation({ location, targetBase, platform });
    await fs.rm(path.join(targetBase, "MobileSync"), { recursive: true, force: true });

    const backups = await listStoredBackups(location);

    expect(backups).toHaveLength(1);
    expect(backups[0]).toMatchObject({ folderName: "device-a", source: "previous" });
  });
});

describe("getScannableBackupPaths", () => {
  it("returns just the default paths when nothing was moved", async () => {
    await writeBackup(defaultPath, "device-a");

    expect(await getScannableBackupPaths([location])).toEqual([defaultPath]);
  });

  it("includes set-aside folders after a move so existing backups stay visible", async () => {
    await writeBackup(defaultPath, "device-a");
    await relocateBackupLocation({ location, targetBase, platform });

    const paths = await getScannableBackupPaths([location]);

    expect(paths).toEqual([defaultPath, previousPath]);
  });
});

describe("deleteStoredBackup", () => {
  it("deletes a backup from the active folder", async () => {
    await writeBackup(defaultPath, "device-a");
    await writeBackup(defaultPath, "device-b");

    await deleteStoredBackup({ location, source: "current", folderName: "device-a" });

    const status = await getBackupLocationStatus(location);
    expect(status.backupCount).toBe(1);
    await expect(fs.access(path.join(defaultPath, "device-a"))).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("deletes a set-aside backup and removes the folder once it is empty", async () => {
    await writeBackup(defaultPath, "device-a");
    await relocateBackupLocation({ location, targetBase, platform });

    await deleteStoredBackup({ location, source: "previous", folderName: "device-a" });

    const status = await getBackupLocationStatus(location);
    expect(status.previousPaths).toEqual([]);
    expect(status.previousBackupCount).toBe(0);
    await expect(fs.access(previousPath)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("rejects deleting a backup that does not exist", async () => {
    await writeBackup(defaultPath, "device-a");

    await expect(
      deleteStoredBackup({ location, source: "current", folderName: "device-b" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("rejects folder names that try to escape the backup folder", async () => {
    await writeBackup(defaultPath, "device-a");

    for (const folderName of ["..", ".", "", "../..", "nested/child", "nested\\child"]) {
      await expect(
        deleteStoredBackup({ location, source: "current", folderName }),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    }
    // Nothing was deleted
    const status = await getBackupLocationStatus(location);
    expect(status.backupCount).toBe(1);
  });
});
