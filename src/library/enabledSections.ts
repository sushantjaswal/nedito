// Which shape-library sections are visible, set in the Browse all libraries dialog, which
// enables and disables sections. A local per-browser preference, not part of the document —
// stored directly in localStorage rather than the doc store (no undo history, no autosave
// coupling needed for a UI-only setting).
//
// Stored with the list of sections that existed when it was saved, so a section added in a later
// release is shown to someone who once turned another section off: a bare list of enabled ids
// cannot tell a section the user switched off from one they have never seen (D85).
import { BRAND } from "../app/brand";
import { SECTION_IDS, type SectionId } from "./stencils";

const KEY = `${BRAND.storagePrefix}:enabledSections`;

/** Sections added after the setting was first stored as a bare list, so absent from every such list. */
const ADDED_SINCE_BARE_LIST: SectionId[] = ["lines"];

interface Stored {
  enabled: string[];
  known: string[];
}

export function readEnabledSections(): Set<SectionId> {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return new Set(SECTION_IDS);
    const parsed = JSON.parse(raw) as string[] | Stored;
    const stored: Stored = Array.isArray(parsed)
      ? { enabled: parsed, known: SECTION_IDS.filter((id) => !ADDED_SINCE_BARE_LIST.includes(id)) }
      : parsed;
    const enabled = new Set(stored.enabled);
    const known = new Set(stored.known);
    return new Set(SECTION_IDS.filter((id) => enabled.has(id) || !known.has(id)));
  } catch {
    return new Set(SECTION_IDS);
  }
}

export function writeEnabledSections(ids: Set<SectionId>): void {
  try {
    const stored: Stored = { enabled: Array.from(ids), known: [...SECTION_IDS] };
    localStorage.setItem(KEY, JSON.stringify(stored));
  } catch {
    // best-effort, same pattern as file/autosave.ts
  }
}
