import fs from "fs/promises";
import path from "path";

// The renderer shows one progress bar for the whole export. The Rust exporter
// only knows about its own work, so its 0–100% is scaled into the first part of
// the bar and the post-processing the app does afterwards (renaming, filtering,
// zipping, cleanup) fills the rest. The bar therefore never reads 100% while
// the app is still working.
export const EXPORT_SHARE = 75;
export const ZIP_START = EXPORT_SHARE;
export const ZIP_END = 98;
export const CLEANUP_PERCENT = ZIP_END;
export const COMPLETE_PERCENT = 100;

export const PROGRESS_THROTTLE_MS = 80;

/**
 * Translate a progress event from the Rust exporter into the app's overall
 * progress. The exporter's "complete" phase means only that the CLI finished;
 * the app still has to package the result, so it becomes "finalizing".
 */
export function mapExporterProgress(event) {
  const percentage = clampPercentage(Number(event.percentage) || 0);

  if (event.phase === "complete") {
    return {
      phase: "finalizing",
      current: 0,
      total: 0,
      percentage: EXPORT_SHARE,
    };
  }

  return {
    phase: event.phase,
    current: Number(event.current) || 0,
    total: Number(event.total) || 0,
    percentage: (percentage / 100) * EXPORT_SHARE,
    ...(event.message ? { message: event.message } : {}),
  };
}

export function finalizingProgress() {
  return { phase: "finalizing", current: 0, total: 0, percentage: EXPORT_SHARE };
}

/**
 * Overall progress while the export folder is being zipped, based on how many
 * bytes archiver has consumed against the folder size measured up front.
 */
export function zipProgress(processedBytes, totalBytes) {
  const processed = Math.max(0, Number(processedBytes) || 0);
  const total = Math.max(0, Number(totalBytes) || 0);
  const ratio = total > 0 ? Math.min(1, processed / total) : 0;

  return {
    phase: "zipping",
    current: Math.min(processed, total || processed),
    total,
    percentage: ZIP_START + ratio * (ZIP_END - ZIP_START),
  };
}

export function cleanupProgress() {
  return { phase: "cleaning-up", current: 0, total: 0, percentage: CLEANUP_PERCENT };
}

export function completeProgress() {
  return { phase: "complete", current: 0, total: 0, percentage: COMPLETE_PERCENT };
}

/**
 * Total size and file count of everything under a folder. Used to give the
 * zip phase a real denominator; archiver's own totalBytes grows while entries
 * are still being discovered and cannot be trusted for a percentage.
 */
export async function measureFolder(folderPath) {
  let totalBytes = 0;
  let fileCount = 0;
  const pending = [folderPath];

  while (pending.length > 0) {
    const current = pending.pop();
    const entries = await fs.readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const entryPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        pending.push(entryPath);
      } else if (entry.isFile()) {
        const stats = await fs.stat(entryPath);
        totalBytes += stats.size;
        fileCount += 1;
      }
    }
  }

  return { totalBytes, fileCount };
}

/**
 * Rate-limit progress events sent to the renderer. Phase changes and the
 * final event of a phase always go through so the UI never misses a
 * transition; events within a phase are coalesced to at most one per
 * interval, with the latest one flushed when the interval elapses.
 */
export function createProgressThrottle(
  send,
  {
    intervalMs = PROGRESS_THROTTLE_MS,
    now = Date.now,
    setTimer = setTimeout,
    clearTimer = clearTimeout,
  } = {},
) {
  let lastPhase = null;
  let lastSentAt = -Infinity;
  let pending = null;
  let timer = null;

  const flush = () => {
    timer = null;
    if (!pending) return;
    const event = pending;
    pending = null;
    lastPhase = event.phase;
    lastSentAt = now();
    send(event);
  };

  const push = (event, { force = false } = {}) => {
    const phaseChanged = event.phase !== lastPhase;
    const elapsed = now() - lastSentAt;

    if (force || phaseChanged || elapsed >= intervalMs) {
      if (timer) {
        clearTimer(timer);
        timer = null;
      }
      pending = null;
      lastPhase = event.phase;
      lastSentAt = now();
      send(event);
      return;
    }

    pending = event;
    if (!timer) {
      timer = setTimer(flush, intervalMs - elapsed);
    }
  };

  push.flush = flush;
  return push;
}

function clampPercentage(value) {
  return Math.min(100, Math.max(0, value));
}
