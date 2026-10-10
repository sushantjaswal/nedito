import { describe, expect, it } from "vitest";
import { validateDoc } from "./validate";
import type { DiagramDocument, Diagram, NestedNode, ShapeNode } from "./types";

function emptyDoc(): DiagramDocument {
  return {
    formatVersion: 1,
    meta: { title: "Untitled", created: "2026-08-04", modified: "2026-08-04", appVersion: "0.0.1" },
    rootDiagramIds: [],
    diagrams: {},
  };
}

function shapeNode(id: string, overrides: Partial<ShapeNode> = {}): ShapeNode {
  return {
    id,
    type: "shape",
    shapeRef: "general/rect",
    position: { x: 0, y: 0 },
    size: { w: 100, h: 60 },
    z: 0,
    style: {},
    ...overrides,
  };
}

function diagram(id: string, overrides: Partial<Diagram> = {}): Diagram {
  return { id, title: id, nodes: [], edges: [], ...overrides };
}

describe("validateDoc", () => {
  it("passes for an empty doc", () => {
    expect(validateDoc(emptyDoc())).toEqual([]);
  });

  it("passes for a valid single diagram doc", () => {
    const doc = emptyDoc();
    doc.rootDiagramIds = ["d1"];
    doc.diagrams.d1 = diagram("d1", { nodes: [shapeNode("n1")] });
    expect(validateDoc(doc)).toEqual([]);
  });

  it("flags a rootDiagramIds entry that does not exist", () => {
    const doc = emptyDoc();
    doc.rootDiagramIds = ["missing"];
    const errors = validateDoc(doc);
    expect(errors).toContainEqual(
      expect.objectContaining({ code: "MISSING_ROOT_DIAGRAM", diagramId: "missing" }),
    );
  });

  it("flags a nested node whose childDiagramId does not exist", () => {
    const doc = emptyDoc();
    const nested: NestedNode = {
      id: "nested1",
      type: "nested",
      childDiagramId: "ghost",
      collapsed: { icons: [] },
      ports: [],
      position: { x: 0, y: 0 },
      size: { w: 160, h: 100 },
      z: 0,
      style: {},
    };
    doc.rootDiagramIds = ["d1"];
    doc.diagrams.d1 = diagram("d1", { nodes: [nested] });
    const errors = validateDoc(doc);
    expect(errors).toContainEqual(
      expect.objectContaining({ code: "MISSING_CHILD_DIAGRAM", nodeId: "nested1" }),
    );
  });

  it("flags a direct nesting cycle (diagram nests itself)", () => {
    const doc = emptyDoc();
    const nested: NestedNode = {
      id: "nested1",
      type: "nested",
      childDiagramId: "d1",
      collapsed: { icons: [] },
      ports: [],
      position: { x: 0, y: 0 },
      size: { w: 160, h: 100 },
      z: 0,
      style: {},
    };
    doc.rootDiagramIds = ["d1"];
    doc.diagrams.d1 = diagram("d1", { nodes: [nested] });
    const errors = validateDoc(doc);
    expect(errors.some((e) => e.code === "CYCLE")).toBe(true);
  });

  it("flags an indirect nesting cycle (A -> B -> A)", () => {
    const doc = emptyDoc();
    const nestedA: NestedNode = {
      id: "nestedA",
      type: "nested",
      childDiagramId: "b",
      collapsed: { icons: [] },
      ports: [],
      position: { x: 0, y: 0 },
      size: { w: 160, h: 100 },
      z: 0,
      style: {},
    };
    const nestedB: NestedNode = {
      id: "nestedB",
      type: "nested",
      childDiagramId: "a",
      collapsed: { icons: [] },
      ports: [],
      position: { x: 0, y: 0 },
      size: { w: 160, h: 100 },
      z: 0,
      style: {},
    };
    doc.rootDiagramIds = ["a"];
    doc.diagrams.a = diagram("a", { nodes: [nestedA] });
    doc.diagrams.b = diagram("b", { nodes: [nestedB] });
    const errors = validateDoc(doc);
    expect(errors.some((e) => e.code === "CYCLE")).toBe(true);
  });

  it("flags a port whose innerNodeId does not exist in the child diagram", () => {
    const doc = emptyDoc();
    const nested: NestedNode = {
      id: "nested1",
      type: "nested",
      childDiagramId: "child",
      collapsed: { icons: [] },
      ports: [{ id: "p1", side: "left", offset: 0.5, innerNodeId: "missingInner" }],
      position: { x: 0, y: 0 },
      size: { w: 160, h: 100 },
      z: 0,
      style: {},
    };
    doc.rootDiagramIds = ["d1"];
    doc.diagrams.d1 = diagram("d1", { nodes: [nested] });
    doc.diagrams.child = diagram("child", { nodes: [shapeNode("innerReal")] });
    const errors = validateDoc(doc);
    expect(errors).toContainEqual(
      expect.objectContaining({ code: "DANGLING_PORT", nodeId: "nested1" }),
    );
  });

  it("passes for an unmapped port — a waiting connection is legal, not a dangling reference", () => {
    const doc = emptyDoc();
    const nested: NestedNode = {
      id: "nested1",
      type: "nested",
      childDiagramId: "child",
      collapsed: { icons: [] },
      ports: [{ id: "p1", side: "left", offset: 0.5 }],
      position: { x: 0, y: 0 },
      size: { w: 160, h: 100 },
      z: 0,
      style: {},
    };
    doc.rootDiagramIds = ["d1"];
    doc.diagrams.d1 = diagram("d1", { nodes: [nested] });
    doc.diagrams.child = diagram("child", { nodes: [] });
    expect(validateDoc(doc)).toEqual([]);
  });

  it("passes when a port correctly maps to an inner node", () => {
    const doc = emptyDoc();
    const nested: NestedNode = {
      id: "nested1",
      type: "nested",
      childDiagramId: "child",
      collapsed: { icons: [] },
      ports: [{ id: "p1", side: "left", offset: 0.5, innerNodeId: "innerReal" }],
      position: { x: 0, y: 0 },
      size: { w: 160, h: 100 },
      z: 0,
      style: {},
    };
    doc.rootDiagramIds = ["d1"];
    doc.diagrams.d1 = diagram("d1", { nodes: [nested] });
    doc.diagrams.child = diagram("child", { nodes: [shapeNode("innerReal")] });
    expect(validateDoc(doc)).toEqual([]);
  });

  it("flags duplicate ids across diagrams", () => {
    const doc = emptyDoc();
    doc.rootDiagramIds = ["d1", "d2"];
    doc.diagrams.d1 = diagram("d1", { nodes: [shapeNode("dup")] });
    doc.diagrams.d2 = diagram("d2", { nodes: [shapeNode("dup")] });
    const errors = validateDoc(doc);
    expect(errors.some((e) => e.code === "DUPLICATE_ID")).toBe(true);
  });

  it("passes when a node's layerId matches a real layer", () => {
    const doc = emptyDoc();
    doc.rootDiagramIds = ["d1"];
    doc.diagrams.d1 = diagram("d1", {
      layers: [{ id: "L1", name: "Layer 1", visible: true, locked: false }],
      nodes: [shapeNode("n1", { layerId: "L1" })],
    });
    expect(validateDoc(doc)).toEqual([]);
  });

  it("flags a node's layerId that does not match any of the diagram's real layers", () => {
    const doc = emptyDoc();
    doc.rootDiagramIds = ["d1"];
    doc.diagrams.d1 = diagram("d1", {
      layers: [{ id: "L1", name: "Layer 1", visible: true, locked: false }],
      nodes: [shapeNode("n1", { layerId: "ghost" })],
    });
    const errors = validateDoc(doc);
    expect(errors.some((e) => e.code === "DANGLING_LAYER_ID")).toBe(true);
  });

  it("does not flag a missing layerId when the diagram has no real layers array yet", () => {
    const doc = emptyDoc();
    doc.rootDiagramIds = ["d1"];
    doc.diagrams.d1 = diagram("d1", { nodes: [shapeNode("n1")] });
    expect(validateDoc(doc)).toEqual([]);
  });
});
