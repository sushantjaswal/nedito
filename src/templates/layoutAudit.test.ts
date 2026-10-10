import { beforeAll, describe, expect, it } from "vitest";
import { cacheStencils, loadSection } from "../library/stencils";
import type { DEdge, Diagram, ShapeNode } from "../model/types";
import { auditDiagram } from "./layoutAudit";

beforeAll(async () => {
  const s = await loadSection("general");
  if (s) cacheStencils(s.shapes);
});

function box(id: string, x: number, y: number, w = 100, h = 50, text = id): ShapeNode {
  return { id, type: "shape", shapeRef: "general/rect", position: { x, y }, size: { w, h }, z: 1, style: {}, label: { text } };
}

function line(id: string, from: string, to: string, text?: string): DEdge {
  const e: DEdge = { id, source: { nodeId: from }, target: { nodeId: to }, style: { edgeStyle: "straight", sourceHandle: "right", targetHandle: "left" } };
  if (text) e.label = { text };
  return e;
}

const diagram = (nodes: ShapeNode[], edges: DEdge[] = []): Diagram => ({ id: "d", title: "D", nodes, edges });
const kinds = (d: Diagram) => auditDiagram(d).map((i) => i.kind);

describe("the template layout audit", () => {
  it("passes a clean layout", () => {
    expect(auditDiagram(diagram([box("a", 0, 0), box("b", 300, 0)], [line("e", "a", "b")]))).toEqual([]);
  });

  it("catches a line running through a shape it does not join", () => {
    expect(kinds(diagram([box("a", 0, 0), box("mid", 150, 0), box("b", 300, 0)], [line("e", "a", "b")]))).toContain("edge-through-shape");
  });

  it("does not count a container the line runs inside", () => {
    const frame = { ...box("frame", -20, -20, 460, 100, "Frame"), style: { fill: "none" } };
    expect(auditDiagram(diagram([frame, box("a", 0, 0), box("b", 300, 0)], [line("e", "a", "b")]))).toEqual([]);
  });

  it("catches overlapping shapes and text too wide for its shape", () => {
    expect(kinds(diagram([box("a", 0, 0), box("b", 50, 10)]))).toContain("shapes-overlap");
    expect(kinds(diagram([box("a", 0, 0, 60, 40, "A label far too long for this box")]))).toContain("text-overflow");
  });

  it("catches a line's label sitting on a shape", () => {
    expect(kinds(diagram([box("a", 0, 0), box("b", 140, 0)], [line("e", "a", "b", "a long label here")]))).toContain("label-on-shape");
  });
});
