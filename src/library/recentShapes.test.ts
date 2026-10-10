// Recently used shapes (R4, CLAUDE_HISTORY.md D93).
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BRAND } from "../app/brand";
import { readRecentShapes, RECENT_SHAPES_LIMIT, recordShapeUse, subscribeRecentShapes } from "./recentShapes";

describe("recently used shapes", () => {
  beforeEach(() => localStorage.clear());

  it("starts empty, and lists the newest first", () => {
    expect(readRecentShapes()).toEqual([]);
    recordShapeUse("general/rect");
    recordShapeUse("flowchart/decision");
    expect(readRecentShapes()).toEqual(["flowchart/decision", "general/rect"]);
  });

  it("moves a shape used again to the front instead of listing it twice", () => {
    recordShapeUse("a");
    recordShapeUse("b");
    recordShapeUse("a");
    expect(readRecentShapes()).toEqual(["a", "b"]);
  });

  it(`keeps the last ${RECENT_SHAPES_LIMIT}`, () => {
    for (let i = 0; i < RECENT_SHAPES_LIMIT + 3; i++) recordShapeUse(`s${i}`);
    const list = readRecentShapes();
    expect(list).toHaveLength(RECENT_SHAPES_LIMIT);
    expect(list[0]).toBe(`s${RECENT_SHAPES_LIMIT + 2}`);
  });

  it("is stored under the brand's prefix, and survives a damaged value", () => {
    recordShapeUse("general/rect");
    expect(localStorage.getItem(`${BRAND.storagePrefix}:recentShapes`)).toBe('["general/rect"]');
    localStorage.setItem(`${BRAND.storagePrefix}:recentShapes`, "{nope");
    expect(readRecentShapes()).toEqual([]);
  });

  it("tells subscribers when a shape is recorded", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeRecentShapes(listener);
    recordShapeUse("general/rect");
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
    recordShapeUse("general/ellipse");
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
