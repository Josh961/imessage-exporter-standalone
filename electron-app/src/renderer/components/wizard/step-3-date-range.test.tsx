import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect, type ReactNode } from "react";
import { beforeEach, describe, expect, it } from "vitest";
import { WizardProvider, useWizard } from "../../context/wizard-context";
import { installMockElectronAPI } from "../../test/mock-electron-api";
import type { Contact } from "../../types";
import { Step3DateRange } from "./step-3-date-range";

const selectedChat: Contact = {
  type: "GROUP",
  contact: "Family Chat",
  messageCount: 1250,
  firstMessageDate: "2024-01-01T12:00:00Z",
  lastMessageDate: "2024-12-31T12:00:00Z",
  participants: "+15551112222,+15553334444",
  chatIds: "12",
};

function SeedWizard({ children }: { children: ReactNode }) {
  const { setSelectedContact, setStartDate, setEndDate } = useWizard();

  useEffect(() => {
    setSelectedContact(selectedChat);
    setStartDate("");
    setEndDate("");
  }, [setEndDate, setSelectedContact, setStartDate]);

  return children;
}

function renderStep3() {
  return render(
    <WizardProvider>
      <SeedWizard>
        <Step3DateRange />
      </SeedWizard>
    </WizardProvider>,
  );
}

beforeEach(() => {
  installMockElectronAPI();
});

describe("Step3DateRange", () => {
  it("requires a start date before continuing", async () => {
    const user = userEvent.setup();
    renderStep3();

    await user.click(await screen.findByRole("button", { name: "Continue" }));

    expect(screen.getByText("Start date is required")).toBeInTheDocument();
  });

  it("rejects a date range where the start date is after the end date", async () => {
    const user = userEvent.setup();
    renderStep3();

    await user.type(await screen.findByLabelText(/Start date/i), "2024-12-31");
    await user.type(screen.getByLabelText(/End date/i), "2024-01-01");
    await user.click(screen.getByRole("button", { name: "Continue" }));

    expect(screen.getByText("Start date cannot be after end date")).toBeInTheDocument();
  });
});
