import { beforeEach, describe, expect, it, vi } from "vitest";
import { readCollapsedSections, writeCollapsedSections } from "./collapsedSections";
import { SECTION_IDS } from "./stencils";

describe("collapsedSections", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("opens General and collapses every other section on a first-ever visit (nothing saved)", () => {
    const collapsed = readCollapsedSections();
    expect(collapsed.has("general")).toBe(false);
    expect(collapsed).toEqual(new Set(SECTION_IDS.filter((id) => id !== "general")));
  });

  it("writeCollapsedSections then readCollapsedSections round-trips a subset, including an explicit empty set", () => {
    const subset = new Set<(typeof SECTION_IDS)[number]>(["general", "flowchart"]);
    writeCollapsedSections(subset);
    expect(readCollapsedSections()).toEqual(subset);

    writeCollapsedSections(new Set());
    expect(readCollapsedSections()).toEqual(new Set());
  });

  it("readCollapsedSections drops unknown ids from a stale saved value", () => {
    localStorage.setItem("nedito:collapsedSections", JSON.stringify(["general", "not-a-real-section"]));
    expect(readCollapsedSections()).toEqual(new Set(["general"]));
  });

  it("readCollapsedSections falls back to the first-visit default when localStorage.getItem throws", () => {
    const spy = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(readCollapsedSections()).toEqual(new Set(SECTION_IDS.filter((id) => id !== "general")));
    spy.mockRestore();
  });

  it("writeCollapsedSections does not throw when localStorage.setItem throws", () => {
    const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota exceeded");
    });
    expect(() => writeCollapsedSections(new Set(["general"]))).not.toThrow();
    spy.mockRestore();
  });
});
