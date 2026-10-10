// Q3's nesting fixes (D113): converting names the block, and a level opened for the first time
// leaves its incoming ghost pills room.
import { beforeEach, describe, expect, it } from "vitest";
import { useDocStore } from "../model/store";
import { convertSelectionAndName, firstVisitViewport, GHOST_ROOM } from "./navigation";

function freshPage() {
  const blank = useDocStore.getState().doc;
  const root = blank.rootDiagramIds[0];
  useDocStore.getState().loadDoc({ ...blank, rootDiagramIds: [root], diagrams: { [root]: { id: root, title: "Page 1", nodes: [], edges: [] } } });
}

describe("convertSelectionAndName", () => {
  beforeEach(freshPage);

  it("converts, selects the new block and opens its name for typing", () => {
    const s = useDocStore.getState();
    const a = s.addShapeNode("general/rect", { x: 0, y: 0 }, { w: 100, h: 60 });
    const b = s.addShapeNode("general/rect", { x: 200, y: 0 }, { w: 100, h: 60 });
    s.setSelection([a, b], []);
    convertSelectionAndName();
    const after = useDocStore.getState();
    const block = after.doc.diagrams[after.currentDiagramId()].nodes.find((n) => n.type === "nested")!;
    expect(after.selection.nodeIds).toEqual([block.id]);
    expect(after.editingNodeId).toBe(block.id);
  });

  it("does nothing with nothing selected", () => {
    useDocStore.getState().setSelection([], []);
    convertSelectionAndName();
    expect(useDocStore.getState().editingNodeId).toBeNull();
  });
});

describe("firstVisitViewport", () => {
  beforeEach(freshPage);

  function blockWithPort() {
    const s = useDocStore.getState();
    const outside = s.addShapeNode("general/rect", { x: 0, y: 0 }, { w: 100, h: 60 });
    const inside = s.addShapeNode("general/rect", { x: 300, y: 0 }, { w: 100, h: 60 });
    s.connect({ sourceNodeId: outside, sourceHandleId: "right", targetNodeId: inside, targetHandleId: "left" });
    s.setSelection([inside], []);
    const { nestedNodeId, childDiagramId } = useDocStore.getState().convertSelectionToNested("Inner")!;
    return { nestedNodeId, childDiagramId };
  }

  it("on a page, or a level with no ports reaching in: 100% from the origin, as before", () => {
    const st = useDocStore.getState();
    const root = st.currentDiagramId();
    expect(firstVisitViewport(st.doc, [root], root)).toEqual({ x: 0, y: 0, zoom: 1 });
    const { childDiagramId } = useDocStore.getState().addNestedNode({ x: 0, y: 0 }, { w: 160, h: 100 }, "Empty");
    const now = useDocStore.getState();
    expect(firstVisitViewport(now.doc, [root, childDiagramId], childDiagramId)).toEqual({ x: 0, y: 0, zoom: 1 });
  });

  it("inside a block whose port reaches in: the content starts far enough right for the pill's name", () => {
    const { childDiagramId } = blockWithPort();
    const st = useDocStore.getState();
    const root = st.currentDiagramId();
    const vp = firstVisitViewport(st.doc, [root, childDiagramId], childDiagramId);
    const left = Math.min(...st.doc.diagrams[childDiagramId].nodes.map((n) => n.position.x));
    expect(vp.zoom).toBe(1);
    expect(left + vp.x).toBeGreaterThanOrEqual(GHOST_ROOM);
  });
});
