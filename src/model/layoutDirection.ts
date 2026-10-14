// Which way the last tidy-up ran. A per-browser preference, like the sidebar's tab and the
// animated image export's size, so it lives directly in localStorage rather than in the document:
// it says how this person works, not anything about the diagram they are working on.
import { BRAND } from "../app/brand";
import type { LayoutDirection } from "./layout";

const KEY = `${BRAND.storagePrefix}:layoutDirection`;

export function readLayoutDirection(): LayoutDirection {
  try {
    return localStorage.getItem(KEY) === "down" ? "down" : "right";
  } catch {
    return "right";
  }
}

export function writeLayoutDirection(direction: LayoutDirection): void {
  try {
    localStorage.setItem(KEY, direction);
  } catch {
    /* best-effort, same pattern as file/autosave.ts */
  }
}
