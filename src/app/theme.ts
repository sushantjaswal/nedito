// Dark mode (CLAUDE.md Phase 2). A local per-browser preference, not part of the document —
// same storage pattern as library/enabledSections.ts. Defaults to light on a fresh visit
// rather than following the OS's prefers-color-scheme, so the app's starting appearance is
// deterministic instead of silently differing session to session.
import { BRAND } from "./brand";

export type Theme = "light" | "dark";

const KEY = `${BRAND.storagePrefix}:theme`;

export function readTheme(): Theme {
  try {
    return localStorage.getItem(KEY) === "dark" ? "dark" : "light";
  } catch {
    return "light";
  }
}

export function writeTheme(theme: Theme): void {
  try {
    localStorage.setItem(KEY, theme);
  } catch {
    // best-effort, same pattern as file/autosave.ts
  }
}
