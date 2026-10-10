import { beforeEach, describe, expect, it, vi } from "vitest";
import { readEnabledSections, writeEnabledSections } from "./enabledSections";
import { SECTION_IDS } from "./stencils";

describe("enabledSections", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("defaults to every section enabled when nothing was saved", () => {
    expect(readEnabledSections()).toEqual(new Set(SECTION_IDS));
  });

  it("writeEnabledSections then readEnabledSections round-trips a subset", () => {
    const subset = new Set<(typeof SECTION_IDS)[number]>(["general", "flowchart"]);
    writeEnabledSections(subset);
    expect(readEnabledSections()).toEqual(subset);
  });

  it("readEnabledSections drops unknown ids from a stale saved value", () => {
    localStorage.setItem(
      "nedito:enabledSections",
      JSON.stringify({ enabled: ["general", "not-a-real-section"], known: [...SECTION_IDS, "not-a-real-section"] }),
    );
    expect(readEnabledSections()).toEqual(new Set(["general"]));
  });

  it("readEnabledSections falls back to all-enabled when localStorage.getItem throws", () => {
    const spy = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(readEnabledSections()).toEqual(new Set(SECTION_IDS));
    spy.mockRestore();
  });

  it("writeEnabledSections does not throw when localStorage.setItem throws", () => {
    const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota exceeded");
    });
    expect(() => writeEnabledSections(new Set(["general"]))).not.toThrow();
    spy.mockRestore();
  });

  // A section added in a later release must not stay hidden from someone who once switched
  // another section off: they never chose to hide it.
  it("shows a newly added section to someone whose saved list predates it", () => {
    localStorage.setItem("nedito:enabledSections", JSON.stringify(["general", "flowchart"]));
    expect(readEnabledSections()).toEqual(new Set(["general", "flowchart", "lines"]));
  });

  it("keeps a section hidden once the user has switched it off", () => {
    writeEnabledSections(new Set(["general"]));
    expect(readEnabledSections().has("lines")).toBe(false);
  });
});
