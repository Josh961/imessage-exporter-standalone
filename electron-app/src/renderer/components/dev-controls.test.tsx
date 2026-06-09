import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { DevControls } from "./dev-controls";

beforeEach(() => {
  localStorage.clear();
});

describe("DevControls", () => {
  it("stores the no-chat fallback simulation toggle", async () => {
    const user = userEvent.setup();

    render(<DevControls />);

    await user.click(screen.getByRole("button", { name: "Open developer controls" }));
    await user.click(screen.getByRole("switch", { name: "Toggle no-chat fallback simulation" }));

    expect(localStorage.getItem("simulateNoChatMatch")).toBe("true");
  });

  it("reopens with the stored fallback simulation state", async () => {
    localStorage.setItem("simulateNoChatMatch", "true");

    render(<DevControls />);

    await userEvent.click(screen.getByRole("button", { name: "Open developer controls" }));

    expect(
      screen.getByRole("switch", { name: "Toggle no-chat fallback simulation" }),
    ).toHaveAttribute("aria-checked", "true");
  });
});
