// Every shape in a fully-covered section can be found by the words people actually type.
//
// Search matches a shape's label and its id's own words already, so keywords are for the
// *other* names: "database" for a cylinder, "if" for a diamond, "drill down" for a Nested Block.
// A shape with none is findable only by the name we happened to give it, which for the Nested
// Block — the product's whole point — meant "subprocess" and "drill down" found nothing.
//
// Every section is accounted for: either fully covered, or named below with the reason it is
// not. A new section that is neither fails, so none can be skipped silently.
import { describe, expect, it } from "vitest";
import { loadSection, SECTION_IDS, type SectionId } from "./index";

const COVERED: SectionId[] = [
  "general",
  "basic",
  "misc",
  "animated",
  "ai",
  "advanced",
  "arrows",
  "lines",
  "flowchart",
  "bpmn",
  "uml",
  "c4",
  "entity-relation",
  "dfd",
  "network",
  "business",
];

/**
 * Not keyworded, deliberately. These are the vendors' own official icon packs, labelled with the
 * vendors' own product names ("Virtual Machines", "Lambda"), which are the names people search
 * for; hand-writing synonyms for 1,000+ icons would add guesses, not findability.
 */
const VENDOR_NAMED: SectionId[] = ["azure", "aws", "gcp"];

/** Holds the user's own captured shapes, whose names are whatever the user chose. */
const USER_CONTENT: SectionId[] = ["scratchpad"];

describe("stencil keywords", () => {
  it.each(COVERED)("gives every %s shape at least one alternative search term", async (id) => {
    const section = await loadSection(id);
    expect(section).not.toBeNull();
    const bare = section!.shapes.filter((s) => !s.keywords?.length).map((s) => s.id);
    expect(bare).toEqual([]);
  });

  it("accounts for every section exactly once", () => {
    const listed = [...COVERED, ...VENDOR_NAMED, ...USER_CONTENT];
    expect(SECTION_IDS.filter((id) => !listed.includes(id)), "sections nobody decided about").toEqual([]);
    expect(listed.filter((id, i) => listed.indexOf(id) !== i), "sections listed twice").toEqual([]);
  });

  it("finds the flowchart symbols by what the step does", async () => {
    // The full ISO 5807 set lives in Flowchart since D84.
    const flowchart = await loadSection("flowchart");
    const find = (term: string) =>
      flowchart!.shapes.filter((s) => s.keywords?.some((k) => k.includes(term))).map((s) => s.id);
    expect(find("wait")).toContain("flowchart/delay");
    expect(find("loop")).toContain("flowchart/loop-limit");
    expect(find("next page")).toContain("flowchart/off-page-connector");
  });

  it("finds the Nested Block by what it does, not just by its name", async () => {
    const general = await loadSection("general");
    const nested = general!.shapes.find((s) => s.id === "general/nested")!;
    for (const term of ["drill down", "subprocess", "zoom in"]) expect(nested.keywords).toContain(term);
  });
});
