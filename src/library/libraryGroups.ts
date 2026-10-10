// The shape library organised by purpose (R4, CLAUDE_HISTORY.md D93): the sidebar shows these
// groups, named for what is being drawn, instead of draw.io's list of sections.
//
// Groups are presentation only. Underneath, every section keeps its id, its stencils keep
// theirs, and everything stored about sections — Favorites, which are open, which are enabled,
// template shapeRefs — still keys off those ids, so nothing saved needs migrating. A group of
// several sections shows each as a sub-heading that opens and closes on its own, exactly as the
// section did; a group of one section simply is that section.
import { BRAND } from "../app/brand";
import { sectionLabel, type SectionId } from "./stencils";

export interface LibraryGroup {
  id: string;
  label: string;
  sections: SectionId[];
  /**
   * What a section is called inside this group, where its own name would read badly under the
   * group's — "Basic" under "Basics" (raised in review). Display only: the id never changes.
   */
  sectionLabels?: Partial<Record<SectionId, string>>;
}

/** Favorites stays its own heading above these; the mapping was approved in review (R4). */
export const LIBRARY_GROUPS: readonly LibraryGroup[] = [
  {
    id: "basics",
    label: "Basics",
    sections: ["general", "basic", "advanced"],
    sectionLabels: { general: "Essentials", basic: "Geometric", advanced: "Frames & Brackets" },
  },
  { id: "lines", label: "Lines & Arrows", sections: ["lines", "arrows"] },
  { id: "flow", label: "Flow", sections: ["flowchart", "bpmn"] },
  { id: "data", label: "Data", sections: ["entity-relation", "dfd"] },
  { id: "software", label: "Software", sections: ["uml", "c4"] },
  { id: "cloud", label: "Cloud", sections: ["azure", "aws", "gcp"] },
  { id: "network", label: "Network", sections: ["network"] },
  { id: "people", label: "People & Business", sections: ["business"] },
  { id: "icons", label: "Icons", sections: ["misc", "animated"] },
];

/** The group a section is shown in. */
export function groupOf(section: SectionId): LibraryGroup | undefined {
  return LIBRARY_GROUPS.find((g) => g.sections.includes(section));
}

/** A section's name as the sidebar and Browse all libraries show it. */
export function sectionDisplayLabel(section: SectionId): string {
  return groupOf(section)?.sectionLabels?.[section] ?? sectionLabel(section);
}

// ---------------------------------------------------------------- which groups are closed

const KEY = `${BRAND.storagePrefix}:collapsedGroups`;

/** Groups of several sections have an open/closed state of their own; a one-section group uses its section's. */
const MULTI = LIBRARY_GROUPS.filter((g) => g.sections.length > 1);

/**
 * The closed multi-section groups. Until the user opens or closes one, a group starts closed
 * only if every section in it was closed — so a returning user's sidebar shows what it showed
 * before, and a first visit (General open, D87) opens Basics alone.
 */
export function readCollapsedGroups(collapsedSections: ReadonlySet<SectionId>): Set<string> {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const known = new Set(MULTI.map((g) => g.id));
      return new Set((JSON.parse(raw) as string[]).filter((id) => known.has(id)));
    }
  } catch {
    // fall through to the derived default
  }
  return new Set(MULTI.filter((g) => g.sections.every((s) => collapsedSections.has(s))).map((g) => g.id));
}

// ---------------------------------------------------------------- Essentials, shown once

const ESSENTIALS_KEY = `${BRAND.storagePrefix}:essentialsShown`;

/**
 * Opens Basics › Essentials once in every browser, whatever was saved before (raised in review):
 * it holds the Nested Block, the one shape that is Nedito's reason to exist, and a sidebar
 * carried over from before the groups could have it closed. After that, the user's own opening
 * and closing is respected. True when it opened them, so the caller saves the new state.
 */
export function revealEssentialsOnce(collapsedSections: Set<SectionId>, collapsedGroups: Set<string>): boolean {
  try {
    if (localStorage.getItem(ESSENTIALS_KEY)) return false;
    localStorage.setItem(ESSENTIALS_KEY, "1");
  } catch {
    return false;
  }
  collapsedSections.delete("general");
  collapsedGroups.delete("basics");
  return true;
}

export function writeCollapsedGroups(ids: ReadonlySet<string>): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(Array.from(ids)));
  } catch {
    // best-effort, same pattern as collapsedSections.ts
  }
}
