import { beforeEach, describe, expect, it } from "vitest";
import { useDocStore } from "./store";
import type { NestedNode } from "./types";
import { readScratchpad } from "./scratchpad";

function resetStore() {
  const initial = useDocStore.getState();
  const rootId = initial.doc.rootDiagramIds[0];
  useDocStore.setState({
    doc: {
      ...initial.doc,
      rootDiagramIds: [rootId],
      diagrams: { [rootId]: { id: rootId, title: "Page 1", nodes: [], edges: [] } },
    },
    navStack: [rootId],
    selection: { nodeIds: [], edgeIds: [] },
    editingNodeId: null,
    editingEdgeId: null,
    clipboard: null,
    viewportByDiagramId: {},
    scratchpad: [],
  });
  useDocStore.temporal.getState().clear();
  localStorage.clear();
}

describe("useDocStore", () => {
  beforeEach(resetStore);

  it("addShapeNode adds a node to the current diagram and selects it", () => {
    const id = useDocStore.getState().addShapeNode("general/rect", { x: 10, y: 10 }, { w: 100, h: 60 });
    const diagramId = useDocStore.getState().currentDiagramId();
    expect(useDocStore.getState().doc.diagrams[diagramId].nodes).toHaveLength(1);
    expect(useDocStore.getState().selection.nodeIds).toEqual([id]);
  });

  it("undo/redo reverts and reapplies a doc change without touching selection tracking", () => {
    useDocStore.getState().addShapeNode("general/rect", { x: 0, y: 0 }, { w: 100, h: 60 });
    const diagramId = useDocStore.getState().currentDiagramId();
    expect(useDocStore.getState().doc.diagrams[diagramId].nodes).toHaveLength(1);

    useDocStore.temporal.getState().undo();
    expect(useDocStore.getState().doc.diagrams[diagramId].nodes).toHaveLength(0);

    useDocStore.temporal.getState().redo();
    expect(useDocStore.getState().doc.diagrams[diagramId].nodes).toHaveLength(1);
  });

  it("duplicateSelection creates an offset copy and selects it", () => {
    const id = useDocStore.getState().addShapeNode("general/rect", { x: 0, y: 0 }, { w: 100, h: 60 });
    useDocStore.getState().setSelection([id]);
    useDocStore.getState().duplicateSelection();
    const diagramId = useDocStore.getState().currentDiagramId();
    expect(useDocStore.getState().doc.diagrams[diagramId].nodes).toHaveLength(2);
    expect(useDocStore.getState().selection.nodeIds).not.toEqual([id]);
  });

  it("copySelection then pasteClipboard adds a new offset node", () => {
    const id = useDocStore.getState().addShapeNode("general/rect", { x: 0, y: 0 }, { w: 100, h: 60 });
    useDocStore.getState().setSelection([id]);
    useDocStore.getState().copySelection();
    useDocStore.getState().pasteClipboard();
    const diagramId = useDocStore.getState().currentDiagramId();
    expect(useDocStore.getState().doc.diagrams[diagramId].nodes).toHaveLength(2);
  });

  it("removeSelection deletes selected nodes and clears selection", () => {
    const id = useDocStore.getState().addShapeNode("general/rect", { x: 0, y: 0 }, { w: 100, h: 60 });
    useDocStore.getState().setSelection([id]);
    useDocStore.getState().removeSelection();
    const diagramId = useDocStore.getState().currentDiagramId();
    expect(useDocStore.getState().doc.diagrams[diagramId].nodes).toHaveLength(0);
    expect(useDocStore.getState().selection.nodeIds).toEqual([]);
  });

  it("connect adds an edge between two nodes and selects it", () => {
    const a = useDocStore.getState().addShapeNode("general/rect", { x: 0, y: 0 }, { w: 100, h: 60 });
    const b = useDocStore.getState().addShapeNode("general/rect", { x: 200, y: 0 }, { w: 100, h: 60 });
    const edgeId = useDocStore
      .getState()
      .connect({ sourceNodeId: a, sourceHandleId: "right", targetNodeId: b, targetHandleId: "left" });
    const diagramId = useDocStore.getState().currentDiagramId();
    const edges = useDocStore.getState().doc.diagrams[diagramId].edges;
    expect(edges).toHaveLength(1);
    expect(edges[0].id).toBe(edgeId);
    expect(useDocStore.getState().selection).toEqual({ nodeIds: [], edgeIds: [edgeId] });
  });

  it("connect records portId on the edge end when the handle is a port handle", () => {
    const created = useDocStore.getState().addNestedNode({ x: 0, y: 0 }, { w: 200, h: 140 });
    useDocStore.getState().navigateInto(created.nestedNodeId);
    const inner = useDocStore.getState().addShapeNode("general/rect", { x: 0, y: 0 }, { w: 100, h: 60 });
    useDocStore.getState().navigateBack();
    useDocStore.getState().addPort(created.nestedNodeId, { side: "left", offset: 0.5, innerNodeId: inner });
    const rootId = useDocStore.getState().currentDiagramId();
    const nested = useDocStore.getState().doc.diagrams[rootId].nodes.find((n) => n.id === created.nestedNodeId) as {
      ports: { id: string }[];
    };
    const portId = nested.ports[0].id;

    const outside = useDocStore.getState().addShapeNode("general/rect", { x: 300, y: 0 }, { w: 100, h: 60 });
    const edgeId = useDocStore
      .getState()
      .connect({ sourceNodeId: outside, sourceHandleId: "right", targetNodeId: created.nestedNodeId, targetHandleId: `port:${portId}` });

    const edge = useDocStore.getState().doc.diagrams[rootId].edges.find((e) => e.id === edgeId)!;
    expect(edge.target).toEqual({ nodeId: created.nestedNodeId, portId });
    expect(edge.source).toEqual({ nodeId: outside, portId: undefined });
  });

  it("connect auto-creates an unmapped port when an edge lands on a nested node's body", () => {
    // Reproduces the reported flow: drop a nested node, wire something straight to its edge
    // while the child is still empty. Before this, the edge got no portId at all and the
    // connection was invisible from inside the child.
    const created = useDocStore.getState().addNestedNode({ x: 300, y: 0 }, { w: 200, h: 140 });
    const outside = useDocStore.getState().addShapeNode("general/rect", { x: 0, y: 0 }, { w: 100, h: 60 });
    const rootId = useDocStore.getState().currentDiagramId();

    const edgeId = useDocStore
      .getState()
      .connect({ sourceNodeId: outside, sourceHandleId: "right", targetNodeId: created.nestedNodeId, targetHandleId: "left" });

    const nested = useDocStore.getState().doc.diagrams[rootId].nodes.find((n) => n.id === created.nestedNodeId) as {
      ports: { id: string; innerNodeId?: string; side: string }[];
    };
    expect(nested.ports).toHaveLength(1);
    expect(nested.ports[0].innerNodeId).toBeUndefined();
    expect(nested.ports[0].side).toBe("left");

    const edge = useDocStore.getState().doc.diagrams[rootId].edges.find((e) => e.id === edgeId)!;
    expect(edge.target.portId).toBe(nested.ports[0].id);
  });

  it("mapUnlinkedPort links a waiting port to a node inside the child, from within the child", () => {
    const created = useDocStore.getState().addNestedNode({ x: 300, y: 0 }, { w: 200, h: 140 });
    const outside = useDocStore.getState().addShapeNode("general/rect", { x: 0, y: 0 }, { w: 100, h: 60 });
    const rootId = useDocStore.getState().currentDiagramId();
    useDocStore
      .getState()
      .connect({ sourceNodeId: outside, sourceHandleId: "right", targetNodeId: created.nestedNodeId, targetHandleId: "left" });
    const portId = (
      useDocStore.getState().doc.diagrams[rootId].nodes.find((n) => n.id === created.nestedNodeId) as {
        ports: { id: string }[];
      }
    ).ports[0].id;

    useDocStore.getState().navigateInto(created.nestedNodeId);
    const inner = useDocStore.getState().addShapeNode("general/rect", { x: 0, y: 0 }, { w: 100, h: 60 });
    useDocStore.getState().mapUnlinkedPort(portId, inner);

    const nested = useDocStore.getState().doc.diagrams[rootId].nodes.find((n) => n.id === created.nestedNodeId) as {
      ports: { innerNodeId?: string }[];
    };
    expect(nested.ports[0].innerNodeId).toBe(inner);
  });

  it("removeSelection also deletes a directly selected edge", () => {
    const a = useDocStore.getState().addShapeNode("general/rect", { x: 0, y: 0 }, { w: 100, h: 60 });
    const b = useDocStore.getState().addShapeNode("general/rect", { x: 200, y: 0 }, { w: 100, h: 60 });
    useDocStore.getState().connect({ sourceNodeId: a, sourceHandleId: "right", targetNodeId: b, targetHandleId: "left" });
    useDocStore.getState().removeSelection();
    const diagramId = useDocStore.getState().currentDiagramId();
    expect(useDocStore.getState().doc.diagrams[diagramId].edges).toEqual([]);
  });

  it("updateEdgeWaypoints and setEdgeLabel patch the target edge", () => {
    const a = useDocStore.getState().addShapeNode("general/rect", { x: 0, y: 0 }, { w: 100, h: 60 });
    const b = useDocStore.getState().addShapeNode("general/rect", { x: 200, y: 0 }, { w: 100, h: 60 });
    const edgeId = useDocStore
      .getState()
      .connect({ sourceNodeId: a, sourceHandleId: "right", targetNodeId: b, targetHandleId: "left" });
    useDocStore.getState().updateEdgeWaypoints(edgeId, [{ x: 150, y: 30 }]);
    useDocStore.getState().setEdgeLabel(edgeId, { text: "flows to" });
    const diagramId = useDocStore.getState().currentDiagramId();
    const edge = useDocStore.getState().doc.diagrams[diagramId].edges.find((e) => e.id === edgeId)!;
    expect(edge.waypoints).toEqual([{ x: 150, y: 30 }]);
    expect(edge.label).toEqual({ text: "flows to" });
    expect(useDocStore.getState().editingEdgeId).toBeNull();
  });

  it("addNestedNode creates a child diagram and selects the nested node", () => {
    const { nestedNodeId, childDiagramId } = useDocStore.getState().addNestedNode({ x: 0, y: 0 }, { w: 200, h: 140 });
    const diagramId = useDocStore.getState().currentDiagramId();
    const nested = useDocStore.getState().doc.diagrams[diagramId].nodes.find((n) => n.id === nestedNodeId);
    expect(nested?.type).toBe("nested");
    expect(useDocStore.getState().doc.diagrams[childDiagramId]).toBeDefined();
    expect(useDocStore.getState().selection.nodeIds).toEqual([nestedNodeId]);
  });

  it("navigateInto/navigateBack push and pop the diagram nav stack", () => {
    const { nestedNodeId, childDiagramId } = useDocStore.getState().addNestedNode({ x: 0, y: 0 }, { w: 200, h: 140 });
    const rootId = useDocStore.getState().currentDiagramId();

    useDocStore.getState().navigateInto(nestedNodeId);
    expect(useDocStore.getState().currentDiagramId()).toBe(childDiagramId);
    expect(useDocStore.getState().navStack).toEqual([rootId, childDiagramId]);

    useDocStore.getState().navigateBack();
    expect(useDocStore.getState().currentDiagramId()).toBe(rootId);
  });

  it("navigateBack at the root is a no-op", () => {
    const rootId = useDocStore.getState().currentDiagramId();
    useDocStore.getState().navigateBack();
    expect(useDocStore.getState().navStack).toEqual([rootId]);
  });

  it("navigateToLevel truncates the nav stack to a breadcrumb index", () => {
    const level1 = useDocStore.getState().addNestedNode({ x: 0, y: 0 }, { w: 200, h: 140 });
    useDocStore.getState().navigateInto(level1.nestedNodeId);
    const level2 = useDocStore.getState().addNestedNode({ x: 0, y: 0 }, { w: 200, h: 140 });
    useDocStore.getState().navigateInto(level2.nestedNodeId);
    expect(useDocStore.getState().navStack).toHaveLength(3);

    useDocStore.getState().navigateToLevel(0);
    expect(useDocStore.getState().navStack).toHaveLength(1);
  });

  it("convertSelectionToNested moves the selection into a new child diagram", () => {
    const a = useDocStore.getState().addShapeNode("general/rect", { x: 0, y: 0 }, { w: 100, h: 60 });
    const b = useDocStore.getState().addShapeNode("general/rect", { x: 200, y: 0 }, { w: 100, h: 60 });
    useDocStore.getState().setSelection([a, b]);

    const result = useDocStore.getState().convertSelectionToNested("Payment Service")!;
    expect(result).not.toBeNull();

    const rootId = useDocStore.getState().currentDiagramId();
    const rootNodes = useDocStore.getState().doc.diagrams[rootId].nodes;
    expect(rootNodes).toHaveLength(1);
    expect(rootNodes[0].id).toBe(result.nestedNodeId);
    expect(useDocStore.getState().doc.diagrams[result.childDiagramId].nodes.map((n) => n.id).sort()).toEqual([a, b].sort());
    expect(useDocStore.getState().selection.nodeIds).toEqual([result.nestedNodeId]);
  });

  it("port add/update/remove round-trips through the store", () => {
    const created = useDocStore.getState().addNestedNode({ x: 0, y: 0 }, { w: 200, h: 140 });
    useDocStore.getState().navigateInto(created.nestedNodeId);
    const inner = useDocStore.getState().addShapeNode("general/rect", { x: 0, y: 0 }, { w: 100, h: 60 });
    useDocStore.getState().navigateBack();

    useDocStore.getState().addPort(created.nestedNodeId, { side: "left", offset: 0.5, innerNodeId: inner });
    const rootId = useDocStore.getState().currentDiagramId();
    const getNested = () =>
      useDocStore.getState().doc.diagrams[rootId].nodes.find((n) => n.id === created.nestedNodeId) as NestedNode;

    expect(getNested().ports).toHaveLength(1);
    const portId = getNested().ports[0].id;

    useDocStore.getState().updatePort(created.nestedNodeId, portId, { label: "API" });
    expect(getNested().ports[0].label).toBe("API");

    useDocStore.getState().removePort(created.nestedNodeId, portId);
    expect(getNested().ports).toEqual([]);
  });

  it("removeSelection on a nested node deletes its child diagram subtree", () => {
    const created = useDocStore.getState().addNestedNode({ x: 0, y: 0 }, { w: 200, h: 140 });
    useDocStore.getState().setSelection([created.nestedNodeId]);
    useDocStore.getState().removeSelection();
    expect(useDocStore.getState().doc.diagrams[created.childDiagramId]).toBeUndefined();
  });

  it("addPage creates a new page and switches to it", () => {
    const rootId = useDocStore.getState().currentDiagramId();
    const pageId = useDocStore.getState().addPage("Page 2");
    expect(useDocStore.getState().doc.rootDiagramIds).toEqual([rootId, pageId]);
    expect(useDocStore.getState().navStack).toEqual([pageId]);
  });

  it("renamePage updates the diagram title", () => {
    const rootId = useDocStore.getState().currentDiagramId();
    useDocStore.getState().renamePage(rootId, "Renamed");
    expect(useDocStore.getState().doc.diagrams[rootId].title).toBe("Renamed");
  });

  it("switchPage moves the nav stack to a different page without touching the first page's content", () => {
    const rootId = useDocStore.getState().currentDiagramId();
    useDocStore.getState().addShapeNode("general/rect", { x: 0, y: 0 }, { w: 100, h: 60 });
    const pageId = useDocStore.getState().addPage("Page 2");
    expect(useDocStore.getState().currentDiagramId()).toBe(pageId);

    useDocStore.getState().switchPage(rootId);
    expect(useDocStore.getState().currentDiagramId()).toBe(rootId);
    expect(useDocStore.getState().doc.diagrams[rootId].nodes).toHaveLength(1);
  });

  it("removePage refuses to delete the last page", () => {
    const rootId = useDocStore.getState().currentDiagramId();
    useDocStore.getState().removePage(rootId);
    expect(useDocStore.getState().doc.rootDiagramIds).toEqual([rootId]);
  });

  it("removePage falls back navigation to a remaining page when deleting the current one", () => {
    const rootId = useDocStore.getState().currentDiagramId();
    const pageId = useDocStore.getState().addPage("Page 2");
    expect(useDocStore.getState().currentDiagramId()).toBe(pageId);

    useDocStore.getState().removePage(pageId);
    expect(useDocStore.getState().doc.rootDiagramIds).toEqual([rootId]);
    expect(useDocStore.getState().currentDiagramId()).toBe(rootId);
  });

  it("reorderPages reorders rootDiagramIds", () => {
    const rootId = useDocStore.getState().currentDiagramId();
    const page2 = useDocStore.getState().addPage("Page 2");
    useDocStore.getState().reorderPages(0, 1);
    expect(useDocStore.getState().doc.rootDiagramIds).toEqual([page2, rootId]);
  });

  it("loadDoc replaces the document, resets navigation/selection, and clears undo history", () => {
    useDocStore.getState().addShapeNode("general/rect", { x: 0, y: 0 }, { w: 100, h: 60 });
    expect(useDocStore.temporal.getState().pastStates.length).toBeGreaterThan(0);

    const freshDoc = {
      formatVersion: 1,
      meta: { title: "Loaded", created: "2026-08-05", modified: "2026-08-05", appVersion: "0.0.1" },
      rootDiagramIds: ["loaded-root"],
      diagrams: { "loaded-root": { id: "loaded-root", title: "Loaded Page", nodes: [], edges: [] } },
    };
    useDocStore.getState().loadDoc(freshDoc);

    expect(useDocStore.getState().doc).toEqual(freshDoc);
    expect(useDocStore.getState().navStack).toEqual(["loaded-root"]);
    expect(useDocStore.getState().selection).toEqual({ nodeIds: [], edgeIds: [] });
    expect(useDocStore.temporal.getState().pastStates.length).toBe(0);
  });

  it("toggleGrid and toggleSnap flip the respective ui flags and nothing else", () => {
    const before = useDocStore.getState().ui;
    useDocStore.getState().toggleGrid();
    useDocStore.getState().toggleSnap();
    expect(useDocStore.getState().ui).toEqual({
      ...before,
      gridEnabled: !before.gridEnabled,
      snapEnabled: !before.snapEnabled,
    });
  });

  it("setDiagramBackground sets and clears the current diagram's background", () => {
    const diagramId = useDocStore.getState().currentDiagramId();
    useDocStore.getState().setDiagramBackground("#ff0000");
    expect(useDocStore.getState().doc.diagrams[diagramId].background).toBe("#ff0000");

    useDocStore.getState().setDiagramBackground(undefined);
    expect(useDocStore.getState().doc.diagrams[diagramId].background).toBeUndefined();
  });

  it("setNodeStyle merges a style patch into every given node, leaving others untouched", () => {
    const a = useDocStore.getState().addShapeNode("general/rect", { x: 0, y: 0 }, { w: 100, h: 60 });
    const b = useDocStore.getState().addShapeNode("general/rect", { x: 0, y: 0 }, { w: 100, h: 60 });
    useDocStore.getState().setNodeStyle([a], { fill: "#ff0000" });
    useDocStore.getState().setNodeStyle([a, b], { stroke: "#00ff00" });
    const diagramId = useDocStore.getState().currentDiagramId();
    const nodes = useDocStore.getState().doc.diagrams[diagramId].nodes;
    expect(nodes.find((n) => n.id === a)?.style).toEqual({ fill: "#ff0000", stroke: "#00ff00" });
    expect(nodes.find((n) => n.id === b)?.style).toEqual({ stroke: "#00ff00" });
  });

  it("setNodeLabelStyle merges into each node's label, defaulting empty text when none exists", () => {
    const id = useDocStore.getState().addShapeNode("general/rect", { x: 0, y: 0 }, { w: 100, h: 60 });
    useDocStore.getState().setNodeLabelStyle([id], { bold: true, fontSize: 18 });
    const diagramId = useDocStore.getState().currentDiagramId();
    const node = useDocStore.getState().doc.diagrams[diagramId].nodes.find((n) => n.id === id);
    expect(node?.label).toEqual({ text: "", bold: true, fontSize: 18 });
  });

  it("setEdgeStyle merges a style patch into every given edge", () => {
    const a = useDocStore.getState().addShapeNode("general/rect", { x: 0, y: 0 }, { w: 100, h: 60 });
    const b = useDocStore.getState().addShapeNode("general/rect", { x: 200, y: 0 }, { w: 100, h: 60 });
    const edgeId = useDocStore.getState().connect({
      sourceNodeId: a,
      sourceHandleId: "right",
      targetNodeId: b,
      targetHandleId: "left",
    });
    useDocStore.getState().setEdgeStyle([edgeId], { dash: "dashed" });
    const diagramId = useDocStore.getState().currentDiagramId();
    const edge = useDocStore.getState().doc.diagrams[diagramId].edges.find((e) => e.id === edgeId);
    expect(edge?.style.dash).toBe("dashed");
    expect(edge?.style.edgeStyle).toBe("curved"); // pre-existing keys survive the merge
  });

  it("new connections default to a curved edge style", () => {
    const a = useDocStore.getState().addShapeNode("general/rect", { x: 0, y: 0 }, { w: 100, h: 60 });
    const b = useDocStore.getState().addShapeNode("general/rect", { x: 200, y: 0 }, { w: 100, h: 60 });
    const edgeId = useDocStore
      .getState()
      .connect({ sourceNodeId: a, sourceHandleId: "right", targetNodeId: b, targetHandleId: "left" });
    const diagramId = useDocStore.getState().currentDiagramId();
    const edge = useDocStore.getState().doc.diagrams[diagramId].edges.find((e) => e.id === edgeId);
    expect(edge?.style.edgeStyle).toBe("curved");
  });

  it("reconnectEdge moves one end of an existing edge to another node", () => {
    const a = useDocStore.getState().addShapeNode("general/rect", { x: 0, y: 0 }, { w: 100, h: 60 });
    const b = useDocStore.getState().addShapeNode("general/rect", { x: 200, y: 0 }, { w: 100, h: 60 });
    const c = useDocStore.getState().addShapeNode("general/rect", { x: 400, y: 0 }, { w: 100, h: 60 });
    const edgeId = useDocStore
      .getState()
      .connect({ sourceNodeId: a, sourceHandleId: "right", targetNodeId: b, targetHandleId: "left" });

    useDocStore.getState().reconnectEdge(edgeId, "target", c, "left");

    const diagramId = useDocStore.getState().currentDiagramId();
    const edge = useDocStore.getState().doc.diagrams[diagramId].edges.find((e) => e.id === edgeId)!;
    expect(edge.target.nodeId).toBe(c);
    expect(edge.source.nodeId).toBe(a); // the untouched end is left alone
    expect(edge.style.targetHandle).toBe("left");
  });

  it("reconnectEdge onto a nested node's body creates a port there, like connect does", () => {
    const a = useDocStore.getState().addShapeNode("general/rect", { x: 0, y: 0 }, { w: 100, h: 60 });
    const b = useDocStore.getState().addShapeNode("general/rect", { x: 200, y: 0 }, { w: 100, h: 60 });
    const nested = useDocStore.getState().addNestedNode({ x: 400, y: 0 }, { w: 200, h: 140 });
    const edgeId = useDocStore
      .getState()
      .connect({ sourceNodeId: a, sourceHandleId: "right", targetNodeId: b, targetHandleId: "left" });

    useDocStore.getState().reconnectEdge(edgeId, "target", nested.nestedNodeId, "left");

    const diagramId = useDocStore.getState().currentDiagramId();
    const node = useDocStore.getState().doc.diagrams[diagramId].nodes.find((n) => n.id === nested.nestedNodeId) as {
      ports: { id: string; innerNodeId?: string }[];
    };
    expect(node.ports).toHaveLength(1);
    expect(node.ports[0].innerNodeId).toBeUndefined();
    const edge = useDocStore.getState().doc.diagrams[diagramId].edges.find((e) => e.id === edgeId)!;
    expect(edge.target.portId).toBe(node.ports[0].id);
  });

  it("mapUnlinkedPort records the side the connection was dropped on", () => {
    const created = useDocStore.getState().addNestedNode({ x: 300, y: 0 }, { w: 200, h: 140 });
    const outside = useDocStore.getState().addShapeNode("general/rect", { x: 0, y: 0 }, { w: 100, h: 60 });
    const rootId = useDocStore.getState().currentDiagramId();
    useDocStore
      .getState()
      .connect({ sourceNodeId: outside, sourceHandleId: "right", targetNodeId: created.nestedNodeId, targetHandleId: "left" });
    const portId = (
      useDocStore.getState().doc.diagrams[rootId].nodes.find((n) => n.id === created.nestedNodeId) as {
        ports: { id: string }[];
      }
    ).ports[0].id;

    useDocStore.getState().navigateInto(created.nestedNodeId);
    const inner = useDocStore.getState().addShapeNode("general/rect", { x: 0, y: 0 }, { w: 100, h: 60 });
    useDocStore.getState().mapUnlinkedPort(portId, inner, "right");

    const port = (
      useDocStore.getState().doc.diagrams[rootId].nodes.find((n) => n.id === created.nestedNodeId) as {
        ports: { innerNodeId?: string; side: string }[];
      }
    ).ports[0];
    expect(port.innerNodeId).toBe(inner);
    expect(port.side).toBe("right");
  });

  it("detachPort returns a mapped port to the waiting state without deleting it", () => {
    const created = useDocStore.getState().addNestedNode({ x: 300, y: 0 }, { w: 200, h: 140 });
    const outside = useDocStore.getState().addShapeNode("general/rect", { x: 0, y: 0 }, { w: 100, h: 60 });
    const rootId = useDocStore.getState().currentDiagramId();
    const edgeId = useDocStore
      .getState()
      .connect({ sourceNodeId: outside, sourceHandleId: "right", targetNodeId: created.nestedNodeId, targetHandleId: "left" });
    const portId = (
      useDocStore.getState().doc.diagrams[rootId].nodes.find((n) => n.id === created.nestedNodeId) as {
        ports: { id: string }[];
      }
    ).ports[0].id;

    useDocStore.getState().navigateInto(created.nestedNodeId);
    const inner = useDocStore.getState().addShapeNode("general/rect", { x: 0, y: 0 }, { w: 100, h: 60 });
    useDocStore.getState().mapUnlinkedPort(portId, inner);
    useDocStore.getState().detachPort(portId);

    const nested = useDocStore.getState().doc.diagrams[rootId].nodes.find((n) => n.id === created.nestedNodeId) as {
      ports: { id: string; innerNodeId?: string }[];
    };
    // The port and the parent's edge both survive — only the inner mapping is cleared, so the
    // connection goes back to "waiting" rather than disappearing.
    expect(nested.ports).toHaveLength(1);
    expect(nested.ports[0].innerNodeId).toBeUndefined();
    expect(useDocStore.getState().doc.diagrams[rootId].edges.find((e) => e.id === edgeId)!.target.portId).toBe(portId);
  });

  it("addStencilToScratchpad saves a favourite and ignores a repeat of the same stencil", () => {
    useDocStore.getState().addStencilToScratchpad("general/hexagon", { w: 120, h: 90 });
    useDocStore.getState().addStencilToScratchpad("general/hexagon", { w: 120, h: 90 });
    const saved = useDocStore.getState().scratchpad.filter((i) => i.shapeRef === "general/hexagon");
    expect(saved).toHaveLength(1);
    expect(saved[0].style).toEqual({});
  });

  it("renameNestedNode renames the node and the child diagram together", () => {
    const created = useDocStore.getState().addNestedNode({ x: 0, y: 0 }, { w: 200, h: 140 });
    useDocStore.getState().renameNestedNode(created.nestedNodeId, { text: "Payment Service" });

    const diagramId = useDocStore.getState().currentDiagramId();
    const node = useDocStore.getState().doc.diagrams[diagramId].nodes.find((n) => n.id === created.nestedNodeId)!;
    expect(node.label?.text).toBe("Payment Service");
    expect(useDocStore.getState().doc.diagrams[created.childDiagramId].title).toBe("Payment Service");
  });

  it("toggleShortcutsDialog flips ui.shortcutsDialogOpen", () => {
    expect(useDocStore.getState().ui.shortcutsDialogOpen).toBe(false);
    useDocStore.getState().toggleShortcutsDialog();
    expect(useDocStore.getState().ui.shortcutsDialogOpen).toBe(true);
    useDocStore.getState().toggleShortcutsDialog();
    expect(useDocStore.getState().ui.shortcutsDialogOpen).toBe(false);
  });

  it("selectAll selects every node and edge in the current diagram", () => {
    const a = useDocStore.getState().addShapeNode("general/rect", { x: 0, y: 0 }, { w: 100, h: 60 });
    const b = useDocStore.getState().addShapeNode("general/rect", { x: 200, y: 0 }, { w: 100, h: 60 });
    const edgeId = useDocStore.getState().connect({
      sourceNodeId: a,
      sourceHandleId: "right",
      targetNodeId: b,
      targetHandleId: "left",
    });
    useDocStore.getState().clearSelection();
    useDocStore.getState().selectAll();
    expect(useDocStore.getState().selection.nodeIds.sort()).toEqual([a, b].sort());
    expect(useDocStore.getState().selection.edgeIds).toEqual([edgeId]);
  });

  it("cutSelection copies the selection to the clipboard and removes it", () => {
    const a = useDocStore.getState().addShapeNode("general/rect", { x: 0, y: 0 }, { w: 100, h: 60 });
    useDocStore.getState().setSelection([a]);
    useDocStore.getState().cutSelection();

    const diagramId = useDocStore.getState().currentDiagramId();
    expect(useDocStore.getState().doc.diagrams[diagramId].nodes).toHaveLength(0);

    useDocStore.getState().pasteClipboard();
    expect(useDocStore.getState().doc.diagrams[diagramId].nodes).toHaveLength(1);
  });

  it("addSelectionToScratchpad captures the single selected shape node and persists it", () => {
    const id = useDocStore.getState().addShapeNode("general/rect", { x: 0, y: 0 }, { w: 100, h: 60 });
    useDocStore.getState().setNodeStyle([id], { fill: "#ff0000" });
    useDocStore.getState().setSelection([id]);

    useDocStore.getState().addSelectionToScratchpad();

    expect(useDocStore.getState().scratchpad).toHaveLength(1);
    expect(useDocStore.getState().scratchpad[0].shapeRef).toBe("general/rect");
    expect(useDocStore.getState().scratchpad[0].style).toEqual({ fill: "#ff0000" });
    expect(readScratchpad()).toEqual(useDocStore.getState().scratchpad); // persisted
  });

  it("addSelectionToScratchpad captures every shape in a multi-selection", () => {
    const a = useDocStore.getState().addShapeNode("general/rect", { x: 0, y: 0 }, { w: 100, h: 60 });
    const b = useDocStore.getState().addShapeNode("general/rect", { x: 200, y: 0 }, { w: 100, h: 60 });
    useDocStore.getState().setSelection([a, b]);
    useDocStore.getState().addSelectionToScratchpad();
    expect(useDocStore.getState().scratchpad).toHaveLength(2);
  });

  it("addSelectionToScratchpad captures a selected group's member shapes, not the group itself", () => {
    const a = useDocStore.getState().addShapeNode("general/rect", { x: 0, y: 0 }, { w: 100, h: 60 });
    const b = useDocStore.getState().addShapeNode("general/rect", { x: 200, y: 0 }, { w: 100, h: 60 });
    useDocStore.getState().setSelection([a, b]);
    const groupId = useDocStore.getState().groupSelection()!;
    useDocStore.getState().setSelection([groupId]);

    useDocStore.getState().addSelectionToScratchpad();

    expect(useDocStore.getState().scratchpad).toHaveLength(2);
    expect(useDocStore.getState().scratchpad.every((item) => item.shapeRef === "general/rect")).toBe(true);
  });

  it("addSelectionToScratchpad is a no-op for a non-shape, non-group node", () => {
    const { nestedNodeId } = useDocStore.getState().addNestedNode({ x: 0, y: 0 }, { w: 200, h: 140 });
    useDocStore.getState().setSelection([nestedNodeId]);
    useDocStore.getState().addSelectionToScratchpad();
    expect(useDocStore.getState().scratchpad).toHaveLength(0);
  });

  it("addShapeNodeFromScratchpad creates a node from a captured item's shapeRef/size/style/label", () => {
    const id = useDocStore.getState().addShapeNode("general/ellipse", { x: 0, y: 0 }, { w: 80, h: 80 });
    useDocStore.getState().setNodeStyle([id], { fill: "#00ff00" });
    useDocStore.getState().setSelection([id]);
    useDocStore.getState().addSelectionToScratchpad();
    const item = useDocStore.getState().scratchpad[0];

    const newId = useDocStore.getState().addShapeNodeFromScratchpad(item, { x: 300, y: 300 });
    const diagramId = useDocStore.getState().currentDiagramId();
    const node = useDocStore.getState().doc.diagrams[diagramId].nodes.find((n) => n.id === newId);
    expect(node?.type).toBe("shape");
    if (node?.type === "shape") {
      expect(node.shapeRef).toBe("general/ellipse");
      expect(node.style).toEqual({ fill: "#00ff00" });
      expect(node.position).toEqual({ x: 300, y: 300 });
    }
  });

  it("removeScratchpadItem removes and persists", () => {
    const id = useDocStore.getState().addShapeNode("general/rect", { x: 0, y: 0 }, { w: 100, h: 60 });
    useDocStore.getState().setSelection([id]);
    useDocStore.getState().addSelectionToScratchpad();
    const itemId = useDocStore.getState().scratchpad[0].id;

    useDocStore.getState().removeScratchpadItem(itemId);
    expect(useDocStore.getState().scratchpad).toHaveLength(0);
    expect(readScratchpad()).toEqual([]);
  });

  it("groupSelection creates a group from 2+ selected nodes and selects it", () => {
    const a = useDocStore.getState().addShapeNode("general/rect", { x: 0, y: 0 }, { w: 100, h: 60 });
    const b = useDocStore.getState().addShapeNode("general/rect", { x: 200, y: 0 }, { w: 100, h: 60 });
    useDocStore.getState().setSelection([a, b]);
    const groupId = useDocStore.getState().groupSelection();
    expect(groupId).not.toBeNull();
    expect(useDocStore.getState().selection.nodeIds).toEqual([groupId]);
    const diagramId = useDocStore.getState().currentDiagramId();
    const group = useDocStore.getState().doc.diagrams[diagramId].nodes.find((n) => n.id === groupId);
    expect(group?.type).toBe("group");
  });

  it("groupSelection returns null and leaves selection alone for fewer than 2 nodes", () => {
    const a = useDocStore.getState().addShapeNode("general/rect", { x: 0, y: 0 }, { w: 100, h: 60 });
    useDocStore.getState().setSelection([a]);
    const groupId = useDocStore.getState().groupSelection();
    expect(groupId).toBeNull();
    expect(useDocStore.getState().selection.nodeIds).toEqual([a]);
  });

  it("ungroupSelection removes the group and selects its former children", () => {
    const a = useDocStore.getState().addShapeNode("general/rect", { x: 0, y: 0 }, { w: 100, h: 60 });
    const b = useDocStore.getState().addShapeNode("general/rect", { x: 200, y: 0 }, { w: 100, h: 60 });
    useDocStore.getState().setSelection([a, b]);
    const groupId = useDocStore.getState().groupSelection()!;

    useDocStore.getState().ungroupSelection();
    const diagramId = useDocStore.getState().currentDiagramId();
    expect(useDocStore.getState().doc.diagrams[diagramId].nodes.find((n) => n.id === groupId)).toBeUndefined();
    expect(useDocStore.getState().selection.nodeIds.sort()).toEqual([a, b].sort());
  });

  it("ungroupSelection also resolves the group when the group id and its members are selected together (e.g. a rubber-band sweeping over the invisible frame and its children)", () => {
    const a = useDocStore.getState().addShapeNode("general/rect", { x: 0, y: 0 }, { w: 100, h: 60 });
    const b = useDocStore.getState().addShapeNode("general/rect", { x: 200, y: 0 }, { w: 100, h: 60 });
    useDocStore.getState().setSelection([a, b]);
    const groupId = useDocStore.getState().groupSelection()!;

    // The bug this covers: including the group's own id alongside its children broke the old
    // "every selected id is a child" check, since the group id is not itself a child.
    useDocStore.getState().setSelection([groupId, a, b]);
    useDocStore.getState().ungroupSelection();

    const diagramId = useDocStore.getState().currentDiagramId();
    expect(useDocStore.getState().doc.diagrams[diagramId].nodes.find((n) => n.id === groupId)).toBeUndefined();
    expect(useDocStore.getState().selection.nodeIds.sort()).toEqual([a, b].sort());
  });

  it("ungroupSelection also resolves the group when its member shapes are selected directly (not the group id)", () => {
    const a = useDocStore.getState().addShapeNode("general/rect", { x: 0, y: 0 }, { w: 100, h: 60 });
    const b = useDocStore.getState().addShapeNode("general/rect", { x: 200, y: 0 }, { w: 100, h: 60 });
    useDocStore.getState().setSelection([a, b]);
    const groupId = useDocStore.getState().groupSelection()!;

    // Simulate rubber-band selecting the group's children individually rather than its id —
    // the real repro this covers.
    useDocStore.getState().setSelection([a, b]);
    useDocStore.getState().ungroupSelection();

    const diagramId = useDocStore.getState().currentDiagramId();
    expect(useDocStore.getState().doc.diagrams[diagramId].nodes.find((n) => n.id === groupId)).toBeUndefined();
    expect(useDocStore.getState().selection.nodeIds.sort()).toEqual([a, b].sort());
  });

  it("removeSelection cleans up a group when one of its children is deleted", () => {
    const a = useDocStore.getState().addShapeNode("general/rect", { x: 0, y: 0 }, { w: 100, h: 60 });
    const b = useDocStore.getState().addShapeNode("general/rect", { x: 200, y: 0 }, { w: 100, h: 60 });
    useDocStore.getState().setSelection([a, b]);
    const groupId = useDocStore.getState().groupSelection()!;

    useDocStore.getState().setSelection([a]);
    useDocStore.getState().removeSelection();

    const diagramId = useDocStore.getState().currentDiagramId();
    const nodes = useDocStore.getState().doc.diagrams[diagramId].nodes;
    expect(nodes.find((n) => n.id === groupId)).toBeUndefined(); // group dropped below 2 children
    expect(nodes.find((n) => n.id === b)).toBeDefined();
  });

  it("setEdgeLabelStyle merges into an edge's label, defaulting empty text when none exists", () => {
    const a = useDocStore.getState().addShapeNode("general/rect", { x: 0, y: 0 }, { w: 100, h: 60 });
    const b = useDocStore.getState().addShapeNode("general/rect", { x: 200, y: 0 }, { w: 100, h: 60 });
    const edgeId = useDocStore.getState().connect({
      sourceNodeId: a,
      sourceHandleId: "right",
      targetNodeId: b,
      targetHandleId: "left",
    });
    useDocStore.getState().setEdgeLabelStyle([edgeId], { align: "left" });
    const diagramId = useDocStore.getState().currentDiagramId();
    const edge = useDocStore.getState().doc.diagrams[diagramId].edges.find((e) => e.id === edgeId);
    expect(edge?.label).toEqual({ text: "", align: "left" });
  });
});
