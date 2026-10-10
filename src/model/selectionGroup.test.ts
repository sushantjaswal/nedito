import { describe, expect, it } from "vitest";
import type { DNode } from "./types";
import { canGroupSelection, canUngroupSelection, groupOfSelection } from "./selectionGroup";

const shape = (id: string): DNode => ({ id, type: "shape", shapeRef: "general/rect", position: { x: 0, y: 0 }, size: { w: 10, h: 10 }, z: 1, style: {} });
const nodes: DNode[] = [
  shape("a"),
  shape("b"),
  shape("c"),
  { id: "g", type: "group", childIds: ["a", "b"], position: { x: 0, y: 0 }, size: { w: 10, h: 10 }, z: 0, style: {} },
];

describe("the selection's group", () => {
  it("is found however the group was selected: itself, its members, or both", () => {
    expect(groupOfSelection(nodes, ["g"])?.id).toBe("g");
    expect(groupOfSelection(nodes, ["a", "b"])?.id).toBe("g");
    expect(groupOfSelection(nodes, ["g", "a", "b"])?.id).toBe("g");
  });

  it("does not offer Ungroup for a plain shape, nor Group for an existing group", () => {
    expect(canUngroupSelection(nodes, ["c"])).toBe(false);
    expect(canUngroupSelection(nodes, ["a", "b"])).toBe(true);
    expect(canGroupSelection(nodes, ["a", "b"])).toBe(false);
    expect(canGroupSelection(nodes, ["a", "c"])).toBe(true);
    expect(canGroupSelection(nodes, ["c"])).toBe(false);
  });
});
