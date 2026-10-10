import { describe, expect, it } from "vitest";
import {
  EXPORT_COOLDOWN_MS,
  FIRST_THRESHOLD,
  MAX_PER_SESSION,
  REARM_INTERVAL,
  nextReminderThreshold,
  shouldShowExportReminder,
  type ExportReminderSnapshot,
} from "./exportReminder";

// A snapshot of someone doing real work: no sample, no tour, no export yet, nothing on screen.
function working(patch: Partial<ExportReminderSnapshot> = {}): ExportReminderSnapshot {
  return {
    actionsSinceExport: 0,
    remindersShown: 0,
    reminderOpen: false,
    lastExportAt: null,
    now: 1_000_000,
    demoActive: false,
    tourInProgress: false,
    viewerMode: false,
    ...patch,
  };
}

describe("nextReminderThreshold", () => {
  it("asks for 15 changes before the first reminder", () => {
    expect(nextReminderThreshold(0)).toBe(FIRST_THRESHOLD);
  });

  it("asks for 40 more before the re-armed one", () => {
    expect(nextReminderThreshold(1)).toBe(FIRST_THRESHOLD + REARM_INTERVAL);
  });

  it("becomes unreachable once the session's reminders are spent", () => {
    expect(nextReminderThreshold(MAX_PER_SESSION)).toBe(Number.POSITIVE_INFINITY);
  });
});

describe("shouldShowExportReminder", () => {
  it("stays quiet below the threshold", () => {
    expect(shouldShowExportReminder(working({ actionsSinceExport: FIRST_THRESHOLD - 1 }))).toBe(false);
  });

  it("fires exactly at the threshold", () => {
    expect(shouldShowExportReminder(working({ actionsSinceExport: FIRST_THRESHOLD }))).toBe(true);
  });

  it("does not re-fire while one is already on screen", () => {
    expect(shouldShowExportReminder(working({ actionsSinceExport: 30, reminderOpen: true }))).toBe(false);
  });

  // The whole point of the re-arm: waving it away must buy real quiet, not one more change.
  it("stays quiet for 40 changes after a dismissal", () => {
    const afterDismiss = { remindersShown: 1 };
    expect(shouldShowExportReminder(working({ ...afterDismiss, actionsSinceExport: FIRST_THRESHOLD + 1 }))).toBe(false);
    expect(
      shouldShowExportReminder(working({ ...afterDismiss, actionsSinceExport: FIRST_THRESHOLD + REARM_INTERVAL - 1 })),
    ).toBe(false);
    expect(
      shouldShowExportReminder(working({ ...afterDismiss, actionsSinceExport: FIRST_THRESHOLD + REARM_INTERVAL })),
    ).toBe(true);
  });

  it("never shows a third reminder in one session, however long the session runs", () => {
    expect(shouldShowExportReminder(working({ remindersShown: MAX_PER_SESSION, actionsSinceExport: 5_000 }))).toBe(
      false,
    );
  });

  it("says nothing about a sample the user hasn't touched", () => {
    expect(shouldShowExportReminder(working({ demoActive: true, actionsSinceExport: 99 }))).toBe(false);
  });

  it("does not talk over the coach-mark tour", () => {
    expect(shouldShowExportReminder(working({ tourInProgress: true, actionsSinceExport: 99 }))).toBe(false);
  });

  it("stays out of the read-only share viewer, which has nothing to lose", () => {
    expect(shouldShowExportReminder(working({ viewerMode: true, actionsSinceExport: 99 }))).toBe(false);
  });

  it("holds off for a minute after an export rather than nagging", () => {
    const now = 5_000_000;
    const justExported = working({ actionsSinceExport: 99, lastExportAt: now - (EXPORT_COOLDOWN_MS - 1), now });
    expect(shouldShowExportReminder(justExported)).toBe(false);
    expect(shouldShowExportReminder({ ...justExported, lastExportAt: now - EXPORT_COOLDOWN_MS })).toBe(true);
  });
});
