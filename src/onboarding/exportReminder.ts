// The rule for when the "save a copy" toast may appear (CLAUDE_HISTORY.md D53). Kept as a
// pure function of a snapshot rather than living inside the store, because every interesting
// part of this feature is a decision about numbers and clocks, and this way the thresholds,
// the re-arm and all four suppressions are testable without mounting anything.

/** Changes before the first reminder of a session. */
export const FIRST_THRESHOLD = 15;
/** Further changes required before a dismissed reminder is allowed back. */
export const REARM_INTERVAL = 40;
/** Reminders per session. The first plus exactly one re-arm, per the spec. */
export const MAX_PER_SESSION = 2;
/** A reminder right after someone exported would be nagging, not helping. */
export const EXPORT_COOLDOWN_MS = 60_000;

export interface ExportReminderSnapshot {
  /** Mutating actions since the last successful export (or since the session began). */
  actionsSinceExport: number;
  /** How many reminders this session has already shown. */
  remindersShown: number;
  /** A reminder is on screen right now. */
  reminderOpen: boolean;
  /** `Date.now()` of the last successful export this session, or null if there wasn't one. */
  lastExportAt: number | null;
  now: number;
  /** The canvas holds the bundled sample, untouched. Nothing here is the user's to lose. */
  demoActive: boolean;
  /** The coach-mark tour is running; a second overlay would fight it. */
  tourInProgress: boolean;
  /** Someone else's shared diagram, read-only. They have nothing to export. */
  viewerMode: boolean;
}

/**
 * The count at which the next reminder becomes due: 15 for the first of the session, then 55
 * for the re-armed one. Exceeds any reachable count once the per-session cap is spent, which
 * is what stops a third reminder.
 */
export function nextReminderThreshold(remindersShown: number): number {
  if (remindersShown >= MAX_PER_SESSION) return Number.POSITIVE_INFINITY;
  return FIRST_THRESHOLD + remindersShown * REARM_INTERVAL;
}

export function shouldShowExportReminder(s: ExportReminderSnapshot): boolean {
  if (s.reminderOpen) return false;
  if (s.viewerMode) return false;
  if (s.demoActive) return false;
  if (s.tourInProgress) return false;
  if (s.lastExportAt !== null && s.now - s.lastExportAt < EXPORT_COOLDOWN_MS) return false;
  return s.actionsSinceExport >= nextReminderThreshold(s.remindersShown);
}
