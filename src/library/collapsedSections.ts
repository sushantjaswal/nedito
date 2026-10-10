// Which shape-library sections are collapsed (header clicked shut). A local per-browser
// preference, not part of the document — same storage pattern as enabledSections.ts.
import { BRAND } from "../app/brand";
import { SECTION_IDS, type SectionId } from "./stencils";

const KEY = `${BRAND.storagePrefix}:collapsedSections`;

// A first-ever visit (nothing saved yet) opens General and keeps every other section collapsed,
// as draw.io does: a dozen fully-expanded shape grids at once is overwhelming, but a sidebar of
// nothing but closed headers leaves a newcomer with no shape in sight to start from (D87). Once the
// user has expanded/collapsed anything, that explicit choice (however sparse) is respected
// verbatim from then on.
const OPEN_ON_FIRST_VISIT: SectionId = "general";

function firstVisitDefault(): Set<SectionId> {
  return new Set(SECTION_IDS.filter((id) => id !== OPEN_ON_FIRST_VISIT));
}

export function readCollapsedSections(): Set<SectionId> {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return firstVisitDefault();
    const parsed = JSON.parse(raw) as string[];
    const known = new Set<string>(SECTION_IDS);
    return new Set(parsed.filter((id): id is SectionId => known.has(id)));
  } catch {
    return firstVisitDefault();
  }
}

export function writeCollapsedSections(ids: Set<SectionId>): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(Array.from(ids)));
  } catch {
    // best-effort, same pattern as file/autosave.ts
  }
}
