import { describe, expect, it } from "vitest";
import type { Diagram, NestedNode } from "../model/types";
import { findNestedNodeUnderDrop } from "./nestedDropDetection";

function nested(id: string, x: number, y: number, w = 200, h = 140): NestedNode {
  return {
    id,
    type: "nested",
    position: { x, y },
    size: { w, h },
    z: 1,
    style: {},
    childDiagramId: `${id}-child`,
    collapsed: { icons: [] },
    ports: [],
  };
}

function diagram(nodes: NestedNode[]): Diagram {
  return { id: "d1", title: "Diagram", nodes, edges: [] };
}

describe("findNestedNodeUnderDrop", () => {
  it("finds a nested node whose bounding box overlaps the dropped shape", () => {
    const target = nested("n1", 100, 100);
    const d = diagram([target]);
    // Dropped box sits well inside the nested node's bounds.
    const hit = findNestedNodeUnderDrop(d, { x: 150, y: 150, w: 40, h: 40 });
    expect(hit?.id).toBe("n1");
  });

  it("returns null when the dropped shape doesn't overlap any nested node", () => {
    const d = diagram([nested("n1", 100, 100)]);
    const hit = findNestedNodeUnderDrop(d, { x: 500, y: 500, w: 40, h: 40 });
    expect(hit).toBeNull();
  });

  it("ignores diagrams with no nested nodes", () => {
    const d = diagram([]);
    const hit = findNestedNodeUnderDrop(d, { x: 100, y: 100, w: 40, h: 40 });
    expect(hit).toBeNull();
  });

  it("detects a partial (edge-touching) overlap, not just full containment", () => {
    const d = diagram([nested("n1", 100, 100, 200, 140)]);
    // Dropped box straddles the nested node's right edge (nested spans x:100-300).
    const hit = findNestedNodeUnderDrop(d, { x: 280, y: 150, w: 40, h: 40 });
    expect(hit?.id).toBe("n1");
  });
});
