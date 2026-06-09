import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
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

  it("does not include development-only fallback controls", async () => {
    const user = userEvent.setup();
    renderSettings();

    await user.click(screen.getByRole("button", { name: "Advanced settings" }));

    expect(screen.queryByText("Simulate fallback while enabled")).not.toBeInTheDocument();
  });
});
