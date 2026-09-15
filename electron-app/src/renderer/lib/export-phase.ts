import type { ExportProgress } from "../types";
import { formatBytes } from "./format-bytes";

export type ExportPhase = ExportProgress["phase"];
export type ExportStepStatus = "pending" | "active" | "done";

export interface ExportStep {
  label: string;
  status: ExportStepStatus;
}

const STEP_LABELS = ["Export messages", "Compress files", "Finish up"] as const;

// Which of the three user-facing steps each phase belongs to. "complete" is
// past the last step so every step reads as done.
const STEP_INDEX_BY_PHASE: Record<ExportPhase, number> = {
  scanning: 0,
  exporting: 0,
  "copying-attachments": 0,
  finalizing: 1,
  zipping: 1,
  "cleaning-up": 2,
  complete: STEP_LABELS.length,
};

export function getExportSteps(phase: ExportPhase | null): ExportStep[] {
  const activeIndex = phase ? STEP_INDEX_BY_PHASE[phase] : 0;
  return STEP_LABELS.map((label, index) => ({
    label,
    status: index < activeIndex ? "done" : index === activeIndex ? "active" : "pending",
  }));
}

export function getProgressText(progress: ExportProgress | null): string {
  if (!progress) return "Starting export...";

  switch (progress.phase) {
    case "scanning":
      return progress.message || "Scanning messages...";
    case "exporting":
      return `Exporting messages: ${progress.current.toLocaleString()} / ${progress.total.toLocaleString()}`;
    case "copying-attachments":
      return `Copying attachments: ${progress.current.toLocaleString()} / ${progress.total.toLocaleString()}`;
    case "finalizing":
      return "Preparing files...";
    case "zipping":
      return progress.total > 0
        ? `Compressing: ${formatBytes(progress.current)} of ${formatBytes(progress.total)}`
        : "Compressing files...";
    case "cleaning-up":
      return "Cleaning up...";
    case "complete":
      return "Export complete!";
    default:
      return "Working...";
  }
}

export function getProgressDetail(progress: ExportProgress | null): string | null {
  switch (progress?.phase) {
    case "finalizing":
      return "Getting the export folder ready to compress.";
    case "zipping":
      return "Packing photos and audio into a single ZIP file. Large exports can take a few minutes. Keep the app open.";
    case "cleaning-up":
      return "Removing temporary files. Almost done.";
    default:
      return null;
  }
}
