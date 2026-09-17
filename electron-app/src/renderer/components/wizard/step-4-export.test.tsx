import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WizardProvider, useWizard } from "../../context/wizard-context";
import { installMockElectronAPI, type MockElectronAPI } from "../../test/mock-electron-api";
import type { Contact, ExportProgress, ExportResult } from "../../types";
import { Step4Export } from "./step-4-export";

const selectedChat: Contact = {
  type: "GROUP",
  contact: "Family Chat",
  messageCount: 1250,
  firstMessageDate: "2024-01-01T00:00:00Z",
  lastMessageDate: "2024-12-31T00:00:00Z",
  participants: "Taylor,Jordan,mom@example.com",
  participantHandles: "+15551112222,+15553334444,mom@example.com",
  chatIds: "12",
};

const fallbackChat: Contact = {
  type: "GROUP",
  contact: "Family Chat",
  messageCount: 1250,
  firstMessageDate: "2024-01-01T00:00:00Z",
  lastMessageDate: "2024-12-31T00:00:00Z",
  participants: "Taylor,Jordan,mom@example.com",
  participantHandles: "5551112222,5553334444,mom@example.com",
  chatIds: "44",
};

const unrelatedChat: Contact = {
  type: "GROUP",
  contact: "Work Chat",
  messageCount: 200,
  firstMessageDate: "2024-02-01T00:00:00Z",
  lastMessageDate: "2024-03-01T00:00:00Z",
  participants: "+15559998888,+15557776666",
  chatIds: "99",
};

let electronAPI: MockElectronAPI;

function SeedWizard({
  children,
  backupPassword = null,
}: {
  children: ReactNode;
  backupPassword?: string | null;
}) {
  const {
    setInputFolder,
    setBackupPassword,
    setOutputFolder,
    setContacts,
    setSelectedContact,
    setStartDate,
    setEndDate,
  } = useWizard();

  useEffect(() => {
    setInputFolder("/messages");
    setBackupPassword(backupPassword);
    setOutputFolder("/exports");
    setContacts([selectedChat]);
    setSelectedContact(selectedChat);
    setStartDate("2024-01-01");
    setEndDate("");
  }, [
    backupPassword,
    setBackupPassword,
    setContacts,
    setEndDate,
    setInputFolder,
    setOutputFolder,
    setSelectedContact,
    setStartDate,
  ]);

  return children;
}

function renderStep4(options: { backupPassword?: string } = {}) {
  return render(
    <WizardProvider>
      <SeedWizard backupPassword={options.backupPassword || null}>
        <Step4Export />
      </SeedWizard>
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

describe("Step4Export fallback recovery flow", () => {
  it("refreshes contacts and shows explicit fallback choices after a no-chat export error", async () => {
    const user = userEvent.setup();
    electronAPI.runExporter.mockResolvedValue({
      success: false,
      errorCode: "NO_CHAT_MATCH",
      error: "No chats were found with the supplied contacts.",
    });
    electronAPI.listContacts.mockResolvedValue({
      success: true,
      contacts: [unrelatedChat, fallbackChat],
    });

    renderStep4();

    await user.click(await screen.findByRole("button", { name: "Export messages" }));

    expect(await screen.findByText("Possible matching chats")).toBeInTheDocument();
    expect(
      screen.getByText("Choose the correct chat below to retry the export."),
    ).toBeInTheDocument();
    expect(screen.getByText("Family Chat")).toBeInTheDocument();
    expect(screen.queryByText("Work Chat")).not.toBeInTheDocument();
    expect(electronAPI.listContacts).toHaveBeenCalledWith("/messages");
    expect(electronAPI.runExporter).toHaveBeenCalledWith(
      expect.objectContaining({
        inputFolder: "/messages",
        outputFolder: "/exports",
        selectedChatIds: ["12"],
      }),
    );
  });

  it("shows the fallback screen again after going back and continuing while dev simulation is enabled", async () => {
    const user = userEvent.setup();
    localStorage.setItem("simulateNoChatMatch", "true");
    electronAPI.listContacts.mockResolvedValue({ success: true, contacts: [fallbackChat] });

    renderStep4();

    await user.click(await screen.findByRole("button", { name: "Export messages" }));
    expect(await screen.findByText("Possible matching chats")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Go back" }));
    await waitFor(() => {
      expect(screen.queryByText("Possible matching chats")).not.toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "Export messages" }));

    expect(await screen.findByText("Possible matching chats")).toBeInTheDocument();
    await waitFor(() => {
      expect(electronAPI.listContacts).toHaveBeenCalledTimes(2);
    });
    expect(electronAPI.runExporter).not.toHaveBeenCalled();
  });

  it("ignores no-chat fallback simulation outside development", async () => {
    const user = userEvent.setup();
    vi.stubEnv("DEV", false);
    localStorage.setItem("simulateNoChatMatch", "true");
    electronAPI.runExporter.mockResolvedValue({
      success: true,
      hasMessages: true,
      zipPath: "/exports/book.zip",
    });

    renderStep4();

    await user.click(await screen.findByRole("button", { name: "Export messages" }));

    expect(await screen.findByText("Export complete!")).toBeInTheDocument();
    expect(screen.queryByText("Possible matching chats")).not.toBeInTheDocument();
    expect(electronAPI.runExporter).toHaveBeenCalled();
    expect(electronAPI.listContacts).not.toHaveBeenCalled();
  });

  it("uses the backup password when refreshing fallback candidates and retrying export", async () => {
    const user = userEvent.setup();
    electronAPI.runExporter.mockResolvedValue({
      success: false,
      errorCode: "NO_CHAT_MATCH",
      error: "No chats were found with the supplied contacts.",
    });
    electronAPI.listContacts.mockResolvedValue({ success: true, contacts: [fallbackChat] });

    renderStep4({ backupPassword: "secret pass" });

    await user.click(await screen.findByRole("button", { name: "Export messages" }));

    expect(await screen.findByText("Possible matching chats")).toBeInTheDocument();
    expect(electronAPI.listContacts).toHaveBeenCalledWith("/messages", {
      backupPassword: "secret pass",
    });
    expect(electronAPI.runExporter).toHaveBeenCalledWith(
      expect.objectContaining({
        selectedChatIds: ["12"],
        backupPassword: "secret pass",
      }),
    );
  });

  it("retries a selected fallback candidate with exact chat IDs even when dev simulation remains enabled", async () => {
    const user = userEvent.setup();
    localStorage.setItem("simulateNoChatMatch", "true");
    electronAPI.listContacts.mockResolvedValue({ success: true, contacts: [fallbackChat] });
    electronAPI.runExporter.mockResolvedValue({
      success: true,
      hasMessages: true,
      zipPath: "/exports/book.zip",
    });

    renderStep4();

    await user.click(await screen.findByRole("button", { name: "Export messages" }));
    await screen.findByText("Possible matching chats");
    await user.click(screen.getByRole("button", { name: "Retry" }));

    await waitFor(() => {
      expect(electronAPI.runExporter).toHaveBeenCalledWith(
        expect.objectContaining({
          selectedChatIds: ["44"],
        }),
      );
    });
    expect(await screen.findByText("Export complete!")).toBeInTheDocument();
  });

  it("shows a date-range message when export succeeds but no messages are produced", async () => {
    const user = userEvent.setup();
    electronAPI.runExporter.mockResolvedValue({ success: true, hasMessages: false });

    renderStep4();

    await user.click(await screen.findByRole("button", { name: "Export messages" }));

    expect(
      await screen.findByText("No messages found in the specified date range."),
    ).toBeInTheDocument();
    expect(screen.queryByText("Possible matching chats")).not.toBeInTheDocument();
  });
});

describe("Step4Export progress display", () => {
  function captureProgress() {
    let progressCallback: ((data: ExportProgress) => void) | null = null;
    electronAPI.onExportProgress.mockImplementation(
      (callback: (data: ExportProgress) => void) => {
        progressCallback = callback;
        return vi.fn();
      },
    );
    let resolveExport: (result: ExportResult) => void = () => {};
    electronAPI.runExporter.mockReturnValue(
      new Promise<ExportResult>((resolve) => {
        resolveExport = resolve;
      }),
    );
    const emit = (data: ExportProgress) => {
      act(() => {
        progressCallback?.(data);
      });
    };
    return { emit, finish: (result: ExportResult) => resolveExport(result) };
  }

  it("keeps the bar below 100% and explains the zip step until the export actually finishes", async () => {
    const user = userEvent.setup();
    const { emit, finish } = captureProgress();

    renderStep4();
    await user.click(await screen.findByRole("button", { name: "Export messages" }));

    expect(await screen.findByText("Starting export...")).toBeInTheDocument();
    const [exportStep, compressStep, finishStep] = screen.getAllByRole("listitem");
    expect(exportStep).toHaveAttribute("aria-current", "step");

    emit({ phase: "exporting", current: 500, total: 1000, percentage: 37.5 });
    expect(screen.getByText("Exporting messages: 500 / 1,000")).toBeInTheDocument();
    expect(screen.getByText("38%")).toBeInTheDocument();
    expect(screen.getByTestId("export-progress-detail")).toBeEmptyDOMElement();

    emit({ phase: "finalizing", current: 0, total: 0, percentage: 75 });
    expect(screen.getByText("Preparing files...")).toBeInTheDocument();
    expect(exportStep).toHaveTextContent("Export messages (done)");
    expect(compressStep).toHaveAttribute("aria-current", "step");

    emit({
      phase: "zipping",
      current: 50 * 1024 * 1024,
      total: 200 * 1024 * 1024,
      percentage: 80.75,
    });
    expect(screen.getByText("Compressing folder: 50.0 MB of 200.0 MB")).toBeInTheDocument();
    expect(screen.getByText("81%")).toBeInTheDocument();
    expect(screen.getByTestId("export-progress-detail")).toHaveTextContent("Keep the app open");
    expect(screen.queryByText("Export complete!")).not.toBeInTheDocument();
    expect(screen.queryByText("100%")).not.toBeInTheDocument();

    emit({ phase: "cleaning-up", current: 0, total: 0, percentage: 98 });
    expect(screen.getByText("Cleaning up...")).toBeInTheDocument();
    expect(finishStep).toHaveAttribute("aria-current", "step");
    expect(compressStep).toHaveTextContent("Compress folder (done)");
    expect(screen.queryByText("Export complete!")).not.toBeInTheDocument();

    finish({ success: true, hasMessages: true, zipPath: "/exports/book.zip" });
    // The success screen only appears once the main process has resolved.
    expect(await screen.findByText("/exports/book.zip")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Export complete!" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open folder" })).toBeInTheDocument();
  });

  it("never moves the bar backwards when a late event reports less progress", async () => {
    const user = userEvent.setup();
    const { emit } = captureProgress();

    renderStep4();
    await user.click(await screen.findByRole("button", { name: "Export messages" }));
    await screen.findByText("Starting export...");

    emit({ phase: "exporting", current: 800, total: 1000, percentage: 60 });
    emit({ phase: "exporting", current: 700, total: 1000, percentage: 52.5 });

    expect(screen.getByText("60%")).toBeInTheDocument();
    expect(screen.getByText("Exporting messages: 800 / 1,000")).toBeInTheDocument();
  });
});
