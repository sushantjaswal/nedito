import { describe, expect, it } from "vitest";
import { createDefaultLayers } from "../model/layers";
import type { DEdge, Diagram, ShapeNode } from "../model/types";
import { faceEdges, facingSides } from "./faceEdges";

const box = (id: string, x: number, y: number): ShapeNode => ({
  id,
  type: "shape",
  shapeRef: "general/rect",
  position: { x, y },
  size: { w: 100, h: 50 },
  z: 1,
  style: {},
});

const page = (edges: DEdge[]): Diagram => ({
  id: "d",
  title: "Page",
  layers: createDefaultLayers(),
  nodes: [box("a", 0, 0), box("right", 300, 20), box("below", 10, 300)],
  edges,
});

describe("facingSides", () => {
  it("runs along whichever axis separates the centres more", () => {
    expect(facingSides(box("a", 0, 0), box("b", 300, 20))).toEqual(["right", "left"]);
    expect(facingSides(box("a", 300, 20), box("b", 0, 0))).toEqual(["left", "right"]);
    expect(facingSides(box("a", 0, 0), box("b", 10, 300))).toEqual(["bottom", "top"]);
    expect(facingSides(box("a", 10, 300), box("b", 0, 0))).toEqual(["top", "bottom"]);
  });
});

describe("facingSides with shapes that are not square", () => {
  // A UML fork bar: wide and flat. The box sits below its left end, further away sideways from
  // the bar's centre than downwards — a centre-to-centre rule sent the edge out of the bar's tip.
  const bar: ShapeNode = { ...box("bar", 230, 340), size: { w: 280, h: 14 } };
  const below: ShapeNode = { ...box("pack", 190, 390), size: { w: 150, h: 60 } };

  it("drops straight down from a wide bar to a box beneath one end of it", () => {
    expect(facingSides(bar, below)).toEqual(["bottom", "top"]);
    expect(facingSides(below, bar)).toEqual(["top", "bottom"]);
  });

  it("runs sideways between boxes that share a row", () => {
    const tall: ShapeNode = { ...box("tall", 400, 300), size: { w: 60, h: 400 } };
    expect(facingSides(below, tall)).toEqual(["right", "left"]);
  });
});

describe("faceEdges", () => {
  it("fills in both ends of an edge that names neither", () => {
    const out = faceEdges(page([{ id: "e", source: { nodeId: "a" }, target: { nodeId: "below" }, style: {} }]));
    expect(out.edges[0].style).toMatchObject({ sourceHandle: "bottom", targetHandle: "top" });
  });

  it("keeps a side the template chose", () => {
    const out = faceEdges(
      page([{ id: "e", source: { nodeId: "a" }, target: { nodeId: "right" }, style: { sourceHandle: "top" } }]),
    );
    expect(out.edges[0].style).toMatchObject({ sourceHandle: "top", targetHandle: "left" });
  });

  it("leaves a port end alone, since its handle comes from portId", () => {
    const out = faceEdges(
      page([{ id: "e", source: { nodeId: "a" }, target: { nodeId: "right", portId: "p1" }, style: {} }]),
    );
    expect(out.edges[0].style.sourceHandle).toBe("right");
    expect(out.edges[0].style.targetHandle).toBeUndefined();
  });

  it("does not touch the diagram it was given", () => {
    const input = page([{ id: "e", source: { nodeId: "a" }, target: { nodeId: "right" }, style: {} }]);
    faceEdges(input);
    expect(input.edges[0].style).toEqual({});
  });
});
