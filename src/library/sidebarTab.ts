// Which half of the left sidebar is showing. A per-browser preference like the enabled
// sections, so it lives directly in localStorage rather than the document store.
import { BRAND } from "../app/brand";

export type SidebarTab = "shapes" | "templates";

const KEY = `${BRAND.storagePrefix}:sidebarTab`;

export function readSidebarTab(): SidebarTab {
  try {
    return localStorage.getItem(KEY) === "templates" ? "templates" : "shapes";
  } catch {
    return "shapes";
  }
}

export function writeSidebarTab(tab: SidebarTab): void {
  try {
    localStorage.setItem(KEY, tab);
  } catch {
    /* best-effort, same pattern as file/autosave.ts */
  }
}
