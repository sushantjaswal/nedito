import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ShapeNode } from "./types";
import { captureScratchpadItem, readScratchpad, writeScratchpad } from "./scratchpad";

function shapeNode(overrides: Partial<ShapeNode> = {}): ShapeNode {
  return {
    id: "n1",
    type: "shape",
    shapeRef: "general/rect",
    position: { x: 0, y: 0 },
    size: { w: 100, h: 60 },
    z: 1,
    style: { fill: "#ff0000" },
    ...overrides,
  };
}

describe("scratchpad", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("readScratchpad returns an empty array when nothing was saved", () => {
    expect(readScratchpad()).toEqual([]);
  });

  it("writeScratchpad then readScratchpad round-trips items", () => {
    const item = captureScratchpadItem(shapeNode());
    writeScratchpad([item]);
    expect(readScratchpad()).toEqual([item]);
  });

  it("captureScratchpadItem snapshots shapeRef/size/style/label with a fresh id", () => {
    const node = shapeNode({ label: { text: "Hello", bold: true } });
    const item = captureScratchpadItem(node);
    expect(item.id).not.toBe(node.id);
    expect(item.shapeRef).toBe(node.shapeRef);
    expect(item.size).toEqual(node.size);
    expect(item.style).toEqual(node.style);
    expect(item.label).toEqual(node.label);
  });

  it("readScratchpad falls back to empty array when localStorage.getItem throws", () => {
    const spy = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(readScratchpad()).toEqual([]);
    spy.mockRestore();
  });

  it("writeScratchpad does not throw when localStorage.setItem throws", () => {
    const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota exceeded");
    });
    expect(() => writeScratchpad([captureScratchpadItem(shapeNode())])).not.toThrow();
    spy.mockRestore();
  });
});
