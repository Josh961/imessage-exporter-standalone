import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WizardProvider, useWizard } from "../../context/wizard-context";
import { installMockElectronAPI, type MockElectronAPI } from "../../test/mock-electron-api";
import type { Contact } from "../../types";
import { Step1BackupSource } from "../wizard/step-1-backup-source";
import { SettingsModal } from "./settings-modal";

const loadedChat: Contact = {
  type: "CONTACT",
  contact: "+15551112222",
  displayName: "Jordan",
  messageCount: 80,
  firstMessageDate: "2024-01-01T12:00:00Z",
  lastMessageDate: "2024-03-01T12:00:00Z",
  chatIds: "6",
};

function SeedWizard({ children }: { children: ReactNode }) {
  const { setInputFolder, setOutputFolder } = useWizard();

  useEffect(() => {
    setInputFolder("/messages");
    setOutputFolder("/exports");
  }, [setInputFolder, setOutputFolder]);

  return children;
}

function renderSettings(onClose = vi.fn()) {
  render(
    <WizardProvider>
      <SeedWizard>
        <SettingsModal onClose={onClose} />
      </SeedWizard>
    </WizardProvider>,
  );
  return onClose;
}

let electronAPI: MockElectronAPI;

beforeEach(() => {
  localStorage.clear();
  electronAPI = installMockElectronAPI();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("SettingsModal", () => {
  it("saves a changed output folder", async () => {
    const user = userEvent.setup();
    electronAPI.selectFolder.mockResolvedValue("/new-exports");

    renderSettings();

    await user.click(screen.getByRole("button", { name: "Change" }));

    expect(electronAPI.selectFolder).toHaveBeenCalledWith("/exports", "output");
    expect(electronAPI.saveLastOutputFolder).toHaveBeenCalledWith("/new-exports");
  });

  it("reloads contacts from a custom input folder and closes settings", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    electronAPI.selectFolder.mockResolvedValue("/custom-input");
    electronAPI.listContacts.mockResolvedValue({ success: true, contacts: [loadedChat] });

    renderSettings(onClose);

    await user.click(screen.getByRole("button", { name: "Advanced settings" }));
    await user.click(screen.getAllByRole("button", { name: "Change" })[1]);

    await waitFor(() => {
      expect(electronAPI.listContacts).toHaveBeenCalledWith("/custom-input");
    });
    expect(electronAPI.saveLastInputFolder).toHaveBeenCalledWith("/custom-input");
    expect(onClose).toHaveBeenCalled();
  });

  it("prompts for a password when a custom input folder is encrypted", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    electronAPI.selectFolder.mockResolvedValue("/custom-input");
    electronAPI.listContacts
      .mockResolvedValueOnce({
        success: false,
        errorCode: "ENCRYPTED_BACKUP_PASSWORD_REQUIRED",
        error: "This iPhone backup is encrypted. Enter the backup password to continue.",
      })
      .mockResolvedValueOnce({ success: true, contacts: [loadedChat] });

    renderSettings(onClose);

    await user.click(screen.getByRole("button", { name: "Advanced settings" }));
    await user.click(screen.getAllByRole("button", { name: "Change" })[1]);

    expect(await screen.findByText("Encrypted backup")).toBeInTheDocument();
    await user.type(screen.getByLabelText("Backup password"), "secret pass");
    await user.click(screen.getByRole("button", { name: "Unlock backup" }));

    await waitFor(() => {
      expect(electronAPI.listContacts).toHaveBeenNthCalledWith(2, "/custom-input", {
        backupPassword: "secret pass",
      });
    });
    expect(electronAPI.saveLastInputFolder).toHaveBeenCalledWith("/custom-input");
    expect(onClose).toHaveBeenCalled();
  });

  it("uses the dev encrypted-backup toggle for a custom input folder", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    localStorage.setItem("simulateEncryptedBackup", "true");
    electronAPI.selectFolder.mockResolvedValue("/custom-input");
    electronAPI.listContacts.mockResolvedValue({ success: true, contacts: [loadedChat] });

    renderSettings(onClose);

    await user.click(screen.getByRole("button", { name: "Advanced settings" }));
    await user.click(screen.getAllByRole("button", { name: "Change" })[1]);

    expect(await screen.findByText("Encrypted backup")).toBeInTheDocument();
    expect(electronAPI.listContacts).not.toHaveBeenCalled();

    await user.type(screen.getByLabelText("Backup password"), "dev-password");
    await user.click(screen.getByRole("button", { name: "Unlock backup" }));

    await waitFor(() => {
      expect(electronAPI.listContacts).toHaveBeenCalledWith("/custom-input", {
        backupPassword: "dev-password",
      });
    });
    expect(onClose).toHaveBeenCalled();
  });

  it("ignores the encrypted-backup simulation outside development", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    vi.stubEnv("DEV", false);
    localStorage.setItem("simulateEncryptedBackup", "true");
    electronAPI.selectFolder.mockResolvedValue("/custom-input");
    electronAPI.listContacts.mockResolvedValue({ success: true, contacts: [loadedChat] });

    renderSettings(onClose);

    await user.click(screen.getByRole("button", { name: "Advanced settings" }));
    await user.click(screen.getAllByRole("button", { name: "Change" })[1]);

    await waitFor(() => {
      expect(electronAPI.listContacts).toHaveBeenCalledWith("/custom-input");
    });
    expect(screen.queryByText("Encrypted backup")).not.toBeInTheDocument();
    expect(onClose).toHaveBeenCalled();
  });

  it("shows the iPhone backup location section under advanced settings", async () => {
    const user = userEvent.setup();
    electronAPI.getBackupLocations.mockResolvedValue({
      success: true,
      locations: [
        {
          id: "win-apple-devices",
          label: "Apple Devices & Microsoft Store iTunes",
          defaultPath: "C:\\Users\\jane\\Apple\\MobileSync\\Backup",
          exists: true,
          isLink: false,
          linkTarget: null,
          targetExists: false,
          backupCount: 1,
          previousPaths: [],
          previousBackupCount: 0,
        },
      ],
    });

    renderSettings();

    // Hidden until the advanced section is opened
    expect(screen.queryByText("iPhone backup location")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Advanced settings" }));

    expect(await screen.findByText("iPhone backup location")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Move…" })).toBeInTheDocument();
  });

  it("rescans backups on the main screen after the backup location changes", async () => {
    const user = userEvent.setup();
    const backupLocation = {
      id: "win-apple-devices",
      label: "Apple Devices & Microsoft Store iTunes",
      defaultPath: "C:\\Users\\jane\\Apple\\MobileSync\\Backup",
      exists: true,
      isLink: false,
      linkTarget: null,
      targetExists: false,
      backupCount: 1,
      previousPaths: [],
      previousBackupCount: 0,
    };
    electronAPI.getBackupLocations.mockResolvedValue({
      success: true,
      locations: [backupLocation],
    });
    electronAPI.selectFolder.mockResolvedValue("E:\\iPhone");
    electronAPI.relocateBackupLocation.mockResolvedValue({
      success: true,
      location: {
        ...backupLocation,
        isLink: true,
        linkTarget: "E:\\iPhone\\MobileSync\\Backup",
        targetExists: true,
        backupCount: 0,
        previousPaths: ["C:\\Users\\jane\\Apple\\MobileSync\\Backup (old)"],
        previousBackupCount: 1,
      },
    });

    render(
      <WizardProvider>
        <Step1BackupSource platform="win32" />
        <SettingsModal onClose={vi.fn()} />
      </WizardProvider>,
    );

    // The main screen scans once on mount
    await waitFor(() => {
      expect(electronAPI.scanIphoneBackups).toHaveBeenCalledTimes(1);
    });

    await user.click(screen.getByRole("button", { name: "Advanced settings" }));
    await user.click(await screen.findByRole("button", { name: "Move…" }));
    await user.click(await screen.findByRole("button", { name: "Change location" }));

    // Changing the backup location triggers a fresh scan on the main screen
    await waitFor(() => {
      expect(electronAPI.scanIphoneBackups).toHaveBeenCalledTimes(2);
    });
  });

  it("does not include development-only fallback controls", async () => {
    const user = userEvent.setup();
    renderSettings();

    await user.click(screen.getByRole("button", { name: "Advanced settings" }));

    expect(screen.queryByText("Simulate fallback while enabled")).not.toBeInTheDocument();
  });
});
