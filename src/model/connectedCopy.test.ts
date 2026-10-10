// The ＋ handles' connected copy.
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { cacheStencils, getStencil, loadSection } from "../library/stencils";
import { newShapeStyle } from "../library/stencils/defaultStyle";
import { addConnectedCopy, COPY_GAP, copyPosition } from "./connectedCopy";
import { createEmptyDoc, useDocStore } from "./store";
import type { DiagramDocument, DNode, NestedNode, ShapeNode } from "./types";

const GRID = 16;

// The copy's style comes from its stencil, so the stencils it copies must be loaded.
beforeAll(async () => {
  for (const id of ["general", "misc"] as const) {
    const section = await loadSection(id);
    if (section) cacheStencils(section.shapes);
  }
});

function shape(id: string, x: number, y: number, extra: Partial<ShapeNode> = {}): ShapeNode {
  return { id, type: "shape", shapeRef: "general/rounded-rect", position: { x, y }, size: { w: 160, h: 80 }, z: 0, style: {}, ...extra };
}

function docWith(nodes: DNode[]): { doc: DiagramDocument; diagramId: string } {
  const doc = createEmptyDoc();
  const diagramId = doc.rootDiagramIds[0];
  doc.diagrams[diagramId].nodes = nodes;
  return { doc, diagramId };
}

describe("copyPosition", () => {
  const source = shape("a", 192, 208);

  it("puts the copy COPY_GAP beyond the side it was asked for, in line with the shape", () => {
    expect(copyPosition(source, "right", [source], null)).toEqual({ x: 192 + 160 + COPY_GAP, y: 208 });
    expect(copyPosition(source, "left", [source], null)).toEqual({ x: 192 - 160 - COPY_GAP, y: 208 });
    expect(copyPosition(source, "bottom", [source], null)).toEqual({ x: 192, y: 208 + 80 + COPY_GAP });
    expect(copyPosition(source, "top", [source], null)).toEqual({ x: 192, y: 208 - 80 - COPY_GAP });
  });

  it("snaps along the way it goes, and stays in line across it", () => {
    const offGrid = shape("b", 201, 203);
    const right = copyPosition(offGrid, "right", [offGrid], GRID);
    expect(right.x % GRID).toBe(0);
    expect(right.y).toBe(203);
    const below = copyPosition(offGrid, "bottom", [offGrid], GRID);
    expect(below.x).toBe(201);
    expect(below.y % GRID).toBe(0);
  });

  it("steps further out while something already sits there, so repeated clicks make a chain", () => {
    const first = shape("c", 192 + 160 + COPY_GAP, 208);
    expect(copyPosition(source, "right", [source, first], null)).toEqual({ x: 192 + 2 * (160 + COPY_GAP), y: 208 });
  });
});

describe("addConnectedCopy", () => {
  it("adds the same kind and size of shape with the stencil's default style, not the original's formatting", () => {
    const { doc, diagramId } = docWith([shape("a", 0, 0, { style: { fill: "#ff0000", strokeWidth: 4 }, label: { text: "Start" } })]);
    const result = addConnectedCopy(doc, diagramId, "a", "right", { grid: null })!;
    const copy = result.doc.diagrams[diagramId].nodes.find((n) => n.id === result.nodeId) as ShapeNode;
    expect(copy.shapeRef).toBe("general/rounded-rect");
    expect(copy.size).toEqual({ w: 160, h: 80 });
    expect(copy.style).toEqual(newShapeStyle(getStencil("general/rounded-rect")));
    expect(copy.style.shadow).toBe(true);
    expect(copy.label).toBeUndefined();
  });

  it("connects the side clicked to the copy's facing side with the default edge style", () => {
    const { doc, diagramId } = docWith([shape("a", 0, 0)]);
    const result = addConnectedCopy(doc, diagramId, "a", "bottom", { grid: null })!;
    const edge = result.doc.diagrams[diagramId].edges.find((e) => e.id === result.edgeId)!;
    expect(edge.source.nodeId).toBe("a");
    expect(edge.target.nodeId).toBe(result.nodeId);
    expect(edge.style).toMatchObject({ edgeStyle: "curved", startArrow: "none", endArrow: "open", sourceHandle: "bottom", targetHandle: "top" });
  });

  it("keeps a picture's picture, which is what makes it that shape", () => {
    const { doc, diagramId } = docWith([shape("p", 0, 0, { shapeRef: "image", imageId: "asset-1" })]);
    const result = addConnectedCopy(doc, diagramId, "p", "right", { grid: null })!;
    const copy = result.doc.diagrams[diagramId].nodes.find((n) => n.id === result.nodeId) as ShapeNode;
    expect(copy.imageId).toBe("asset-1");
  });

  it("copies a Nested Block as a new, empty one with its own child diagram, on ports at both ends", () => {
    const store = useDocStore.getState();
    store.loadDoc(createEmptyDoc());
    const { nestedNodeId, childDiagramId } = useDocStore.getState().addNestedNode({ x: 0, y: 0 }, { w: 200, h: 140 });
    const { doc } = useDocStore.getState();
    const diagramId = doc.rootDiagramIds[0];
    const result = addConnectedCopy(doc, diagramId, nestedNodeId, "right", { grid: null })!;
    const copy = result.doc.diagrams[diagramId].nodes.find((n) => n.id === result.nodeId) as NestedNode;
    expect(copy.type).toBe("nested");
    expect(copy.childDiagramId).not.toBe(childDiagramId);
    expect(result.doc.diagrams[copy.childDiagramId].nodes).toEqual([]);
    const edge = result.doc.diagrams[diagramId].edges.find((e) => e.id === result.edgeId)!;
    expect(edge.source.portId).toBeDefined();
    expect(edge.target.portId).toBeDefined();
  });

  it("offers nothing for a group or a missing node", () => {
    const group: DNode = { id: "g", type: "group", position: { x: 0, y: 0 }, size: { w: 10, h: 10 }, z: 0, style: {} } as DNode;
    const { doc, diagramId } = docWith([group]);
    expect(addConnectedCopy(doc, diagramId, "g", "right", { grid: null })).toBeNull();
    expect(addConnectedCopy(doc, diagramId, "nope", "right", { grid: null })).toBeNull();
  });
});

describe("the store's addConnectedCopy", () => {
  const state = () => useDocStore.getState();
  const page = () => state().doc.diagrams[state().currentDiagramId()];

  beforeEach(() => {
    state().loadDoc(createEmptyDoc());
    useDocStore.setState((s) => ({ ui: { ...s.ui, viewerMode: false, snapEnabled: true } }));
  });

  it("selects the copy with its label open for typing, as one undo step", () => {
    const a = state().addShapeNode("general/rounded-rect", { x: 192, y: 208 }, { w: 160, h: 80 });
    useDocStore.temporal.getState().clear();
    const copy = state().addConnectedCopy(a, "right")!;
    expect(state().selection.nodeIds).toEqual([copy]);
    expect(state().editingNodeId).toBe(copy);
    expect(page().nodes).toHaveLength(2);
    expect(page().edges).toHaveLength(1);
    useDocStore.temporal.getState().undo();
    expect(page().nodes).toHaveLength(1);
    expect(page().edges).toHaveLength(0);
  });

  it("does nothing in the read-only viewer", () => {
    const a = state().addShapeNode("general/rounded-rect", { x: 0, y: 0 }, { w: 160, h: 80 });
    useDocStore.setState((s) => ({ ui: { ...s.ui, viewerMode: true } }));
    expect(state().addConnectedCopy(a, "right")).toBeNull();
    expect(page().nodes).toHaveLength(1);
  });
});
