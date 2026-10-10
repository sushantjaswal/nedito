import { describe, expect, it } from "vitest";
import {
  addEdge,
  addNode,
  alignNodes,
  bringToFront,
  distributeNodes,
  duplicateNodes,
  moveBackward,
  moveForward,
  removeEdges,
  removeSelection,
  sendToBack,
  setDiagramBackground,
  setNodeLabel,
  updateEdge,
  updateNodes,
} from "./actions";
import type { DEdge, DiagramDocument, ShapeNode } from "./types";

function emptyDoc(diagramId = "d1"): DiagramDocument {
  return {
    formatVersion: 1,
    meta: { title: "Untitled", created: "2026-08-04", modified: "2026-08-04", appVersion: "0.0.1" },
    rootDiagramIds: [diagramId],
    diagrams: { [diagramId]: { id: diagramId, title: "Page 1", nodes: [], edges: [] } },
  };
}

function shape(id: string, overrides: Partial<ShapeNode> = {}): Omit<ShapeNode, "z"> {
  return {
    id,
    type: "shape",
    shapeRef: "general/rect",
    position: { x: 0, y: 0 },
    size: { w: 100, h: 60 },
    style: {},
    ...overrides,
  };
}

describe("addNode", () => {
  it("appends the node and assigns an incrementing z", () => {
    let doc = emptyDoc();
    doc = addNode(doc, "d1", shape("n1"));
    doc = addNode(doc, "d1", shape("n2"));
    expect(doc.diagrams.d1.nodes.map((n) => [n.id, n.z])).toEqual([
      ["n1", 1],
      ["n2", 2],
    ]);
  });

});

describe("removeSelection", () => {
  it("removes selected nodes and edges touching them", () => {
    let doc = emptyDoc();
    doc = addNode(doc, "d1", shape("n1"));
    doc = addNode(doc, "d1", shape("n2"));
    doc.diagrams.d1.edges.push({
      id: "e1",
      source: { nodeId: "n1" },
      target: { nodeId: "n2" },
      style: {},
    });
    const next = removeSelection(doc, "d1", ["n1"], []);
    expect(next.diagrams.d1.nodes.map((n) => n.id)).toEqual(["n2"]);
    expect(next.diagrams.d1.edges).toEqual([]);
  });

  it("removes a directly selected edge even when its nodes survive", () => {
    let doc = emptyDoc();
    doc = addNode(doc, "d1", shape("n1"));
    doc = addNode(doc, "d1", shape("n2"));
    doc.diagrams.d1.edges.push({ id: "e1", source: { nodeId: "n1" }, target: { nodeId: "n2" }, style: {} });
    const next = removeSelection(doc, "d1", [], ["e1"]);
    expect(next.diagrams.d1.nodes).toHaveLength(2);
    expect(next.diagrams.d1.edges).toEqual([]);
  });
});

describe("updateNodes", () => {
  it("patches position/size/rotation for matching nodes only", () => {
    let doc = emptyDoc();
    doc = addNode(doc, "d1", shape("n1"));
    doc = addNode(doc, "d1", shape("n2"));
    const next = updateNodes(doc, "d1", [{ id: "n1", patch: { position: { x: 50, y: 60 }, rotation: 15 } }]);
    const n1 = next.diagrams.d1.nodes.find((n) => n.id === "n1")!;
    const n2 = next.diagrams.d1.nodes.find((n) => n.id === "n2")!;
    expect(n1.position).toEqual({ x: 50, y: 60 });
    expect(n1.rotation).toBe(15);
    expect(n2.position).toEqual({ x: 0, y: 0 });
  });
});

describe("setNodeLabel", () => {
  it("sets the label on the target node", () => {
    let doc = emptyDoc();
    doc = addNode(doc, "d1", shape("n1"));
    const next = setNodeLabel(doc, "d1", "n1", { text: "Hello" });
    expect(next.diagrams.d1.nodes[0].label).toEqual({ text: "Hello" });
  });
});

describe("bringToFront", () => {
  it("gives selected nodes the highest z values, preserving relative order", () => {
    let doc = emptyDoc();
    doc = addNode(doc, "d1", shape("n1"));
    doc = addNode(doc, "d1", shape("n2"));
    doc = addNode(doc, "d1", shape("n3"));
    const next = bringToFront(doc, "d1", ["n1"]);
    const zs = Object.fromEntries(next.diagrams.d1.nodes.map((n) => [n.id, n.z]));
    expect(zs.n1).toBeGreaterThan(zs.n2);
    expect(zs.n1).toBeGreaterThan(zs.n3);
  });
});

describe("duplicateNodes", () => {
  it("creates offset copies with new ids and returns the new ids", () => {
    let doc = emptyDoc();
    doc = addNode(doc, "d1", shape("n1", { position: { x: 10, y: 10 } }));
    const { doc: next, newIds } = duplicateNodes(doc, "d1", ["n1"]);
    expect(newIds).toHaveLength(1);
    expect(newIds[0]).not.toBe("n1");
    const copy = next.diagrams.d1.nodes.find((n) => n.id === newIds[0])!;
    expect(copy.position).toEqual({ x: 30, y: 30 });
    expect(next.diagrams.d1.nodes).toHaveLength(2);
  });
});

function edge(id: string, source: string, target: string, overrides: Partial<DEdge> = {}): DEdge {
  return { id, source: { nodeId: source }, target: { nodeId: target }, style: {}, ...overrides };
}

describe("addEdge / removeEdges / updateEdge", () => {
  it("adds an edge to the diagram", () => {
    let doc = emptyDoc();
    doc = addNode(doc, "d1", shape("n1"));
    doc = addNode(doc, "d1", shape("n2"));
    const next = addEdge(doc, "d1", edge("e1", "n1", "n2"));
    expect(next.diagrams.d1.edges).toHaveLength(1);
  });

  it("removes edges by id", () => {
    let doc = emptyDoc();
    doc = addEdge(doc, "d1", edge("e1", "n1", "n2"));
    doc = addEdge(doc, "d1", edge("e2", "n2", "n1"));
    const next = removeEdges(doc, "d1", ["e1"]);
    expect(next.diagrams.d1.edges.map((e) => e.id)).toEqual(["e2"]);
  });

  it("patches waypoints/style/label on the target edge only", () => {
    let doc = emptyDoc();
    doc = addEdge(doc, "d1", edge("e1", "n1", "n2"));
    doc = addEdge(doc, "d1", edge("e2", "n2", "n1"));
    const next = updateEdge(doc, "d1", "e1", { waypoints: [{ x: 5, y: 5 }], label: { text: "hi" } });
    const e1 = next.diagrams.d1.edges.find((e) => e.id === "e1")!;
    const e2 = next.diagrams.d1.edges.find((e) => e.id === "e2")!;
    expect(e1.waypoints).toEqual([{ x: 5, y: 5 }]);
    expect(e1.label).toEqual({ text: "hi" });
    expect(e2.waypoints).toBeUndefined();
  });
});

describe("z-order commands", () => {
  function docWithThree() {
    let doc = emptyDoc();
    doc = addNode(doc, "d1", shape("n1"));
    doc = addNode(doc, "d1", shape("n2"));
    doc = addNode(doc, "d1", shape("n3"));
    return doc;
  }

  it("sendToBack gives the node the lowest z", () => {
    const doc = docWithThree();
    const next = sendToBack(doc, "d1", ["n3"]);
    const zs = Object.fromEntries(next.diagrams.d1.nodes.map((n) => [n.id, n.z]));
    expect(zs.n3).toBeLessThan(zs.n1);
    expect(zs.n3).toBeLessThan(zs.n2);
  });

  it("moveForward swaps z with the next node up", () => {
    const doc = docWithThree(); // z: n1=1, n2=2, n3=3
    const next = moveForward(doc, "d1", ["n1"]);
    const zs = Object.fromEntries(next.diagrams.d1.nodes.map((n) => [n.id, n.z]));
    expect(zs.n1).toBe(2);
    expect(zs.n2).toBe(1);
    expect(zs.n3).toBe(3);
  });

  it("moveBackward swaps z with the next node down", () => {
    const doc = docWithThree(); // z: n1=1, n2=2, n3=3
    const next = moveBackward(doc, "d1", ["n3"]);
    const zs = Object.fromEntries(next.diagrams.d1.nodes.map((n) => [n.id, n.z]));
    expect(zs.n3).toBe(2);
    expect(zs.n2).toBe(3);
    expect(zs.n1).toBe(1);
  });
});

describe("alignNodes", () => {
  it("aligns left edges to the leftmost node", () => {
    let doc = emptyDoc();
    doc = addNode(doc, "d1", shape("n1", { position: { x: 0, y: 0 }, size: { w: 100, h: 50 } }));
    doc = addNode(doc, "d1", shape("n2", { position: { x: 50, y: 200 }, size: { w: 100, h: 50 } }));
    const next = alignNodes(doc, "d1", ["n1", "n2"], "left");
    const n2 = next.diagrams.d1.nodes.find((n) => n.id === "n2")!;
    expect(n2.position.x).toBe(0);
    expect(n2.position.y).toBe(200);
  });

  it("center-h aligns horizontal centers", () => {
    let doc = emptyDoc();
    doc = addNode(doc, "d1", shape("n1", { position: { x: 0, y: 0 }, size: { w: 100, h: 50 } }));
    doc = addNode(doc, "d1", shape("n2", { position: { x: 200, y: 0 }, size: { w: 50, h: 50 } }));
    const next = alignNodes(doc, "d1", ["n1", "n2"], "center-h");
    const n1 = next.diagrams.d1.nodes.find((n) => n.id === "n1")!;
    const n2 = next.diagrams.d1.nodes.find((n) => n.id === "n2")!;
    expect(n1.position.x + n1.size.w / 2).toBe(n2.position.x + n2.size.w / 2);
  });

  it("is a no-op with fewer than two nodes", () => {
    let doc = emptyDoc();
    doc = addNode(doc, "d1", shape("n1", { position: { x: 5, y: 5 } }));
    const next = alignNodes(doc, "d1", ["n1"], "left");
    expect(next.diagrams.d1.nodes[0].position).toEqual({ x: 5, y: 5 });
  });
});

describe("distributeNodes", () => {
  it("spaces three nodes evenly between the outer two", () => {
    let doc = emptyDoc();
    doc = addNode(doc, "d1", shape("n1", { position: { x: 0, y: 0 }, size: { w: 100, h: 50 } }));
    doc = addNode(doc, "d1", shape("n2", { position: { x: 130, y: 0 }, size: { w: 50, h: 50 } }));
    doc = addNode(doc, "d1", shape("n3", { position: { x: 400, y: 0 }, size: { w: 100, h: 50 } }));
    const next = distributeNodes(doc, "d1", ["n1", "n2", "n3"], "horizontal");
    const byId = Object.fromEntries(next.diagrams.d1.nodes.map((n) => [n.id, n]));
    // total span 0..500, total size 250, 2 gaps => 125 each
    expect(byId.n1.position.x).toBe(0);
    expect(byId.n2.position.x).toBe(225); // 0 + 100 + 125
    expect(byId.n3.position.x).toBe(400);
  });

  it("is a no-op with fewer than three nodes", () => {
    let doc = emptyDoc();
    doc = addNode(doc, "d1", shape("n1", { position: { x: 5, y: 5 } }));
    doc = addNode(doc, "d1", shape("n2", { position: { x: 50, y: 5 } }));
    const next = distributeNodes(doc, "d1", ["n1", "n2"], "horizontal");
    expect(next.diagrams.d1.nodes.map((n) => n.position.x)).toEqual([5, 50]);
  });
});

describe("setDiagramBackground", () => {
  it("sets the diagram's background color", () => {
    const doc = emptyDoc();
    const next = setDiagramBackground(doc, "d1", "#ff0000");
    expect(next.diagrams.d1.background).toBe("#ff0000");
  });

  it("clears the background when given undefined", () => {
    let doc = emptyDoc();
    doc = setDiagramBackground(doc, "d1", "#ff0000");
    const next = setDiagramBackground(doc, "d1", undefined);
    expect(next.diagrams.d1.background).toBeUndefined();
    expect("background" in next.diagrams.d1).toBe(false);
  });

  it("is a no-op for an unknown diagram id", () => {
    const doc = emptyDoc();
    const next = setDiagramBackground(doc, "missing", "#ff0000");
    expect(next).toBe(doc);
  });
});
