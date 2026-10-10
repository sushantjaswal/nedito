// Lines with free ends (EdgeEnd.point, formatVersion 4): drawn from the Lines
// section or let go on open canvas, attached and detached by dragging an end, and carried through
// every place that used to assume an edge always joins two shapes.
import { beforeEach, describe, expect, it } from "vitest";
import { useDocStore, createEmptyDoc } from "./store";
import { validateDoc } from "./validate";
import { copyEdges, edgesToCopy, isFreeEnd, isFreeLine, shiftEdge } from "./edgeEnds";
import { decodeDoc, encodeDoc, writtenVersion } from "../file/documentFormat";
import { stampClassicLook } from "./look";
import { computeDiagramBounds, diagramToSvg } from "../file/svgExport";
import type { DEdge } from "./types";

const state = () => useDocStore.getState();
const page = () => state().doc.diagrams[state().currentDiagramId()];
const edge = (id: string) => page().edges.find((e) => e.id === id)!;

beforeEach(() => {
  state().loadDoc(createEmptyDoc());
  useDocStore.temporal.getState().clear();
});

describe("edge ends", () => {
  const line: DEdge = { id: "l", source: { point: { x: 0, y: 0 } }, target: { point: { x: 10, y: 0 } }, style: {} };

  it("tells a free end from an attached one", () => {
    expect(isFreeEnd({ point: { x: 1, y: 2 } })).toBe(true);
    expect(isFreeEnd({ nodeId: "a" })).toBe(false);
    expect(isFreeLine(line)).toBe(true);
    expect(isFreeLine({ ...line, target: { nodeId: "a" } })).toBe(false);
  });

  it("moves a line's free ends and bends, never an attached end", () => {
    const half = { ...line, target: { nodeId: "a" }, waypoints: [{ x: 5, y: 5 }] };
    expect(shiftEdge(half, 3, 4)).toEqual({ ...half, source: { point: { x: 3, y: 4 } }, waypoints: [{ x: 8, y: 9 }] });
  });
});

describe("drawing and attaching lines", () => {
  it("adds a line free at both ends, selected, in one undo step", () => {
    const id = state().addLine({ source: { x: 10, y: 20 }, target: { x: 200, y: 20 }, style: { endArrow: "classic" } });
    expect(edge(id)).toMatchObject({ source: { point: { x: 10, y: 20 } }, target: { point: { x: 200, y: 20 } } });
    expect(edge(id).style).toMatchObject({ edgeStyle: "straight", startArrow: "none", endArrow: "classic" });
    expect(state().selection.edgeIds).toEqual([id]);
    expect(useDocStore.temporal.getState().pastStates).toHaveLength(1);
  });

  it("attaches a free end to a shape, and frees it again", () => {
    const box = state().addShapeNode("general/rect", { x: 300, y: 0 }, { w: 100, h: 60 });
    const id = state().addLine({ source: { x: 0, y: 30 }, target: { x: 200, y: 30 }, style: {} });
    state().reconnectEdge(id, "target", box, "left");
    expect(edge(id).target).toEqual({ nodeId: box, portId: undefined });
    expect(edge(id).style.targetHandle).toBe("left");

    state().setEdgeEndPoint(id, "target", { x: 250, y: 90 });
    expect(edge(id).target).toEqual({ point: { x: 250, y: 90 } });
    // A handle name means nothing without a node.
    expect(edge(id).style.targetHandle).toBeUndefined();
    expect(validateDoc(state().doc)).toEqual([]);
  });

  it("leaves a connection dropped on open canvas as a line from the shape", () => {
    const box = state().addShapeNode("general/rect", { x: 0, y: 0 }, { w: 100, h: 60 });
    const id = state().connectToPoint(box, "right", { x: 300, y: 30 });
    expect(edge(id).source.nodeId).toBe(box);
    expect(edge(id).target).toEqual({ point: { x: 300, y: 30 } });
    // An open chevron, Nedito's own default arrowhead (R6, D95).
    expect(edge(id).style).toMatchObject({ sourceHandle: "right", endArrow: "open" });
  });

  it("moves a free line as a whole, and leaves a connection between shapes alone", () => {
    const a = state().addShapeNode("general/rect", { x: 0, y: 0 }, { w: 100, h: 60 });
    const b = state().addShapeNode("general/rect", { x: 300, y: 0 }, { w: 100, h: 60 });
    const tied = state().connect({ sourceNodeId: a, sourceHandleId: "right", targetNodeId: b, targetHandleId: "left" });
    const free = state().addLine({ source: { x: 0, y: 200 }, target: { x: 100, y: 200 }, waypoints: [{ x: 50, y: 150 }], style: {} });
    state().moveEdges([free, tied], 10, -5);
    expect(edge(free).source.point).toEqual({ x: 10, y: 195 });
    expect(edge(free).waypoints).toEqual([{ x: 60, y: 145 }]);
    expect(edge(tied)).toEqual(page().edges.find((e) => e.id === tied));
    expect(edge(tied).source).toEqual({ nodeId: a, portId: undefined });
  });

  it("deletes a line with the shape it is attached to, as a connection always has, and leaves free lines", () => {
    const box = state().addShapeNode("general/rect", { x: 0, y: 0 }, { w: 100, h: 60 });
    const tied = state().connectToPoint(box, "right", { x: 300, y: 30 });
    const free = state().addLine({ source: { x: 0, y: 200 }, target: { x: 100, y: 200 }, style: {} });
    state().setSelection([box]);
    state().removeSelection();
    expect(page().edges.map((e) => e.id)).toEqual([free]);
    expect(page().edges.some((e) => e.id === tied)).toBe(false);
  });
});

describe("copying lines", () => {
  it("copies a selected free line and the connection between copied shapes, re-pointed at the copies", () => {
    const a = state().addShapeNode("general/rect", { x: 0, y: 0 }, { w: 100, h: 60 });
    const b = state().addShapeNode("general/rect", { x: 300, y: 0 }, { w: 100, h: 60 });
    const tied = state().connect({ sourceNodeId: a, sourceHandleId: "right", targetNodeId: b, targetHandleId: "left" });
    const free = state().addLine({ source: { x: 0, y: 200 }, target: { x: 100, y: 200 }, style: {} });
    state().setSelection([a, b], [free]);
    state().copySelection();
    state().pasteClipboard();

    const edges = page().edges;
    expect(edges).toHaveLength(4);
    const [newA, newB] = state().selection.nodeIds;
    const pastedTie = edges.find((e) => e.id !== tied && e.source.nodeId === newA)!;
    expect(pastedTie.target.nodeId).toBe(newB);
    const pastedFree = edges.find((e) => e.id !== free && isFreeLine(e))!;
    expect(pastedFree.source.point).toEqual({ x: 20, y: 220 });
    expect(state().selection.edgeIds).toEqual(expect.arrayContaining([pastedTie.id, pastedFree.id]));
  });

  it("does not take a connection to a shape that was not copied", () => {
    const edges: DEdge[] = [
      { id: "in", source: { nodeId: "a" }, target: { nodeId: "b" }, style: {} },
      { id: "out", source: { nodeId: "a" }, target: { nodeId: "z" }, style: {} },
      { id: "loose", source: { point: { x: 0, y: 0 } }, target: { point: { x: 9, y: 9 } }, style: {} },
    ];
    expect(edgesToCopy(edges, new Set(["a", "b"]), new Set()).map((e) => e.id)).toEqual(["in"]);
    expect(edgesToCopy(edges, new Set(), new Set(["loose", "out"])).map((e) => e.id)).toEqual(["loose"]);
    const [copy] = copyEdges([edges[0]], new Map([["a", "A"]]), () => "new", 5, 5);
    expect(copy).toMatchObject({ id: "new", source: { nodeId: "A" }, target: { nodeId: "b" } });
  });

  it("duplicates a selected line with Ctrl+D", () => {
    const free = state().addLine({ source: { x: 0, y: 0 }, target: { x: 100, y: 0 }, style: {} });
    state().duplicateSelection();
    expect(page().edges).toHaveLength(2);
    const [copyId] = state().selection.edgeIds;
    expect(copyId).not.toBe(free);
    expect(edge(copyId).source.point).toEqual({ x: 20, y: 20 });
  });
});

describe("the file format", () => {
  // In the classic look, so that only the free line decides the version; anything drawn in
  // Nedito's own look is v5 (R6, D95), covered in look.test.ts.
  it("writes a document with a free line as v4, and only then", () => {
    const a = state().addShapeNode("general/rect", { x: 0, y: 0 }, { w: 100, h: 60 });
    expect(writtenVersion(stampClassicLook(state().doc))).toBe(2);
    state().connectToPoint(a, "right", { x: 300, y: 30 });
    expect(writtenVersion(stampClassicLook(state().doc))).toBe(4);
    expect(JSON.parse(encodeDoc(stampClassicLook(state().doc))).formatVersion).toBe(4);
  });

  it("round-trips a free line exactly", () => {
    state().addLine({ source: { x: 1, y: 2 }, target: { x: 3, y: 4 }, waypoints: [{ x: 2, y: 9 }], style: { edgeShape: "double" } });
    const text = encodeDoc(state().doc);
    const decoded = decodeDoc(text);
    expect(decoded.ok).toBe(true);
    if (decoded.ok) expect(encodeDoc(decoded.doc)).toBe(text);
  });

  it("rejects an end that is neither attached nor free, or both", () => {
    const id = state().addLine({ source: { x: 0, y: 0 }, target: { x: 10, y: 0 }, style: {} });
    const doc = structuredClone(state().doc);
    const bad = doc.diagrams[doc.rootDiagramIds[0]].edges.find((e) => e.id === id)!;
    bad.target = {};
    expect(validateDoc(doc).map((e) => e.code)).toContain("BAD_EDGE_END");
    bad.target = { nodeId: "x", point: { x: 0, y: 0 } };
    expect(validateDoc(doc).map((e) => e.code)).toContain("BAD_EDGE_END");
    bad.target = { point: { x: Number.NaN, y: 0 } };
    expect(validateDoc(doc).map((e) => e.code)).toContain("BAD_EDGE_END");
  });
});

describe("exporting lines", () => {
  it("draws a page holding only lines, sized to them", () => {
    state().addLine({ source: { x: 100, y: 100 }, target: { x: 500, y: 300 }, style: { endArrow: "classic" } });
    const bounds = computeDiagramBounds(page());
    expect(bounds.width).toBe(400 + 80);
    expect(bounds.height).toBe(200 + 80);
    const svg = diagramToSvg(page(), { fontCss: "" });
    expect(svg).toMatch(/<path d="M ?40[ ,]40/);
    expect(svg).toContain('marker-end="url(#nd-arrow-classic)"');
    // A line with no width of its own is drawn 1pt wide.
    expect(svg).toMatch(/<path d="[^"]+" fill="none" stroke="[^"]+" stroke-width="1" marker-end/);
  });

  it("draws a block arrow as an outlined body and head, not a marker", () => {
    state().addLine({ source: { x: 0, y: 0 }, target: { x: 300, y: 0 }, style: { edgeShape: "arrow", endArrow: "classic" } });
    const svg = diagramToSvg(page(), { background: "#ffffff", fontCss: "" });
    expect(svg).not.toContain('marker-end="url(#nd-arrow-classic)"');
    // The body (wide line stroke, then paper down its middle) and one closed head.
    expect(svg).toMatch(/stroke-width="12"/);
    expect(svg).toMatch(/stroke="#ffffff" stroke-width="10"/);
    expect(svg.match(/ Z" fill="#ffffff"/g)).toHaveLength(1);
  });
});

describe("the wavy line", () => {
  it("is a wave along the line, ends on the line's own ends, and keeps its arrowheads", async () => {
    const { wavePath } = await import("../canvas/edgeShapes");
    const d = wavePath([{ x: 0, y: 0 }, { x: 80, y: 0 }], 4);
    expect(d.startsWith("M0,0")).toBe(true);
    expect(d.endsWith("80,0")).toBe(true);
    // Ten half-waves of 8px: straight at each end so a head points along the line, waves between.
    expect(d.startsWith("M0,0 L8,0 Q12,8 16,0 Q20,-8 24,0")).toBe(true);
    expect(d.endsWith("L80,0")).toBe(true);
    expect(d.match(/Q/g)).toHaveLength(8);

    const { cacheStencils, loadSection } = await import("../library/stencils");
    cacheStencils((await loadSection("lines"))!.shapes);
    state().addShapeNode("lines/wavy", { x: 0, y: 0 }, { w: 160, h: 40 });
    const [line] = page().edges;
    expect(line.style.edgeShape).toBe("wavy");
    state().setEdgeStyle([line.id], { endArrow: "classic" });
    const svg = diagramToSvg(page(), { fontCss: "" });
    expect(svg).toMatch(/<path d="M40,40 L[\d.]+,40 Q[^"]+" fill="none" stroke=/);
    expect(svg).toContain('marker-end="url(#nd-arrow-classic)"');
  });
});
