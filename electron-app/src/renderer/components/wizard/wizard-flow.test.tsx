import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
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
  participants: "+15551112222,+15553334444,mom@example.com",
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
      screen.getByPlaceholderText("Search by phone number or group name..."),
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
        selectedContacts: [["+15551112222", "+15553334444", "mom@example.com"]],
      }),
    );
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
});
