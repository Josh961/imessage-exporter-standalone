import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WizardProvider, useWizard } from "../../context/wizard-context";
import { installMockElectronAPI, type MockElectronAPI } from "../../test/mock-electron-api";
import type { Contact } from "../../types";
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

  it("does not include development-only fallback controls", async () => {
    const user = userEvent.setup();
    renderSettings();

    await user.click(screen.getByRole("button", { name: "Advanced settings" }));

    expect(screen.queryByText("Simulate fallback while enabled")).not.toBeInTheDocument();
  });
});
