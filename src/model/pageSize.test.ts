import { describe, expect, it } from "vitest";
import { matchPreset, orientationOf, PAGE_PRESETS, pageGrid, pxToPt, withOrientation } from "./pageSize";

describe("page presets", () => {
  it("defines A4 and Letter at their real sizes in 96dpi pixels", () => {
    const a4 = PAGE_PRESETS.find((p) => p.id === "a4")!.size;
    const letter = PAGE_PRESETS.find((p) => p.id === "letter")!.size;
    // 210x297mm and 8.5x11in.
    expect(a4).toEqual({ w: 794, h: 1123 });
    expect(letter).toEqual({ w: 816, h: 1056 });
  });

  it("every preset is stored portrait-first", () => {
    for (const p of PAGE_PRESETS) expect(p.size.w).toBeLessThanOrEqual(p.size.h);
  });
});

describe("withOrientation", () => {
  it("swaps the axes for landscape and is idempotent", () => {
    const a4 = { w: 794, h: 1123 };
    const landscape = withOrientation(a4, "landscape");
    expect(landscape).toEqual({ w: 1123, h: 794 });
    expect(withOrientation(landscape, "landscape")).toEqual(landscape);
    expect(withOrientation(landscape, "portrait")).toEqual(a4);
  });
});

describe("matchPreset", () => {
  it("recognises a preset in either orientation", () => {
    expect(matchPreset({ w: 794, h: 1123 })).toBe("a4");
    expect(matchPreset({ w: 1123, h: 794 })).toBe("a4");
  });

  it("reports custom for a size that isn't a preset", () => {
    expect(matchPreset({ w: 500, h: 500 })).toBe("custom");
  });
});

describe("orientationOf", () => {
  it("treats a square page as portrait", () => {
    expect(orientationOf({ w: 500, h: 500 })).toBe("portrait");
    expect(orientationOf({ w: 600, h: 500 })).toBe("landscape");
  });
});

describe("pxToPt", () => {
  it("converts 96dpi pixels to 72dpi points", () => {
    expect(pxToPt(96)).toBe(72);
    expect(pxToPt(794)).toBeCloseTo(595.5, 1);
  });
});

describe("pageGrid", () => {
  const page = { w: 100, h: 100 };

  it("is a single page when the content fits inside the first one", () => {
    expect(pageGrid({ minX: 10, minY: 10, maxX: 90, maxY: 90 }, page)).toEqual({
      originX: 0,
      originY: 0,
      cols: 1,
      rows: 1,
    });
  });

  it("grows to cover content spilling past the first page", () => {
    expect(pageGrid({ minX: 0, minY: 0, maxX: 250, maxY: 120 }, page)).toEqual({
      originX: 0,
      originY: 0,
      cols: 3,
      rows: 2,
    });
  });

  it("extends backwards for content at negative coordinates, keeping the origin on the grid", () => {
    // Pages stay anchored to the origin so page 1 always covers the same region — content drawn
    // above/left of it extends the sheet backwards rather than shifting every other page.
    const grid = pageGrid({ minX: -150, minY: -10, maxX: 50, maxY: 50 }, page);
    expect(grid.originX).toBe(-200);
    expect(grid.originY).toBe(-100);
    expect(grid.cols).toBe(3);
    expect(grid.rows).toBe(2);
  });

  it("still reports one page for an empty diagram", () => {
    expect(pageGrid({ minX: 0, minY: 0, maxX: 0, maxY: 0 }, page)).toEqual({
      originX: 0,
      originY: 0,
      cols: 1,
      rows: 1,
    });
  });
});
