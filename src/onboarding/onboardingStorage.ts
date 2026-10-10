// Onboarding flags, keyed under BRAND.storagePrefix like every other persisted key so a future
// rename migrates them along with the autosave (the rename policy in brand.ts).
//
// Every access is wrapped: localStorage throws in private-browsing and disabled-storage modes,
// and onboarding state going missing must never stop someone drawing. A read that fails is
// treated as "not dismissed", which at worst shows the sample one extra time.
import { BRAND } from "../app/brand";

const DEMO_DISMISSED_KEY = `${BRAND.storagePrefix}:demoDismissed`;

export function readDemoDismissed(): boolean {
  try {
    return localStorage.getItem(DEMO_DISMISSED_KEY) === "true";
  } catch {
    return false;
  }
}

export function writeDemoDismissed(): void {
  try {
    localStorage.setItem(DEMO_DISMISSED_KEY, "true");
  } catch {
    /* best-effort, same as file/autosave.ts */
  }
}

export function clearDemoDismissed(): void {
  try {
    localStorage.removeItem(DEMO_DISMISSED_KEY);
  } catch {
    /* best-effort */
  }
}

const TOUR_DONE_KEY = `${BRAND.storagePrefix}:tourDone`;

export function readTourDone(): boolean {
  try {
    return localStorage.getItem(TOUR_DONE_KEY) === "true";
  } catch {
    return false;
  }
}

export function writeTourDone(): void {
  try {
    localStorage.setItem(TOUR_DONE_KEY, "true");
  } catch {
    /* best-effort */
  }
}

export function clearTourDone(): void {
  try {
    localStorage.removeItem(TOUR_DONE_KEY);
  } catch {
    /* best-effort */
  }
}

// The export reminder's counter outlives a reload on purpose: someone who has made 14 changes,
// refreshed, and made one more is exactly as far from a saved copy as someone who made 15 in a
// row. A corrupt or missing value reads as 0, which at worst delays the reminder.
const ACTIONS_SINCE_EXPORT_KEY = `${BRAND.storagePrefix}:actionsSinceExport`;

export function readActionsSinceExport(): number {
  try {
    const raw = localStorage.getItem(ACTIONS_SINCE_EXPORT_KEY);
    const n = raw === null ? 0 : Number.parseInt(raw, 10);
    return Number.isFinite(n) && n > 0 ? n : 0;
  } catch {
    return 0;
  }
}

export function writeActionsSinceExport(count: number): void {
  try {
    localStorage.setItem(ACTIONS_SINCE_EXPORT_KEY, String(count));
  } catch {
    /* best-effort */
  }
}

export function clearActionsSinceExport(): void {
  try {
    localStorage.removeItem(ACTIONS_SINCE_EXPORT_KEY);
  } catch {
    /* best-effort */
  }
}

/**
 * Which version of the tour a user has completed.
 *
 * The tour gained a third step after people had already finished the two-step version (D48).
 * Re-running the whole thing for them would be a punishment for having paid attention the
 * first time, so `tourDone` alone is no longer enough to decide what to show: a user who
 * finished v1 gets the new step on its own, once, and nobody is shown a step twice.
 *
 * Absent means v1 for someone who has completed the tour, and means nothing at all for someone
 * who never did — `readTourDone()` still decides that.
 */
export const CURRENT_TOUR_VERSION = 2;

const TOUR_VERSION_KEY = `${BRAND.storagePrefix}:tourVersion`;

export function readTourVersion(): number {
  try {
    const raw = localStorage.getItem(TOUR_VERSION_KEY);
    const n = raw === null ? 1 : Number.parseInt(raw, 10);
    return Number.isFinite(n) && n > 0 ? n : 1;
  } catch {
    return CURRENT_TOUR_VERSION; // storage unavailable: never nag
  }
}

export function writeTourVersion(version = CURRENT_TOUR_VERSION): void {
  try {
    localStorage.setItem(TOUR_VERSION_KEY, String(version));
  } catch {
    /* best-effort */
  }
}

export function clearTourVersion(): void {
  try {
    localStorage.removeItem(TOUR_VERSION_KEY);
  } catch {
    /* best-effort */
  }
}

/** The one-time "live link" tip after a user's first PNG export (tutorial spec item L2). */
const LIVE_LINK_TIP_KEY = `${BRAND.storagePrefix}:liveLinkTipShown`;

export function readLiveLinkTipShown(): boolean {
  try {
    return localStorage.getItem(LIVE_LINK_TIP_KEY) === "true";
  } catch {
    return true; // storage unavailable: better silent than repeating every export
  }
}

export function writeLiveLinkTipShown(): void {
  try {
    localStorage.setItem(LIVE_LINK_TIP_KEY, "true");
  } catch {
    /* best-effort */
  }
}

export function clearLiveLinkTipShown(): void {
  try {
    localStorage.removeItem(LIVE_LINK_TIP_KEY);
  } catch {
    /* best-effort */
  }
}
