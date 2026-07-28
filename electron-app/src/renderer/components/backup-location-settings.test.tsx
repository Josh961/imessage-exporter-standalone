import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { installMockElectronAPI, type MockElectronAPI } from "../test/mock-electron-api";
import type { BackupLocationStatus, StoredBackup } from "../types";
import { BackupLocationSettings } from "./backup-location-settings";

const defaultLocation: BackupLocationStatus = {
  id: "win-apple-devices",
  label: "Apple Devices & Microsoft Store iTunes",
  defaultPath: "C:\\Users\\jane\\Apple\\MobileSync\\Backup",
  exists: true,
  isLink: false,
  linkTarget: null,
  targetExists: false,
  backupCount: 2,
  previousPaths: [],
  previousBackupCount: 0,
};

const movedLocation: BackupLocationStatus = {
  ...defaultLocation,
  isLink: true,
  linkTarget: "E:\\iPhone\\MobileSync\\Backup",
  targetExists: true,
  backupCount: 0,
  previousPaths: ["C:\\Users\\jane\\Apple\\MobileSync\\Backup (old)"],
  previousBackupCount: 2,
};

const currentBackup: StoredBackup = {
  folderName: "00008110-000A25E63C08801E",
  path: "E:\\iPhone\\MobileSync\\Backup\\00008110-000A25E63C08801E",
  source: "current",
  backupDate: new Date("2026-07-20T10:00:00Z"),
  sizeBytes: 2 * 1024 ** 3,
};

const previousBackup: StoredBackup = {
  folderName: "00008030-001E30E20168402E",
  path: "C:\\Users\\jane\\Apple\\MobileSync\\Backup (old)\\00008030-001E30E20168402E",
  source: "previous",
  backupDate: new Date("2025-01-05T10:00:00Z"),
  sizeBytes: 45 * 1024 ** 2,
};

let electronAPI: MockElectronAPI;

beforeEach(() => {
  electronAPI = installMockElectronAPI({
    getBackupLocations: vi.fn().mockResolvedValue({ success: true, locations: [defaultLocation] }),
  });
});

describe("BackupLocationSettings", () => {
  it("shows the current default backup location with a move button", async () => {
    render(<BackupLocationSettings />);

    expect(
      await screen.findByLabelText("Backup location (Apple Devices & Microsoft Store iTunes)"),
    ).toHaveValue("C:\\Users\\jane\\Apple\\MobileSync\\Backup");
    expect(screen.getByRole("button", { name: "Move…" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Revert" })).not.toBeInTheDocument();
  });

  it("renders nothing when the platform has no backup locations", async () => {
    electronAPI.getBackupLocations.mockResolvedValue({ success: true, locations: [] });

    const { container } = render(<BackupLocationSettings />);

    await waitFor(() => {
      expect(electronAPI.getBackupLocations).toHaveBeenCalled();
    });
    expect(container).toBeEmptyDOMElement();
  });

  it("changes the backup location for future backups after confirming", async () => {
    const user = userEvent.setup();
    const onBackupsChanged = vi.fn();
    electronAPI.selectFolder.mockResolvedValue("E:\\iPhone");
    electronAPI.relocateBackupLocation.mockResolvedValue({
      success: true,
      location: movedLocation,
    });

    render(<BackupLocationSettings onBackupsChanged={onBackupsChanged} />);

    await user.click(await screen.findByRole("button", { name: "Move…" }));

    expect(electronAPI.selectFolder).toHaveBeenCalledWith("", "backup-target");
    // The confirmation is about future backups; existing ones are not copied
    expect(await screen.findByText(/Future iPhone backups will be saved/)).toBeInTheDocument();
    expect(screen.getByText(/2 existing backups stay/)).toBeInTheDocument();
    expect(screen.getByText(/Nothing is copied/)).toBeInTheDocument();
    expect(screen.getByText(/Quit iTunes, Apple Devices, or Finder/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Change location" }));

    await waitFor(() => {
      expect(electronAPI.relocateBackupLocation).toHaveBeenCalledWith(
        "win-apple-devices",
        "E:\\iPhone",
      );
    });
    expect(
      screen.getByLabelText("Backup location (Apple Devices & Microsoft Store iTunes)"),
    ).toHaveValue("E:\\iPhone\\MobileSync\\Backup");
    expect(screen.getByRole("button", { name: "Revert" })).toBeInTheDocument();
    // The "✓ Moved" state is the only confirmation — no extra success message
    expect(screen.getByText(/✓ Moved/)).toBeInTheDocument();
    expect(screen.queryByText(/^Done!/)).not.toBeInTheDocument();
    expect(onBackupsChanged).toHaveBeenCalledTimes(1);
  });

  it("does nothing when the folder picker is cancelled", async () => {
    const user = userEvent.setup();
    electronAPI.selectFolder.mockResolvedValue(null);

    render(<BackupLocationSettings />);

    await user.click(await screen.findByRole("button", { name: "Move…" }));

    expect(screen.queryByRole("button", { name: "Change location" })).not.toBeInTheDocument();
    expect(electronAPI.relocateBackupLocation).not.toHaveBeenCalled();
  });

  it("cancels a pending move without calling the API", async () => {
    const user = userEvent.setup();
    const onBackupsChanged = vi.fn();
    electronAPI.selectFolder.mockResolvedValue("E:\\iPhone");

    render(<BackupLocationSettings onBackupsChanged={onBackupsChanged} />);

    await user.click(await screen.findByRole("button", { name: "Move…" }));
    await user.click(await screen.findByRole("button", { name: "Cancel" }));

    expect(screen.queryByRole("button", { name: "Change location" })).not.toBeInTheDocument();
    expect(electronAPI.relocateBackupLocation).not.toHaveBeenCalled();
    expect(onBackupsChanged).not.toHaveBeenCalled();
  });

  it("shows the error when the move fails", async () => {
    const user = userEvent.setup();
    electronAPI.selectFolder.mockResolvedValue("E:\\iPhone");
    electronAPI.relocateBackupLocation.mockResolvedValue({
      success: false,
      error: "That folder isn't available. Reconnect the drive and try again.",
    });

    render(<BackupLocationSettings />);

    await user.click(await screen.findByRole("button", { name: "Move…" }));
    await user.click(await screen.findByRole("button", { name: "Change location" }));

    expect(
      await screen.findByText("That folder isn't available. Reconnect the drive and try again."),
    ).toBeInTheDocument();
    // The original location is unchanged
    expect(
      screen.getByLabelText("Backup location (Apple Devices & Microsoft Store iTunes)"),
    ).toHaveValue("C:\\Users\\jane\\Apple\\MobileSync\\Backup");
    expect(screen.getByRole("button", { name: "Move…" })).toBeInTheDocument();
  });

  it("reverts a moved backup location after confirming", async () => {
    const user = userEvent.setup();
    const onBackupsChanged = vi.fn();
    electronAPI.getBackupLocations.mockResolvedValue({
      success: true,
      locations: [movedLocation],
    });
    electronAPI.revertBackupLocation.mockResolvedValue({
      success: true,
      location: defaultLocation,
    });

    render(<BackupLocationSettings onBackupsChanged={onBackupsChanged} />);

    await user.click(await screen.findByRole("button", { name: "Revert" }));

    expect(screen.getByText(/New backups will be saved to/)).toBeInTheDocument();
    expect(screen.getByText(/Your previous backups will be restored/)).toBeInTheDocument();
    expect(screen.getByText(/Backups already on the other drive stay there/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Restore default location" }));

    await waitFor(() => {
      expect(electronAPI.revertBackupLocation).toHaveBeenCalledWith("win-apple-devices");
    });
    expect(
      screen.getByLabelText("Backup location (Apple Devices & Microsoft Store iTunes)"),
    ).toHaveValue("C:\\Users\\jane\\Apple\\MobileSync\\Backup");
    expect(screen.getByRole("button", { name: "Move…" })).toBeInTheDocument();
    // The success message sits directly under the input box, above the
    // "Manage stored backups" toggle
    const message = screen.getByText(
      "Done! iPhone backups will be saved in the original location again.",
    );
    const manageButton = screen.getByRole("button", {
      name: "Manage stored backups (free up space)",
    });
    expect(
      message.compareDocumentPosition(manageButton) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(onBackupsChanged).toHaveBeenCalledTimes(1);
  });

  it("warns when the moved-to drive is not connected", async () => {
    electronAPI.getBackupLocations.mockResolvedValue({
      success: true,
      locations: [{ ...movedLocation, targetExists: false }],
    });

    render(<BackupLocationSettings />);

    expect(await screen.findByText(/This drive isn't connected right now/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Revert" })).toBeInTheDocument();
  });

  it("offers the primary default location when no backup folder exists yet", async () => {
    const neverBackedUp = { ...defaultLocation, exists: false, backupCount: 0 };
    const secondary = {
      ...defaultLocation,
      id: "win-itunes-desktop",
      label: "iTunes (desktop installer)",
      exists: false,
      backupCount: 0,
    };
    electronAPI.getBackupLocations.mockResolvedValue({
      success: true,
      locations: [neverBackedUp, secondary],
    });

    render(<BackupLocationSettings />);

    expect(
      await screen.findByLabelText("Backup location (Apple Devices & Microsoft Store iTunes)"),
    ).toBeInTheDocument();
    // Only the primary location is offered
    expect(
      screen.queryByLabelText("Backup location (iTunes (desktop installer))"),
    ).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Move…" })).toHaveLength(1);
  });

  it("shows both locations when both Apple apps have backup folders", async () => {
    const secondary = {
      ...defaultLocation,
      id: "win-itunes-desktop",
      label: "iTunes (desktop installer)",
      defaultPath: "C:\\Users\\jane\\AppData\\Roaming\\Apple Computer\\MobileSync\\Backup",
    };
    electronAPI.getBackupLocations.mockResolvedValue({
      success: true,
      locations: [defaultLocation, secondary],
    });

    render(<BackupLocationSettings />);

    expect(
      await screen.findByLabelText("Backup location (Apple Devices & Microsoft Store iTunes)"),
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText("Backup location (iTunes (desktop installer))"),
    ).toBeInTheDocument();
    // Row labels are shown to tell the two apart
    expect(screen.getByText("iTunes (desktop installer)")).toBeInTheDocument();
  });

  it("lists stored backups with sizes when the manager is opened", async () => {
    const user = userEvent.setup();
    electronAPI.getBackupLocations.mockResolvedValue({
      success: true,
      locations: [movedLocation],
    });
    electronAPI.listStoredBackups.mockResolvedValue({
      success: true,
      backups: [currentBackup, previousBackup],
    });

    render(<BackupLocationSettings />);

    await user.click(
      await screen.findByRole("button", { name: "Manage stored backups (free up space)" }),
    );

    await waitFor(() => {
      expect(electronAPI.listStoredBackups).toHaveBeenCalledWith("win-apple-devices");
    });
    expect(screen.getByText(/2\.0 GB · on the selected drive/)).toBeInTheDocument();
    expect(screen.getByText(/45\.0 MB · old backups on this computer/)).toBeInTheDocument();
    expect(screen.getByText(/Total: 2\.0 GB/)).toBeInTheDocument();

    // The manager can be collapsed again
    await user.click(screen.getByRole("button", { name: "Hide stored backups" }));
    expect(screen.queryByText(/Total:/)).not.toBeInTheDocument();
  });

  it("shows an empty state when no backups are stored", async () => {
    const user = userEvent.setup();
    electronAPI.listStoredBackups.mockResolvedValue({ success: true, backups: [] });

    render(<BackupLocationSettings />);

    await user.click(
      await screen.findByRole("button", { name: "Manage stored backups (free up space)" }),
    );

    expect(await screen.findByText("No stored backups found.")).toBeInTheDocument();
  });

  it("deletes a backup after confirming and refreshes the list", async () => {
    const user = userEvent.setup();
    const onBackupsChanged = vi.fn();
    electronAPI.listStoredBackups
      .mockResolvedValueOnce({ success: true, backups: [currentBackup, previousBackup] })
      .mockResolvedValue({ success: true, backups: [currentBackup] });
    electronAPI.deleteStoredBackup.mockResolvedValue({ success: true });

    render(<BackupLocationSettings onBackupsChanged={onBackupsChanged} />);

    await user.click(
      await screen.findByRole("button", { name: "Manage stored backups (free up space)" }),
    );

    // Items are sorted newest first, so the previous backup is the second one
    const deleteButtons = await screen.findAllByRole("button", { name: /^Delete backup from/ });
    expect(deleteButtons).toHaveLength(2);
    await user.click(deleteButtons[1]);

    expect(
      screen.getByText(/Delete this backup permanently and free 45\.0 MB\?/),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Delete backup" }));

    await waitFor(() => {
      expect(electronAPI.deleteStoredBackup).toHaveBeenCalledWith(
        "win-apple-devices",
        "previous",
        "00008030-001E30E20168402E",
      );
    });
    expect(screen.getByText("Backup deleted. Freed 45.0 MB.")).toBeInTheDocument();
    // The list was refreshed and the deleted backup is gone
    expect(screen.queryByText(/45\.0 MB · old backups/)).not.toBeInTheDocument();
    expect(screen.getByText(/2\.0 GB ·/)).toBeInTheDocument();
    expect(onBackupsChanged).toHaveBeenCalledTimes(1);
  });

  it("cancels a pending delete without calling the API", async () => {
    const user = userEvent.setup();
    electronAPI.listStoredBackups.mockResolvedValue({ success: true, backups: [currentBackup] });

    render(<BackupLocationSettings />);

    await user.click(
      await screen.findByRole("button", { name: "Manage stored backups (free up space)" }),
    );
    await user.click(await screen.findByRole("button", { name: /^Delete backup from/ }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.queryByRole("button", { name: "Delete backup" })).not.toBeInTheDocument();
    expect(electronAPI.deleteStoredBackup).not.toHaveBeenCalled();
  });

  it("shows the error when deleting fails", async () => {
    const user = userEvent.setup();
    electronAPI.listStoredBackups.mockResolvedValue({ success: true, backups: [currentBackup] });
    electronAPI.deleteStoredBackup.mockResolvedValue({
      success: false,
      error: "That backup could not be found.",
    });

    render(<BackupLocationSettings />);

    await user.click(
      await screen.findByRole("button", { name: "Manage stored backups (free up space)" }),
    );
    await user.click(await screen.findByRole("button", { name: /^Delete backup from/ }));
    await user.click(screen.getByRole("button", { name: "Delete backup" }));

    expect(await screen.findByText("That backup could not be found.")).toBeInTheDocument();
  });
});
