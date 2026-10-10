// Whether diagram motion plays (D116). Two layers, and the reader has the final say:
//   - prefers-reduced-motion turns all of it off, whatever is stored (styles/motion.css);
//   - otherwise this per-browser switch — Preferences in the editor, the Motion button in the
//     share-link viewer's strip — does. On by default.
// Same storage pattern as theme.ts: a local preference, never part of a document.
import { BRAND } from "./brand";

const KEY = `${BRAND.storagePrefix}:motion`;

export function readMotionEnabled(): boolean {
  try {
    return localStorage.getItem(KEY) !== "off";
  } catch {
    return true;
  }
}

export function writeMotionEnabled(on: boolean): void {
  try {
    localStorage.setItem(KEY, on ? "on" : "off");
  } catch {
    // best-effort, same pattern as file/autosave.ts
  }
}

/** The class on <html> that stops every animation, set when the switch is off. */
export const MOTION_OFF_CLASS = "nd-motion-off";
