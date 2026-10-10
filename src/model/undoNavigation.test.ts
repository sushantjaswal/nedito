import { beforeEach, describe, expect, it } from "vitest";
import { useDocStore } from "./store";
import { findPrimaryChangedDiagramId, redoWithNavigation, undoWithNavigation } from "./undoNavigation";
import type { DiagramDocument } from "./types";

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
  });
  useDocStore.temporal.getState().clear();
}

function docWith(diagrams: DiagramDocument["diagrams"]): DiagramDocument {
  return {
    formatVersion: 1,
    meta: { title: "t", created: "", modified: "", appVersion: "0" },
    rootDiagramIds: Object.keys(diagrams),
    diagrams,
  };
}

describe("findPrimaryChangedDiagramId", () => {
  it("returns null when nothing changed", () => {
    const a = docWith({ x: { id: "x", title: "X", nodes: [], edges: [] } });
    expect(findPrimaryChangedDiagramId(a, a)).toBeNull();
  });

  it("prefers a diagram modified in place over one purely added", () => {
    const parent = { id: "p", title: "P", nodes: [], edges: [] };
    const before = docWith({ p: parent });
    const after = docWith({
      p: { ...parent, nodes: [{ id: "n1" } as never] },
      child: { id: "child", title: "C", nodes: [], edges: [] },
    });
    expect(findPrimaryChangedDiagramId(before, after)).toBe("p");
  });

  it("falls back to a purely removed diagram when nothing was modified in place", () => {
    const before = docWith({ p: { id: "p", title: "P", nodes: [], edges: [] }, child: { id: "child", title: "C", nodes: [], edges: [] } });
    const after = docWith({ p: before.diagrams.p });
    expect(findPrimaryChangedDiagramId(before, after)).toBe("child");
  });
});

describe("undoWithNavigation / redoWithNavigation", () => {
  beforeEach(resetStore);

  it("relocates to the parent diagram when undoing convert-to-nested from inside the new child", () => {
    const a = useDocStore.getState().addShapeNode("general/rect", { x: 0, y: 0 }, { w: 100, h: 60 });
    const rootId = useDocStore.getState().currentDiagramId();
    useDocStore.getState().setSelection([a]);
    const { nestedNodeId, childDiagramId } = useDocStore.getState().convertSelectionToNested("Payment Service")!;

    useDocStore.getState().navigateInto(nestedNodeId);
    expect(useDocStore.getState().currentDiagramId()).toBe(childDiagramId);

    undoWithNavigation();

    // the convert is undone (child diagram gone, shape back in root) AND the user is
    // relocated to root since that's where the undone change actually happened
    expect(useDocStore.getState().doc.diagrams[childDiagramId]).toBeUndefined();
    expect(useDocStore.getState().currentDiagramId()).toBe(rootId);
    expect(useDocStore.getState().doc.diagrams[rootId].nodes.map((n) => n.id)).toEqual([a]);
  });

  it("redo relocates back into the child after navigating away", () => {
    const a = useDocStore.getState().addShapeNode("general/rect", { x: 0, y: 0 }, { w: 100, h: 60 });
    useDocStore.getState().setSelection([a]);
    const { childDiagramId } = useDocStore.getState().convertSelectionToNested("Payment Service")!;

    undoWithNavigation(); // back to flat root
    expect(useDocStore.getState().doc.diagrams[childDiagramId]).toBeUndefined();

    redoWithNavigation();
    expect(useDocStore.getState().doc.diagrams[childDiagramId]).toBeDefined();
    expect(useDocStore.getState().currentDiagramId()).toBe(useDocStore.getState().doc.rootDiagramIds[0]);
  });

  it("does not navigate when the change is already visible in the current diagram", () => {
    useDocStore.getState().addShapeNode("general/rect", { x: 0, y: 0 }, { w: 100, h: 60 });
    const rootId = useDocStore.getState().currentDiagramId();
    undoWithNavigation();
    expect(useDocStore.getState().currentDiagramId()).toBe(rootId);
    expect(useDocStore.getState().navStack).toEqual([rootId]);
  });

  it("is a no-op when there is nothing to undo", () => {
    const rootId = useDocStore.getState().currentDiagramId();
    undoWithNavigation();
    expect(useDocStore.getState().currentDiagramId()).toBe(rootId);
  });
});
