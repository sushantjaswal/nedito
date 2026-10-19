// The two decisions in opening a comment that are worth pinning down: which side the card takes, and
// what counts as the thing being framed.
import { describe, expect, it } from "vitest";
import { cardSideFor, litBounds } from "./revealComment";
import type { Diagram, DEdge, DComment, ShapeNode } from "../model/types";

const shape = (id: string, x: number, y: number): ShapeNode => ({
  id,
  type: "shape",
  shapeRef: "general/rect",
  position: { x, y },
  size: { w: 100, h: 50 },
  z: 1,
  style: {},
});

const edge = (id: string, from: string, to: string): DEdge => ({ id, source: { nodeId: from }, target: { nodeId: to }, style: {} });

const diagram: Diagram = {
  id: "d1",
  title: "Page 1",
  nodes: [shape("a", 0, 0), shape("b", 400, 200), shape("far", 2000, 2000)],
  edges: [edge("e1", "a", "b")],
};

const comment = (focus: DComment["focus"]): DComment => ({ id: "n1", body: "x", focus });

describe("which side the card takes", () => {
  const WIDTH = 1000;
  const CENTRE = 500;

  it("goes opposite the lit shapes when it has not been anywhere yet", () => {
    expect(cardSideFor(100, CENTRE, WIDTH, null)).toBe("right");
    expect(cardSideFor(900, CENTRE, WIDTH, null)).toBe("left");
  });

  it("stays put while the subject is near the middle, rather than flipping about", () => {
    // Just past the midpoint, which without hysteresis would move the card every time.
    expect(cardSideFor(540, CENTRE, WIDTH, "right")).toBe("right");
    expect(cardSideFor(460, CENTRE, WIDTH, "left")).toBe("left");
    // Exactly at the threshold is still not far enough: it must be past it.
    expect(cardSideFor(CENTRE + WIDTH * 0.1, CENTRE, WIDTH, "right")).toBe("right");
  });

  it("changes sides once the subject is clearly over", () => {
    expect(cardSideFor(700, CENTRE, WIDTH, "right")).toBe("left");
    expect(cardSideFor(300, CENTRE, WIDTH, "left")).toBe("right");
  });

  it("leaves a card already on the right side alone, however far over the subject is", () => {
    expect(cardSideFor(10, CENTRE, WIDTH, "right")).toBe("right");
    expect(cardSideFor(990, CENTRE, WIDTH, "left")).toBe("left");
  });
});

describe("what gets framed", () => {
  it("is the shapes the comment names", () => {
    expect(litBounds(diagram, comment({ diagramId: "d1", nodeIds: ["a"] }))).toEqual({ x: 0, y: 0, w: 100, h: 50 });
  });

  it("is the shapes at both ends of a line the comment names, since that is what there is to look at", () => {
    expect(litBounds(diagram, comment({ diagramId: "d1", edgeIds: ["e1"] }))).toEqual({ x: 0, y: 0, w: 500, h: 250 });
  });

  it("is the whole level when the comment names nothing", () => {
    expect(litBounds(diagram, comment({ diagramId: "d1" }))).toEqual({ x: 0, y: 0, w: 2100, h: 2050 });
  });

  it("ignores an id that no longer resolves, and falls back to the level when none do", () => {
    expect(litBounds(diagram, comment({ diagramId: "d1", nodeIds: ["a", "gone"] }))).toEqual({ x: 0, y: 0, w: 100, h: 50 });
    // Every id gone makes it a comment about the level, which is exactly what it is now about.
    expect(litBounds(diagram, comment({ diagramId: "d1", nodeIds: ["gone"] }))).toEqual({ x: 0, y: 0, w: 2100, h: 2050 });
  });

  it("has nothing to frame on an empty level", () => {
    expect(litBounds({ id: "d2", title: "Empty", nodes: [], edges: [] }, comment({ diagramId: "d2" }))).toBeNull();
  });
});
