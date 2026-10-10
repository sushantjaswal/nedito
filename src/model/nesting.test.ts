import { describe, expect, it } from "vitest";
import { addEdge, addNode, removeSelection } from "./actions";
import {
  addNestedNode,
  addPort,
  cascadePortCleanup,
  collectDescendantDiagramIds,
  convertSelectionToNested,
  ensurePortForConnection,
  findDiagramPath,
  mapPort,
  removePort,
  removeSelectionCascading,
  setNestedCollapsed,
  updatePort,
} from "./nesting";
import type { DiagramDocument, NestedNode, Port, ShapeNode } from "./types";

function emptyDoc(diagramId = "root"): DiagramDocument {
  return {
    formatVersion: 1,
    meta: { title: "Untitled", created: "2026-08-05", modified: "2026-08-05", appVersion: "0.0.1" },
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

describe("addNestedNode", () => {
  it("creates an empty child diagram and a nested node referencing it", () => {
    const doc = emptyDoc();
    const { doc: next, nestedNodeId, childDiagramId } = addNestedNode(doc, "root", { x: 10, y: 10 }, { w: 200, h: 140 });

    const nested = next.diagrams.root.nodes.find((n) => n.id === nestedNodeId) as NestedNode;
    expect(nested.type).toBe("nested");
    expect(nested.childDiagramId).toBe(childDiagramId);
    expect(next.diagrams[childDiagramId]).toBeDefined();
    expect(next.diagrams[childDiagramId].nodes).toEqual([]);
  });
});

describe("convertSelectionToNested", () => {
  it("returns null for an empty selection", () => {
    const doc = emptyDoc();
    expect(convertSelectionToNested(doc, "root", [])).toBeNull();
  });

  it("moves selected nodes into a new child diagram and replaces them with a nested node", () => {
    let doc = emptyDoc();
    doc = addNode(doc, "root", shape("a", { position: { x: 100, y: 100 } }));
    doc = addNode(doc, "root", shape("b", { position: { x: 250, y: 100 } }));
    doc = addNode(doc, "root", shape("outside", { position: { x: 500, y: 500 } }));

    const result = convertSelectionToNested(doc, "root", ["a", "b"], "Payment Service")!;
    expect(result).not.toBeNull();

    const rootDiagram = result.doc.diagrams.root;
    expect(rootDiagram.nodes.map((n) => n.id).sort()).toEqual(["outside", result.nestedNodeId].sort());

    const nested = rootDiagram.nodes.find((n) => n.id === result.nestedNodeId) as NestedNode;
    expect(nested.childDiagramId).toBe(result.childDiagramId);
    // The live miniature, as for a block from the sidebar: no icons, no summary to go stale (D113).
    expect(nested.collapsed).toEqual({ icons: [] });
    expect(nested.label).toEqual({ text: "Payment Service" });

    const child = result.doc.diagrams[result.childDiagramId];
    expect(child.title).toBe("Payment Service");
    expect(child.nodes.map((n) => n.id).sort()).toEqual(["a", "b"]);
    // child node positions are rebased to start near the CHILD_MARGIN, not the original coords
    const childA = child.nodes.find((n) => n.id === "a")!;
    expect(childA.position.x).toBeGreaterThanOrEqual(0);
    expect(childA.position.x).toBeLessThan(100);
  });

  it("auto-creates ports for boundary-crossing edges: incoming left, outgoing right", () => {
    let doc = emptyDoc();
    doc = addNode(doc, "root", shape("gateway", { position: { x: 0, y: 0 } }));
    doc = addNode(doc, "root", shape("inner", { position: { x: 300, y: 0 } }));
    doc = addNode(doc, "root", shape("db", { position: { x: 600, y: 0 } }));
    doc = addEdge(doc, "root", { id: "e-in", source: { nodeId: "gateway" }, target: { nodeId: "inner" }, style: {} });
    doc = addEdge(doc, "root", { id: "e-out", source: { nodeId: "inner" }, target: { nodeId: "db" }, style: {} });

    const result = convertSelectionToNested(doc, "root", ["inner"])!;
    const nested = result.doc.diagrams.root.nodes.find((n) => n.id === result.nestedNodeId) as NestedNode;

    expect(nested.ports).toHaveLength(2);
    const inPort = nested.ports.find((p) => p.side === "left")!;
    const outPort = nested.ports.find((p) => p.side === "right")!;
    expect(inPort.innerNodeId).toBe("inner");
    expect(outPort.innerNodeId).toBe("inner");

    const rootEdges = result.doc.diagrams.root.edges;
    const rewrittenIn = rootEdges.find((e) => e.id === "e-in")!;
    const rewrittenOut = rootEdges.find((e) => e.id === "e-out")!;
    expect(rewrittenIn.target).toEqual({ nodeId: result.nestedNodeId, portId: inPort.id });
    expect(rewrittenIn.source).toEqual({ nodeId: "gateway" });
    expect(rewrittenOut.source).toEqual({ nodeId: result.nestedNodeId, portId: outPort.id });
    expect(rewrittenOut.target).toEqual({ nodeId: "db" });
  });

  it("moves fully-internal edges into the child diagram", () => {
    let doc = emptyDoc();
    doc = addNode(doc, "root", shape("a", { position: { x: 0, y: 0 } }));
    doc = addNode(doc, "root", shape("b", { position: { x: 200, y: 0 } }));
    doc = addEdge(doc, "root", { id: "e-internal", source: { nodeId: "a" }, target: { nodeId: "b" }, style: {} });

    const result = convertSelectionToNested(doc, "root", ["a", "b"])!;
    expect(result.doc.diagrams.root.edges).toEqual([]);
    expect(result.doc.diagrams[result.childDiagramId].edges.map((e) => e.id)).toEqual(["e-internal"]);
  });
});

describe("port CRUD", () => {
  function docWithNested() {
    let doc = emptyDoc();
    const created = addNestedNode(doc, "root", { x: 0, y: 0 }, { w: 200, h: 140 });
    doc = created.doc;
    doc = addNode(doc, created.childDiagramId, shape("inner1"));
    return { doc, nestedId: created.nestedNodeId, childId: created.childDiagramId };
  }

  it("addPort appends a port with a generated id", () => {
    const { doc, nestedId } = docWithNested();
    const next = addPort(doc, "root", nestedId, { side: "left", offset: 0.5, innerNodeId: "inner1" });
    const nested = next.diagrams.root.nodes.find((n) => n.id === nestedId) as NestedNode;
    expect(nested.ports).toHaveLength(1);
    expect(nested.ports[0].innerNodeId).toBe("inner1");
  });

  it("updatePort patches an existing port", () => {
    const { doc, nestedId } = docWithNested();
    const withPort = addPort(doc, "root", nestedId, { side: "left", offset: 0.5, innerNodeId: "inner1" });
    const portId = ((withPort.diagrams.root.nodes.find((n) => n.id === nestedId) as NestedNode).ports[0] as Port).id;
    const next = updatePort(withPort, "root", nestedId, portId, { label: "API" });
    const nested = next.diagrams.root.nodes.find((n) => n.id === nestedId) as NestedNode;
    expect(nested.ports[0].label).toBe("API");
  });

  it("removePort drops the port and clears portId from referencing edges", () => {
    const { doc, nestedId } = docWithNested();
    let next = addPort(doc, "root", nestedId, { side: "left", offset: 0.5, innerNodeId: "inner1" });
    const portId = ((next.diagrams.root.nodes.find((n) => n.id === nestedId) as NestedNode).ports[0] as Port).id;
    next = addNode(next, "root", shape("outside"));
    next = addEdge(next, "root", { id: "e1", source: { nodeId: "outside" }, target: { nodeId: nestedId, portId }, style: {} });

    const after = removePort(next, "root", nestedId, portId);
    const nested = after.diagrams.root.nodes.find((n) => n.id === nestedId) as NestedNode;
    expect(nested.ports).toEqual([]);
    const edge = after.diagrams.root.edges.find((e) => e.id === "e1")!;
    expect(edge.target).toEqual({ nodeId: nestedId, portId: undefined });
  });
});

describe("setNestedCollapsed", () => {
  it("patches icons/summary on the nested node", () => {
    const doc = emptyDoc();
    const { doc: withNested, nestedNodeId } = addNestedNode(doc, "root", { x: 0, y: 0 }, { w: 200, h: 140 });
    const next = setNestedCollapsed(withNested, "root", nestedNodeId, { summary: "Payment flow" });
    const nested = next.diagrams.root.nodes.find((n) => n.id === nestedNodeId) as NestedNode;
    expect(nested.collapsed.summary).toBe("Payment flow");
  });
});

describe("collectDescendantDiagramIds", () => {
  it("finds nested diagrams recursively", () => {
    let doc = emptyDoc();
    const level1 = addNestedNode(doc, "root", { x: 0, y: 0 }, { w: 200, h: 140 });
    doc = level1.doc;
    const level2 = addNestedNode(doc, level1.childDiagramId, { x: 0, y: 0 }, { w: 200, h: 140 });
    doc = level2.doc;

    const descendants = collectDescendantDiagramIds(doc, "root");
    expect(descendants.sort()).toEqual([level1.childDiagramId, level2.childDiagramId].sort());
  });

  it("returns an empty array for a diagram with no nested nodes", () => {
    const doc = emptyDoc();
    expect(collectDescendantDiagramIds(doc, "root")).toEqual([]);
  });
});

describe("ensurePortForConnection", () => {
  function docWithNested() {
    const created = addNestedNode(emptyDoc(), "root", { x: 0, y: 0 }, { w: 200, h: 140 });
    return { doc: created.doc, nestedId: created.nestedNodeId };
  }
  const portsOf = (doc: DiagramDocument, nestedId: string) =>
    (doc.diagrams.root.nodes.find((n) => n.id === nestedId) as NestedNode).ports;

  it("creates an unmapped port on the side the edge was dropped on", () => {
    const { doc, nestedId } = docWithNested();
    const res = ensurePortForConnection(doc, "root", nestedId, undefined, "left", "in");
    const ports = portsOf(res.doc, nestedId);
    expect(ports).toHaveLength(1);
    expect(ports[0].id).toBe(res.portId);
    expect(ports[0].side).toBe("left");
    expect(ports[0].innerNodeId).toBeUndefined();
    expect(ports[0].label).toBe("in-1");
  });

  it("derives the side from a corner handle's leading token", () => {
    const { doc, nestedId } = docWithNested();
    const res = ensurePortForConnection(doc, "root", nestedId, undefined, "bottom-right", "out");
    expect(portsOf(res.doc, nestedId)[0].side).toBe("bottom");
  });

  it("re-spaces ports sharing a side so a later one doesn't land on an existing one", () => {
    const { doc, nestedId } = docWithNested();
    const first = ensurePortForConnection(doc, "root", nestedId, undefined, "left", "in");
    const second = ensurePortForConnection(first.doc, "root", nestedId, undefined, "left", "in");
    const offsets = portsOf(second.doc, nestedId).map((p) => p.offset);
    expect(offsets).toEqual([1 / 3, 2 / 3]);
    expect(portsOf(second.doc, nestedId)[1].label).toBe("in-2");
  });

  it("reuses an existing port rather than creating a duplicate", () => {
    const { doc, nestedId } = docWithNested();
    const res = ensurePortForConnection(doc, "root", nestedId, "existing-port", "left", "in");
    expect(res.portId).toBe("existing-port");
    expect(portsOf(res.doc, nestedId)).toHaveLength(0);
  });

  it("leaves a plain shape alone — only nested nodes get auto-ports", () => {
    let doc = emptyDoc();
    doc = addNode(doc, "root", shape("plain"));
    const res = ensurePortForConnection(doc, "root", "plain", undefined, "left", "in");
    expect(res.portId).toBeUndefined();
    expect(res.doc).toBe(doc);
  });
});

describe("mapPort", () => {
  it("points a waiting port at an inner node", () => {
    let doc = emptyDoc();
    const created = addNestedNode(doc, "root", { x: 0, y: 0 }, { w: 200, h: 140 });
    doc = created.doc;
    doc = addNode(doc, created.childDiagramId, shape("inner1"));
    const withPort = ensurePortForConnection(doc, "root", created.nestedNodeId, undefined, "left", "in");

    const next = mapPort(withPort.doc, "root", created.nestedNodeId, withPort.portId!, "inner1");
    const port = (next.diagrams.root.nodes.find((n) => n.id === created.nestedNodeId) as NestedNode).ports[0];
    expect(port.innerNodeId).toBe("inner1");
  });
});

describe("cascadePortCleanup", () => {
  it("unmaps (rather than deletes) a port whose inner node was deleted, keeping the parent's edge intact", () => {
    let doc = emptyDoc();
    const created = addNestedNode(doc, "root", { x: 0, y: 0 }, { w: 200, h: 140 });
    doc = created.doc;
    doc = addNode(doc, created.childDiagramId, shape("inner1"));
    doc = addPort(doc, "root", created.nestedNodeId, { side: "left", offset: 0.5, innerNodeId: "inner1" });
    const portId = (
      (doc.diagrams.root.nodes.find((n) => n.id === created.nestedNodeId) as NestedNode).ports[0] as Port
    ).id;
    doc = addNode(doc, "root", shape("outside"));
    doc = addEdge(doc, "root", {
      id: "e1",
      source: { nodeId: "outside" },
      target: { nodeId: created.nestedNodeId, portId },
      style: {},
    });

    const next = cascadePortCleanup(doc, created.childDiagramId, ["inner1"]);
    const nested = next.diagrams.root.nodes.find((n) => n.id === created.nestedNodeId) as NestedNode;
    // The port survives with innerNodeId cleared, so the external edge stays attached to it and
    // shows up inside the child as an amber "needs relinking" ghost instead of silently
    // degrading to a plain node-level edge the author would never notice losing.
    expect(nested.ports).toHaveLength(1);
    expect(nested.ports[0].innerNodeId).toBeUndefined();
    expect(next.diagrams.root.edges[0].target.portId).toBe(portId);
  });
});

describe("removeSelectionCascading", () => {
  it("deletes a nested node's whole child-diagram subtree", () => {
    let doc = emptyDoc();
    const level1 = addNestedNode(doc, "root", { x: 0, y: 0 }, { w: 200, h: 140 });
    doc = level1.doc;
    const level2 = addNestedNode(doc, level1.childDiagramId, { x: 0, y: 0 }, { w: 200, h: 140 });
    doc = level2.doc;

    const next = removeSelectionCascading(doc, "root", [level1.nestedNodeId], [], removeSelection);
    expect(next.diagrams[level1.childDiagramId]).toBeUndefined();
    expect(next.diagrams[level2.childDiagramId]).toBeUndefined();
    expect(next.diagrams.root.nodes).toEqual([]);
  });

  it("cascades port unmapping when deleting an inner node referenced by an ancestor port", () => {
    let doc = emptyDoc();
    const created = addNestedNode(doc, "root", { x: 0, y: 0 }, { w: 200, h: 140 });
    doc = created.doc;
    doc = addNode(doc, created.childDiagramId, shape("inner1"));
    doc = addPort(doc, "root", created.nestedNodeId, { side: "left", offset: 0.5, innerNodeId: "inner1" });

    const next = removeSelectionCascading(doc, created.childDiagramId, ["inner1"], [], removeSelection);
    const nested = next.diagrams.root.nodes.find((n) => n.id === created.nestedNodeId) as NestedNode;
    expect(nested.ports).toHaveLength(1);
    expect(nested.ports[0].innerNodeId).toBeUndefined();
  });

  it("leaves unrelated diagrams untouched when deleting a plain shape", () => {
    let doc = emptyDoc();
    doc = addNode(doc, "root", shape("a"));
    doc = addNode(doc, "root", shape("b"));
    const next = removeSelectionCascading(doc, "root", ["a"], [], removeSelection);
    expect(next.diagrams.root.nodes.map((n) => n.id)).toEqual(["b"]);
  });
});

describe("findDiagramPath", () => {
  it("finds a direct path to a root diagram", () => {
    const doc = emptyDoc();
    expect(findDiagramPath(doc, "root")).toEqual(["root"]);
  });

  it("finds a path through nested levels", () => {
    let doc = emptyDoc();
    const level1 = addNestedNode(doc, "root", { x: 0, y: 0 }, { w: 200, h: 140 });
    doc = level1.doc;
    const level2 = addNestedNode(doc, level1.childDiagramId, { x: 0, y: 0 }, { w: 200, h: 140 });
    doc = level2.doc;

    expect(findDiagramPath(doc, level2.childDiagramId)).toEqual(["root", level1.childDiagramId, level2.childDiagramId]);
  });

  it("returns null for an unreachable diagram id", () => {
    const doc = emptyDoc();
    expect(findDiagramPath(doc, "ghost")).toBeNull();
  });
});
