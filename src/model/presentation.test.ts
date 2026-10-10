// Presentation (A6, D123): one mode per level, an order that defaults to reading order, step edits
// that write that order out, and a file that never names a deleted shape.
import { describe, expect, it } from "vitest";
import { decodeDoc, encodeDoc, writtenVersion } from "../file/documentFormat";
import {
  addSteps,
  buildHidden,
  effectiveOrder,
  hasOwnOrder,
  moveStep,
  readingOrder,
  removeSteps,
  setPresentationMode,
  setPresentationOrder,
  spotlightLit,
} from "./presentation";
import { motionProblems } from "./motion";
import type { Diagram, DiagramDocument, DNode, ShapeNode } from "./types";
import { validateDoc } from "./validate";

const box = (id: string, x: number, y: number): ShapeNode => ({
  id,
  type: "shape",
  shapeRef: "general/rect",
  position: { x, y },
  size: { w: 100, h: 60 },
  z: 1,
  style: {},
});

// Laid out so creation order is not reading order: c is top-left, a bottom-right.
function doc(): DiagramDocument {
  const nodes: DNode[] = [box("a", 300, 300), box("b", 300, 10), box("c", 10, 0), { ...box("g", 0, 0), type: "group", childIds: [] } as DNode];
  return {
    formatVersion: 5,
    meta: { title: "t", created: "", modified: "", appVersion: "0" },
    rootDiagramIds: ["root"],
    diagrams: {
      root: {
        id: "root",
        title: "Page 1",
        nodes,
        edges: [
          { id: "cb", source: { nodeId: "c" }, target: { nodeId: "b" }, style: {} },
          { id: "ba", source: { nodeId: "b" }, target: { nodeId: "a" }, style: {} },
        ],
      },
    },
  };
}

const root = (d: DiagramDocument): Diagram => d.diagrams.root;
const walk = () => setPresentationMode(doc(), "root", "walkthrough");

describe("reading order", () => {
  it("runs top to bottom, then left to right, with near tops sharing a row; a group's frame is never a step", () => {
    expect(readingOrder(root(doc()))).toEqual(["c", "b", "a"]);
  });

  it("is the order until the author sets one", () => {
    const d = root(walk());
    expect(hasOwnOrder(d)).toBe(false);
    expect(effectiveOrder(d)).toEqual(["c", "b", "a"]);
  });

  it("is nothing at all without a mode", () => {
    expect(effectiveOrder(root(doc()))).toEqual([]);
  });
});

describe("the mode", () => {
  it("is one per level, and switching keeps the order", () => {
    let d = setPresentationOrder(walk(), "root", ["a", "c"]);
    d = setPresentationMode(d, "root", "build");
    expect(root(d).motion).toEqual({ presentation: { mode: "build", order: ["a", "c"] } });
  });

  it("none removes it, and a level left with no motion loses the property — written exactly as before", () => {
    const plain = encodeDoc(doc());
    const off = setPresentationMode(setPresentationOrder(walk(), "root", ["a"]), "root", null);
    expect("motion" in root(off)).toBe(false);
    // (Every edit stamps meta.modified; the diagrams are what must match.)
    expect(encodeDoc({ ...off, meta: doc().meta })).toBe(plain);
  });

  it("keeps Draw in when the mode is removed", () => {
    const d = { ...walk(), diagrams: { root: { ...root(walk()), motion: { drawIn: true as const, presentation: { mode: "build" as const, order: [] } } } } };
    expect(root(setPresentationMode(d, "root", null)).motion).toEqual({ drawIn: true });
  });

  it("makes the document v6, and survives a round trip", () => {
    const d = setPresentationOrder(walk(), "root", ["b", "cb", "a"]);
    expect(writtenVersion(d)).toBe(6);
    const back = decodeDoc(encodeDoc(d));
    expect(back.ok).toBe(true);
    if (back.ok) {
      expect(root(back.doc).motion).toEqual({ presentation: { mode: "walkthrough", order: ["b", "cb", "a"] } });
      expect(encodeDoc(back.doc)).toBe(encodeDoc(d));
    }
  });
});

describe("step edits", () => {
  it("the first edit writes the reading order out, then edits it", () => {
    const d = root(walk());
    expect(moveStep(d, "a", -1)).toEqual(["c", "a", "b"]);
    expect(removeSteps(d, ["b"])).toEqual(["c", "a"]);
  });

  it("moving past either end stays put", () => {
    const d = root(walk());
    expect(moveStep(d, "c", -1)).toEqual(["c", "b", "a"]);
    expect(moveStep(d, "a", 1)).toEqual(["c", "b", "a"]);
  });

  it("adds after the last step, several in reading order among themselves; lines can be steps", () => {
    const d = root(setPresentationOrder(walk(), "root", ["b"]));
    expect(addSteps(d, ["a", "c"])).toEqual(["b", "c", "a"]);
    expect(addSteps(d, ["ba"])).toEqual(["b", "ba"]);
    // Already a step: not added twice.
    expect(addSteps(d, ["b"])).toEqual(["b"]);
  });

  it("an order is stored without repeats", () => {
    expect(root(setPresentationOrder(walk(), "root", ["a", "a", "b"])).motion?.presentation?.order).toEqual(["a", "b"]);
  });
});

describe("a deleted step", () => {
  const deleteA = (d: DiagramDocument): DiagramDocument => ({
    ...d,
    diagrams: { root: { ...root(d), nodes: root(d).nodes.filter((n) => n.id !== "a"), edges: root(d).edges.filter((e) => e.id !== "ba") } },
  });

  it("stays in memory, so undo brings its step back, but is skipped", () => {
    const d = deleteA(setPresentationOrder(walk(), "root", ["a", "b"]));
    expect(root(d).motion?.presentation?.order).toEqual(["a", "b"]);
    expect(effectiveOrder(root(d))).toEqual(["b"]);
  });

  it("is never written: the file still validates", () => {
    const d = deleteA(setPresentationOrder(walk(), "root", ["a", "ba", "b"]));
    // In memory the order names shapes that are gone — exactly what validation rejects in a file.
    expect(motionProblems(d)).not.toHaveLength(0);
    const back = decodeDoc(encodeDoc(d));
    expect(back.ok).toBe(true);
    if (back.ok) {
      expect(root(back.doc).motion?.presentation?.order).toEqual(["b"]);
      expect(validateDoc(back.doc)).toEqual([]);
    }
  });

  it("an order left empty falls back to reading order", () => {
    const d = deleteA(setPresentationOrder(walk(), "root", ["a"]));
    expect(effectiveOrder(root(d))).toEqual(["c", "b"]);
  });
});

describe("Build", () => {
  const build = (order: string[]) => root(setPresentationOrder(setPresentationMode(doc(), "root", "build"), "root", order));

  it("hides the steps not shown yet; shapes outside the order are there from the start", () => {
    expect([...buildHidden(build(["a", "b"]), 0)].sort()).toEqual(["a", "b", "ba", "cb"]);
    expect(buildHidden(build(["a", "b"]), 2).size).toBe(0);
  });

  it("a line outside the order appears with the later of its ends", () => {
    const d = build(["c", "b", "a"]);
    expect(buildHidden(d, 1).has("cb")).toBe(true);
    expect(buildHidden(d, 2).has("cb")).toBe(false);
    expect(buildHidden(d, 2).has("ba")).toBe(true);
  });

  it("a line in the order waits for its own step", () => {
    const d = build(["c", "b", "cb"]);
    expect(buildHidden(d, 2).has("cb")).toBe(true);
    expect(buildHidden(d, 3).has("cb")).toBe(false);
  });
});

describe("Spotlight", () => {
  it("lights a shape alone, and a line with the shapes at its ends", () => {
    const d = root(walk());
    expect(spotlightLit(d, "b")).toEqual({ nodes: new Set(["b"]), edges: new Set() });
    expect(spotlightLit(d, "cb")).toEqual({ nodes: new Set(["c", "b"]), edges: new Set(["cb"]) });
  });
});
