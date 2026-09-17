import { describe, expect, it } from "vitest";
import type { ExportProgress } from "../types";
import { getExportSteps, getProgressDetail, getProgressText } from "./export-phase";

const progress = (overrides: Partial<ExportProgress>): ExportProgress => ({
  phase: "exporting",
  current: 0,
  total: 0,
  percentage: 0,
  ...overrides,
});

describe("getExportSteps", () => {
  const statuses = (phase: ExportProgress["phase"] | null) =>
    getExportSteps(phase).map((step) => step.status);

  it("starts on the export step before any progress arrives", () => {
    expect(statuses(null)).toEqual(["active", "pending", "pending"]);
  });

  it("keeps the export step active through scanning and exporting", () => {
    expect(statuses("scanning")).toEqual(["active", "pending", "pending"]);
    expect(statuses("exporting")).toEqual(["active", "pending", "pending"]);
    expect(statuses("copying-attachments")).toEqual(["active", "pending", "pending"]);
  });

  it("moves to the compress step once the CLI has finished", () => {
    expect(statuses("finalizing")).toEqual(["done", "active", "pending"]);
    expect(statuses("zipping")).toEqual(["done", "active", "pending"]);
  });

  it("moves to the finish step during cleanup and marks everything done on complete", () => {
    expect(statuses("cleaning-up")).toEqual(["done", "done", "active"]);
    expect(statuses("complete")).toEqual(["done", "done", "done"]);
  });

  it("labels the steps in order", () => {
    expect(getExportSteps(null).map((step) => step.label)).toEqual([
      "Export messages",
      "Compress folder",
      "Finish up",
    ]);
  });
});

describe("getProgressText", () => {
  it("describes each phase", () => {
    expect(getProgressText(null)).toBe("Starting export...");
    expect(getProgressText(progress({ phase: "scanning" }))).toBe("Scanning messages...");
    expect(getProgressText(progress({ phase: "scanning", message: "Found 3 messages" }))).toBe(
      "Found 3 messages",
    );
    expect(getProgressText(progress({ phase: "exporting", current: 1234, total: 5678 }))).toBe(
      "Exporting messages: 1,234 / 5,678",
    );
    expect(getProgressText(progress({ phase: "finalizing" }))).toBe("Preparing files...");
    expect(getProgressText(progress({ phase: "cleaning-up" }))).toBe("Cleaning up...");
    expect(getProgressText(progress({ phase: "complete" }))).toBe("Export complete!");
  });

  it("shows bytes while zipping and a plain label when the size is unknown", () => {
    expect(
      getProgressText(
        progress({ phase: "zipping", current: 50 * 1024 * 1024, total: 200 * 1024 * 1024 }),
      ),
    ).toBe("Compressing folder: 50.0 MB of 200.0 MB");
    expect(getProgressText(progress({ phase: "zipping", current: 0, total: 0 }))).toBe(
      "Compressing folder...",
    );
  });

  it("never claims completion for an in-flight phase", () => {
    const phases: ExportProgress["phase"][] = [
      "scanning",
      "exporting",
      "copying-attachments",
      "finalizing",
      "zipping",
      "cleaning-up",
    ];
    for (const phase of phases) {
      expect(getProgressText(progress({ phase }))).not.toMatch(/complete/i);
    }
  });
});

describe("getProgressDetail", () => {
  it("explains the slow post-processing phases and stays quiet otherwise", () => {
    expect(getProgressDetail(null)).toBeNull();
    expect(getProgressDetail(progress({ phase: "exporting" }))).toBeNull();
    expect(getProgressDetail(progress({ phase: "complete" }))).toBeNull();
    expect(getProgressDetail(progress({ phase: "finalizing" }))).toMatch(/ready to compress/);
    expect(getProgressDetail(progress({ phase: "zipping" }))).toMatch(/original quality/);
    expect(getProgressDetail(progress({ phase: "zipping" }))).toMatch(/Keep the app open/);
    expect(getProgressDetail(progress({ phase: "cleaning-up" }))).toMatch(/Almost done/);
  });
});
