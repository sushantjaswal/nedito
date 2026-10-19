// The shape library's purpose groups.
import { beforeEach, describe, expect, it } from "vitest";
import { readCollapsedSections } from "./collapsedSections";
import { groupOf, LIBRARY_GROUPS, readCollapsedGroups, revealEssentialsOnce, writeCollapsedGroups } from "./libraryGroups";
import { SECTION_IDS, type SectionId } from "./stencils";

describe("the purpose groups", () => {
  it("show every section except Favorites exactly once, so none is lost", () => {
    const grouped = LIBRARY_GROUPS.flatMap((g) => g.sections);
    expect(new Set(grouped).size).toBe(grouped.length);
    expect([...grouped].sort()).toEqual(SECTION_IDS.filter((id) => id !== "scratchpad").sort());
  });

  it("follow the approved mapping", () => {
    const mapping = Object.fromEntries(LIBRARY_GROUPS.map((g) => [g.label, g.sections]));
    expect(mapping).toEqual({
      Basics: ["general", "basic", "advanced"],
      "Lines & Arrows": ["lines", "arrows"],
      Flow: ["flowchart", "bpmn"],
      Data: ["entity-relation", "dfd"],
      Software: ["uml", "c4"],
      Cloud: ["azure", "aws", "gcp"],
      Network: ["network"],
      "People & Business": ["business"],
      Icons: ["misc", "animated", "ai"],
    });
    expect(groupOf("dfd")?.label).toBe("Data");
  });
});

describe("which groups start closed", () => {
  beforeEach(() => localStorage.clear());

  it("opens Basics alone on a first visit, where General is the open section (D87)", () => {
    expect([...readCollapsedGroups(readCollapsedSections())].sort()).toEqual(["cloud", "data", "flow", "icons", "lines", "software"]);
  });

  it("keeps a group open for a returning user if any of its sections was open", () => {
    const collapsed = new Set<SectionId>(SECTION_IDS.filter((id) => id !== "aws"));
    const groups = readCollapsedGroups(collapsed);
    expect(groups.has("cloud")).toBe(false);
    expect(groups.has("basics")).toBe(true);
  });

  it("uses what the user chose once they open or close a group, ignoring unknown ids", () => {
    writeCollapsedGroups(new Set(["flow", "not-a-group"]));
    expect([...readCollapsedGroups(new Set())]).toEqual(["flow"]);
  });
});

// Raised in review: the Nested Block lives in Essentials, so everyone should see it open once.
describe("revealEssentialsOnce", () => {
  beforeEach(() => localStorage.clear());

  it("opens Basics › Essentials once, whatever was saved, then leaves the user's choice alone", () => {
    const sections = new Set<SectionId>(["general", "basic"]);
    const groups = new Set(["basics", "cloud"]);
    expect(revealEssentialsOnce(sections, groups)).toBe(true);
    expect(sections.has("general")).toBe(false);
    expect(groups.has("basics")).toBe(false);
    expect(sections.has("basic")).toBe(true);
    expect(groups.has("cloud")).toBe(true);

    const closedAgain = new Set<SectionId>(["general"]);
    expect(revealEssentialsOnce(closedAgain, new Set(["basics"]))).toBe(false);
    expect(closedAgain.has("general")).toBe(true);
  });
});
