import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DevControls } from "./dev-controls";

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("DevControls", () => {
  it("does not render outside development", () => {
    vi.stubEnv("DEV", false);

    render(<DevControls />);

    expect(
      screen.queryByRole("button", { name: "Open developer controls" }),
    ).not.toBeInTheDocument();
  });

  it("stores the no-chat fallback simulation toggle", async () => {
    const user = userEvent.setup();

    render(<DevControls />);

    await user.click(screen.getByRole("button", { name: "Open developer controls" }));
    await user.click(screen.getByRole("switch", { name: "Toggle no-chat fallback simulation" }));

    expect(localStorage.getItem("simulateNoChatMatch")).toBe("true");
  });

  it("stores the encrypted backup simulation toggle", async () => {
    const user = userEvent.setup();

    render(<DevControls />);

    await user.click(screen.getByRole("button", { name: "Open developer controls" }));
    await user.click(screen.getByRole("switch", { name: "Toggle encrypted backup simulation" }));

    expect(localStorage.getItem("simulateEncryptedBackup")).toBe("true");
  });

  it("stores the dev iPhone backup toggle, which defaults to on", async () => {
    const user = userEvent.setup();

    render(<DevControls />);

    await user.click(screen.getByRole("button", { name: "Open developer controls" }));

    const devBackupSwitch = screen.getByRole("switch", { name: "Toggle dev iPhone backup" });
    expect(devBackupSwitch).toHaveAttribute("aria-checked", "true");

    await user.click(devBackupSwitch);

    expect(localStorage.getItem("devBackupEnabled")).toBe("false");
    expect(devBackupSwitch).toHaveAttribute("aria-checked", "false");
  });

  it("reopens with the stored fallback simulation state", async () => {
    localStorage.setItem("simulateNoChatMatch", "true");
    localStorage.setItem("simulateEncryptedBackup", "true");

    render(<DevControls />);

    await userEvent.click(screen.getByRole("button", { name: "Open developer controls" }));

    expect(
      screen.getByRole("switch", { name: "Toggle no-chat fallback simulation" }),
    ).toHaveAttribute("aria-checked", "true");
    expect(
      screen.getByRole("switch", { name: "Toggle encrypted backup simulation" }),
    ).toHaveAttribute("aria-checked", "true");
  });
});
