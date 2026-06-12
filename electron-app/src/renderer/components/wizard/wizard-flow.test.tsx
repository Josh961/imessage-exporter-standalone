import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WizardProvider } from "../../context/wizard-context";
import { installMockElectronAPI, type MockElectronAPI } from "../../test/mock-electron-api";
import type { Contact, IPhoneBackup } from "../../types";
import { Wizard } from "./wizard";

const familyChat: Contact = {
  type: "GROUP",
  contact: "Family Chat",
  messageCount: 1250,
  firstMessageDate: "2024-01-01T12:00:00Z",
  lastMessageDate: "2024-12-31T12:00:00Z",
  participants: "Taylor,Jordan,mom@example.com",
  participantHandles: "+15556667777,+15551112222,mom@example.com",
  chatIds: "12",
};

const directChat: Contact = {
  type: "CONTACT",
  contact: "+15556667777",
  displayName: "Taylor",
  messageCount: 400,
  firstMessageDate: "2024-02-01T12:00:00Z",
  lastMessageDate: "2024-10-01T12:00:00Z",
  chatIds: "15",
};

const tooSmallChat: Contact = {
  type: "CONTACT",
  contact: "+15550001111",
  displayName: "Tiny Thread",
  messageCount: 3,
  firstMessageDate: "2024-01-01T12:00:00Z",
  lastMessageDate: "2024-01-02T12:00:00Z",
  chatIds: "18",
};

let electronAPI: MockElectronAPI;

function renderWizard(platform = "darwin") {
  return render(
    <WizardProvider>
      <Wizard platform={platform} />
    </WizardProvider>,
  );
}

beforeEach(() => {
  localStorage.clear();
  electronAPI = installMockElectronAPI();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("wizard workflows", () => {
  it("loads Mac Messages chats, filters/searches them, selects a group, validates dates, and exports by chat ID", async () => {
    const user = userEvent.setup();
    electronAPI.listContacts.mockResolvedValue({
      success: true,
      contacts: [tooSmallChat, directChat, familyChat],
    });
    electronAPI.runExporter.mockResolvedValue({
      success: true,
      hasMessages: true,
      zipPath: "/exports/family.zip",
    });

    renderWizard("darwin");

    await user.click(await screen.findByRole("button", { name: /Mac messages/i }));

    expect(await screen.findByText("Select a contact")).toBeInTheDocument();
    expect(screen.queryByText("Tiny Thread")).not.toBeInTheDocument();

    await user.type(
      screen.getByPlaceholderText("Search by name, phone number, or group name..."),
      "family",
    );
    expect(screen.getByRole("button", { name: /Family Chat/i })).toBeInTheDocument();
    expect(screen.queryByText("Taylor")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Family Chat/i }));
    expect(await screen.findByText("Select date range")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Use earliest date/i }));
    await user.click(screen.getByRole("button", { name: "Continue" }));

    expect(await screen.findByText("Ready to export")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Export messages" }));

    expect(await screen.findByText("Export complete!")).toBeInTheDocument();
    expect(electronAPI.saveLastInputFolder).toHaveBeenCalledWith("/messages");
    expect(electronAPI.runExporter).toHaveBeenCalledWith(
      expect.objectContaining({
        inputFolder: "/messages",
        outputFolder: "/exports",
        startDate: "2024-01-01",
        endDate: "",
        selectedChatIds: ["12"],
        selectedContacts: [["+15556667777", "+15551112222", "mom@example.com"]],
      }),
    );
  });

  it("searches chats by display name, direct phone number, and group participant phone number", async () => {
    const user = userEvent.setup();
    electronAPI.listContacts.mockResolvedValue({
      success: true,
      contacts: [directChat, familyChat],
    });

    renderWizard("darwin");

    await user.click(await screen.findByRole("button", { name: /Mac messages/i }));

    const searchInput = await screen.findByLabelText("Search contacts");

    await user.type(searchInput, "taylor");
    expect(screen.getByRole("button", { name: /Taylor/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Family Chat/i })).toBeInTheDocument();

    await user.clear(searchInput);
    await user.type(searchInput, "5556667777");
    expect(screen.getByRole("button", { name: /Taylor/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Family Chat/i })).toBeInTheDocument();

    await user.clear(searchInput);
    await user.type(searchInput, "5551112222");
    expect(screen.getByRole("button", { name: /Family Chat/i })).toBeInTheDocument();
    expect(screen.queryByText("Taylor")).not.toBeInTheDocument();
  });

  it("shows backup instructions when none are found, then rescans and loads a newly found backup", async () => {
    const user = userEvent.setup();
    const backup: IPhoneBackup = {
      id: "backup-1",
      path: "/backups/backup-1",
      folderName: "backup-1",
      backupDate: new Date("2024-06-01T12:00:00Z"),
    };

    electronAPI.scanIphoneBackups
      .mockResolvedValueOnce({ success: true, backups: [] })
      .mockResolvedValueOnce({ success: true, backups: [backup] });
    electronAPI.listContacts.mockResolvedValue({ success: true, contacts: [familyChat] });

    renderWizard("win32");

    expect(await screen.findByText("No backups found")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /iTunes backup/i }));

    expect(await screen.findByText("No iPhone backups found")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Check again" }));

    await waitFor(() => {
      expect(electronAPI.listContacts).toHaveBeenCalledWith("/backups/backup-1");
    });
    expect(await screen.findByText("Select a contact")).toBeInTheDocument();
    expect(electronAPI.saveLastInputFolder).toHaveBeenCalledWith("/backups/backup-1");
  });

  it("adds a selectable dev iPhone backup on macOS when no real backups are found", async () => {
    const user = userEvent.setup();
    electronAPI.scanIphoneBackups.mockResolvedValue({ success: true, backups: [] });
    electronAPI.listContacts.mockResolvedValue({ success: true, contacts: [familyChat] });

    renderWizard("darwin");

    expect(await screen.findByText("Dev backup available")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /iPhone backup/i }));

    expect(await screen.findByText("Select iPhone backup")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Dev iPhone backup/i }));

    expect(await screen.findByText("Select a contact")).toBeInTheDocument();
    expect(electronAPI.listContacts).toHaveBeenCalledWith("/messages");
    expect(electronAPI.saveLastInputFolder).toHaveBeenCalledWith("/messages");
  });

  it("does not add the dev iPhone backup when disabled via dev controls", async () => {
    localStorage.setItem("devBackupEnabled", "false");
    electronAPI.scanIphoneBackups.mockResolvedValue({ success: true, backups: [] });

    renderWizard("darwin");

    expect(await screen.findByText("No backups found")).toBeInTheDocument();
    expect(screen.queryByText("Dev backup available")).not.toBeInTheDocument();
  });

  it("does not add the dev iPhone backup outside development", async () => {
    const user = userEvent.setup();
    vi.stubEnv("DEV", false);
    electronAPI.scanIphoneBackups.mockResolvedValue({ success: true, backups: [] });

    renderWizard("darwin");

    expect(await screen.findByText("No backups found")).toBeInTheDocument();
    expect(screen.queryByText("Dev backup available")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /iPhone backup/i }));

    expect(await screen.findByText("No iPhone backups found")).toBeInTheDocument();
    expect(screen.queryByText("Dev iPhone backup")).not.toBeInTheDocument();
  });

  it("keeps the no-backups modal open with a notice when checking again still finds nothing", async () => {
    const user = userEvent.setup();
    vi.stubEnv("DEV", false);
    const backup: IPhoneBackup = {
      id: "backup-1",
      path: "/backups/backup-1",
      folderName: "backup-1",
      backupDate: new Date("2024-06-01T12:00:00Z"),
    };

    electronAPI.scanIphoneBackups
      .mockResolvedValueOnce({ success: true, backups: [] })
      .mockResolvedValueOnce({ success: true, backups: [] })
      .mockResolvedValueOnce({ success: true, backups: [backup] });
    electronAPI.listContacts.mockResolvedValue({ success: true, contacts: [familyChat] });

    renderWizard("darwin");

    expect(await screen.findByText("No backups found")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /iPhone backup/i }));

    expect(await screen.findByText("No iPhone backups found")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Check again" }));

    expect(await screen.findByText(/Still no backups found/)).toBeInTheDocument();
    expect(screen.getByText("No iPhone backups found")).toBeInTheDocument();
    expect(screen.queryByText("Select iPhone backup")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Check again" }));

    expect(await screen.findByText("Select a contact")).toBeInTheDocument();
    expect(electronAPI.listContacts).toHaveBeenCalledWith("/backups/backup-1");
  });

  it("prompts for an encrypted backup password, unlocks contacts, and exports with that password", async () => {
    const user = userEvent.setup();
    const backup: IPhoneBackup = {
      id: "backup-1",
      path: "/backups/backup-1",
      folderName: "backup-1",
      backupDate: new Date("2024-06-01T12:00:00Z"),
    };

    electronAPI.scanIphoneBackups.mockResolvedValue({ success: true, backups: [backup] });
    electronAPI.listContacts
      .mockResolvedValueOnce({
        success: false,
        errorCode: "ENCRYPTED_BACKUP_PASSWORD_REQUIRED",
        error: "This iPhone backup is encrypted. Enter the backup password to continue.",
      })
      .mockResolvedValueOnce({ success: true, contacts: [familyChat] });
    electronAPI.runExporter.mockResolvedValue({
      success: true,
      hasMessages: true,
      zipPath: "/exports/family.zip",
    });

    renderWizard("win32");

    await user.click(await screen.findByRole("button", { name: /iTunes backup/i }));
    expect(await screen.findByText("Encrypted backup")).toBeInTheDocument();

    await user.type(screen.getByLabelText("Backup password"), "secret pass");
    await user.click(screen.getByRole("button", { name: "Unlock backup" }));

    expect(await screen.findByText("Select a contact")).toBeInTheDocument();
    expect(electronAPI.listContacts).toHaveBeenNthCalledWith(1, "/backups/backup-1");
    expect(electronAPI.listContacts).toHaveBeenNthCalledWith(2, "/backups/backup-1", {
      backupPassword: "secret pass",
    });

    await user.click(screen.getByRole("button", { name: /Family Chat/i }));
    await user.click(await screen.findByRole("button", { name: /Use earliest date/i }));
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await user.click(await screen.findByRole("button", { name: "Export messages" }));

    expect(await screen.findByText("Export complete!")).toBeInTheDocument();
    expect(electronAPI.runExporter).toHaveBeenCalledWith(
      expect.objectContaining({
        inputFolder: "/backups/backup-1",
        selectedChatIds: ["12"],
        backupPassword: "secret pass",
      }),
    );
  });

  it("uses the dev encrypted-backup toggle to test the password prompt on a normal backup", async () => {
    const user = userEvent.setup();
    const backup: IPhoneBackup = {
      id: "backup-1",
      path: "/backups/backup-1",
      folderName: "backup-1",
      backupDate: new Date("2024-06-01T12:00:00Z"),
    };

    localStorage.setItem("simulateEncryptedBackup", "true");
    electronAPI.scanIphoneBackups.mockResolvedValue({ success: true, backups: [backup] });
    electronAPI.listContacts.mockResolvedValue({ success: true, contacts: [familyChat] });

    renderWizard("win32");

    await user.click(await screen.findByRole("button", { name: /iTunes backup/i }));

    expect(await screen.findByText("Encrypted backup")).toBeInTheDocument();
    expect(electronAPI.listContacts).not.toHaveBeenCalled();

    await user.type(screen.getByLabelText("Backup password"), "dev-password");
    await user.click(screen.getByRole("button", { name: "Unlock backup" }));

    expect(await screen.findByText("Select a contact")).toBeInTheDocument();
    expect(electronAPI.listContacts).toHaveBeenCalledWith("/backups/backup-1", {
      backupPassword: "dev-password",
    });
  });

  it("ignores the encrypted-backup simulation outside development", async () => {
    const user = userEvent.setup();
    const backup: IPhoneBackup = {
      id: "backup-1",
      path: "/backups/backup-1",
      folderName: "backup-1",
      backupDate: new Date("2024-06-01T12:00:00Z"),
    };

    vi.stubEnv("DEV", false);
    localStorage.setItem("simulateEncryptedBackup", "true");
    electronAPI.scanIphoneBackups.mockResolvedValue({ success: true, backups: [backup] });
    electronAPI.listContacts.mockResolvedValue({ success: true, contacts: [familyChat] });

    renderWizard("win32");

    await user.click(await screen.findByRole("button", { name: /iTunes backup/i }));

    expect(await screen.findByText("Select a contact")).toBeInTheDocument();
    expect(screen.queryByText("Encrypted backup")).not.toBeInTheDocument();
    expect(electronAPI.listContacts).toHaveBeenCalledWith("/backups/backup-1");
  });

  it("keeps the encrypted backup prompt open when the password is invalid", async () => {
    const user = userEvent.setup();
    const backup: IPhoneBackup = {
      id: "backup-1",
      path: "/backups/backup-1",
      folderName: "backup-1",
      backupDate: new Date("2024-06-01T12:00:00Z"),
    };

    electronAPI.scanIphoneBackups.mockResolvedValue({ success: true, backups: [backup] });
    electronAPI.listContacts
      .mockResolvedValueOnce({
        success: false,
        errorCode: "ENCRYPTED_BACKUP_PASSWORD_REQUIRED",
        error: "This iPhone backup is encrypted. Enter the backup password to continue.",
      })
      .mockResolvedValueOnce({
        success: false,
        errorCode: "INVALID_BACKUP_PASSWORD",
        error: "That backup password was not accepted. Try again.",
      });

    renderWizard("win32");

    await user.click(await screen.findByRole("button", { name: /iTunes backup/i }));
    await user.type(await screen.findByLabelText("Backup password"), "wrong");
    await user.click(screen.getByRole("button", { name: "Unlock backup" }));

    expect(
      await screen.findByText("That backup password was not accepted. Try again."),
    ).toBeInTheDocument();
    expect(screen.getByText("Encrypted backup")).toBeInTheDocument();
    expect(screen.queryByText("Select a contact")).not.toBeInTheDocument();
  });
});
