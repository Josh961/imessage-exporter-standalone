// @vitest-environment node
import fs from "fs/promises";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  cleanupProgress,
  completeProgress,
  createProgressThrottle,
  EXPORT_SHARE,
  finalizingProgress,
  mapExporterProgress,
  measureFolder,
  ZIP_END,
  ZIP_START,
  zipProgress,
} from "./export-progress.mjs";

describe("mapExporterProgress", () => {
  it("scales the exporter's percentage into the export share of the bar", () => {
    const mapped = mapExporterProgress({
      phase: "exporting",
      current: 500,
      total: 1000,
      percentage: 50,
    });
    expect(mapped).toEqual({
      phase: "exporting",
      current: 500,
      total: 1000,
      percentage: EXPORT_SHARE / 2,
    });
  });

  it("keeps scanning messages and clamps out-of-range percentages", () => {
    expect(
      mapExporterProgress({
        phase: "scanning",
        current: 3,
        total: 0,
        percentage: 0,
        message: "Found 3 messages",
      }),
    ).toEqual({
      phase: "scanning",
      current: 3,
      total: 0,
      percentage: 0,
      message: "Found 3 messages",
    });
    expect(mapExporterProgress({ phase: "exporting", percentage: 250 }).percentage).toBe(
      EXPORT_SHARE,
    );
    expect(mapExporterProgress({ phase: "exporting", percentage: -5 }).percentage).toBe(0);
    expect(mapExporterProgress({ phase: "exporting", percentage: "nope" }).percentage).toBe(0);
  });

  it("turns the exporter's own completion into the finalizing phase, never 100%", () => {
    const mapped = mapExporterProgress({
      phase: "complete",
      current: 10,
      total: 10,
      percentage: 100,
    });
    expect(mapped).toEqual(finalizingProgress());
    expect(mapped.phase).toBe("finalizing");
    expect(mapped.percentage).toBe(EXPORT_SHARE);
    expect(mapped.percentage).toBeLessThan(100);
  });
});

describe("zipProgress", () => {
  it("fills the zip span of the bar in proportion to bytes processed", () => {
    expect(zipProgress(0, 1000).percentage).toBe(ZIP_START);
    expect(zipProgress(500, 1000).percentage).toBe(ZIP_START + (ZIP_END - ZIP_START) / 2);
    expect(zipProgress(1000, 1000).percentage).toBe(ZIP_END);
  });

  it("reports byte counts for the renderer and never exceeds the total", () => {
    expect(zipProgress(1500, 1000)).toEqual({
      phase: "zipping",
      current: 1000,
      total: 1000,
      percentage: ZIP_END,
    });
  });

  it("stays at the start of the span when the folder size is unknown", () => {
    expect(zipProgress(123, 0)).toEqual({
      phase: "zipping",
      current: 123,
      total: 0,
      percentage: ZIP_START,
    });
    expect(zipProgress(undefined, undefined).percentage).toBe(ZIP_START);
  });
});

describe("phase ordering", () => {
  it("only reaches 100% on the final complete event", () => {
    const sequence = [
      mapExporterProgress({ phase: "scanning", percentage: 0 }),
      mapExporterProgress({ phase: "exporting", percentage: 100 }),
      mapExporterProgress({ phase: "complete", percentage: 100 }),
      zipProgress(0, 10),
      zipProgress(10, 10),
      cleanupProgress(),
      completeProgress(),
    ];

    for (let index = 1; index < sequence.length; index += 1) {
      expect(sequence[index].percentage).toBeGreaterThanOrEqual(sequence[index - 1].percentage);
    }
    for (const event of sequence.slice(0, -1)) {
      expect(event.percentage).toBeLessThan(100);
      expect(event.phase).not.toBe("complete");
    }
    expect(completeProgress()).toEqual({
      phase: "complete",
      current: 0,
      total: 0,
      percentage: 100,
    });
  });
});

describe("measureFolder", () => {
  let root;

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), "export-progress-"));
  });

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  it("sums file sizes across nested folders and ignores empty directories", async () => {
    await fs.writeFile(path.join(root, "chat.txt"), "a".repeat(10));
    await fs.mkdir(path.join(root, "attachments", "1"), { recursive: true });
    await fs.mkdir(path.join(root, "attachments", "empty"), { recursive: true });
    await fs.writeFile(path.join(root, "attachments", "1", "photo.jpg"), Buffer.alloc(300));
    await fs.writeFile(path.join(root, "attachments", "1", "voice.m4a"), Buffer.alloc(45));

    expect(await measureFolder(root)).toEqual({ totalBytes: 355, fileCount: 3 });
  });

  it("returns zeros for an empty folder", async () => {
    expect(await measureFolder(root)).toEqual({ totalBytes: 0, fileCount: 0 });
  });
});

describe("createProgressThrottle", () => {
  function setup() {
    let clock = 1000;
    const timers = [];
    const sent = [];
    const push = createProgressThrottle((event) => sent.push(event), {
      intervalMs: 100,
      now: () => clock,
      setTimer: (fn, delay) => {
        const timer = { fn, at: clock + delay };
        timers.push(timer);
        return timer;
      },
      clearTimer: (timer) => {
        const index = timers.indexOf(timer);
        if (index >= 0) timers.splice(index, 1);
      },
    });
    const advance = (ms) => {
      clock += ms;
      for (const timer of timers.splice(0)) {
        if (timer.at <= clock) timer.fn();
        else timers.push(timer);
      }
    };
    return { push, sent, advance };
  }

  const event = (phase, percentage) => ({ phase, current: 0, total: 0, percentage });

  it("sends the first event immediately and coalesces rapid updates in the same phase", () => {
    const { push, sent, advance } = setup();
    push(event("exporting", 1));
    push(event("exporting", 2));
    push(event("exporting", 3));
    expect(sent.map((e) => e.percentage)).toEqual([1]);

    advance(100);
    expect(sent.map((e) => e.percentage)).toEqual([1, 3]);
  });

  it("always sends a phase change right away", () => {
    const { push, sent } = setup();
    push(event("exporting", 10));
    push(event("exporting", 20));
    push(event("finalizing", 75));
    expect(sent.map((e) => [e.phase, e.percentage])).toEqual([
      ["exporting", 10],
      ["finalizing", 75],
    ]);
  });

  it("drops a stale pending event when a phase change or forced event supersedes it", () => {
    const { push, sent, advance } = setup();
    push(event("zipping", 80));
    push(event("zipping", 85));
    push(event("zipping", 98), { force: true });
    advance(200);
    expect(sent.map((e) => e.percentage)).toEqual([80, 98]);
  });

  it("sends again once the interval has elapsed", () => {
    const { push, sent, advance } = setup();
    push(event("zipping", 80));
    advance(100);
    push(event("zipping", 90));
    expect(sent.map((e) => e.percentage)).toEqual([80, 90]);
  });
});
