import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { useDocStore } from "../model/store";
import { ContextMenu } from "./ContextMenu";

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
    clipboard: null,
    scratchpad: [],
  });
  useDocStore.temporal.getState().clear();
  localStorage.clear();
}

describe("ContextMenu", () => {
  beforeEach(resetStore);

  // Paste is always offered (D82): the system clipboard may hold an image copied in another app
  // even when nothing has been copied here.
  it("canvas target shows Paste (always, since the system clipboard may hold an image) and Select All", () => {
    render(<ContextMenu target="canvas" x={0} y={0} onClose={() => {}} />);
    expect(screen.getByText("Paste")).toBeEnabled();
    expect(screen.getByText("Select All")).toBeEnabled();
    expect(screen.queryByText("Delete")).not.toBeInTheDocument();
  });

  it("canvas target enables Paste once the clipboard has content", () => {
    const id = useDocStore.getState().addShapeNode("general/rect", { x: 0, y: 0 }, { w: 100, h: 60 });
    useDocStore.getState().setSelection([id]);
    useDocStore.getState().copySelection();
    render(<ContextMenu target="canvas" x={0} y={0} onClose={() => {}} />);
    expect(screen.getByText("Paste")).toBeEnabled();
  });

  it("node target shows edit + z-order items, and Convert to nested block for a plain shape", () => {
    const id = useDocStore.getState().addShapeNode("general/rect", { x: 0, y: 0 }, { w: 100, h: 60 });
    useDocStore.getState().setSelection([id]);
    render(<ContextMenu target="node" x={0} y={0} onClose={() => {}} />);
    expect(screen.getByText("Cut")).toBeEnabled();
    expect(screen.getByText("Copy")).toBeEnabled();
    expect(screen.getByText("Duplicate")).toBeEnabled();
    expect(screen.getByText("Delete")).toBeInTheDocument();
    expect(screen.getByText("To Front")).toBeInTheDocument();
    expect(screen.getByText("Convert to nested block")).toBeInTheDocument();
    expect(screen.queryByText("Group")).not.toBeInTheDocument(); // only 1 node selected
  });

  it("node target shows Group for a 2+ node selection and Ungroup for a selected group", () => {
    const a = useDocStore.getState().addShapeNode("general/rect", { x: 0, y: 0 }, { w: 100, h: 60 });
    const b = useDocStore.getState().addShapeNode("general/rect", { x: 200, y: 0 }, { w: 100, h: 60 });
    useDocStore.getState().setSelection([a, b]);
    const { unmount } = render(<ContextMenu target="node" x={0} y={0} onClose={() => {}} />);
    expect(screen.getByText("Group")).toBeInTheDocument();
    expect(screen.queryByText("Ungroup")).not.toBeInTheDocument();
    unmount();

    const groupId = useDocStore.getState().groupSelection()!;
    useDocStore.getState().setSelection([groupId]);
    const { unmount: unmount2 } = render(<ContextMenu target="node" x={0} y={0} onClose={() => {}} />);
    expect(screen.getByText("Ungroup")).toBeInTheDocument();
    expect(screen.queryByText("Convert to nested block")).not.toBeInTheDocument();
    unmount2();

    // Selecting the group's own members directly (e.g. via rubber-band, which selects children
    // individually rather than resolving to the group id) should read as "already grouped" too.
    useDocStore.getState().setSelection([a, b]);
    const { unmount: unmount3 } = render(<ContextMenu target="node" x={0} y={0} onClose={() => {}} />);
    expect(screen.getByText("Ungroup")).toBeInTheDocument();
    expect(screen.queryByText("Group")).not.toBeInTheDocument();
    unmount3();

    // And selecting the group's own id ALONGSIDE its members (a rubber-band sweeping over the
    // invisible frame and its children reports all of their ids together) — the id isn't
    // itself a child, so this broke the earlier "every id is a child" check (D33 follow-up).
    useDocStore.getState().setSelection([groupId, a, b]);
    render(<ContextMenu target="node" x={0} y={0} onClose={() => {}} />);
    expect(screen.getByText("Ungroup")).toBeInTheDocument();
    expect(screen.queryByText("Group")).not.toBeInTheDocument();
  });

  it("node target shows Open child diagram for a single selected nested node", () => {
    const { nestedNodeId } = useDocStore.getState().addNestedNode({ x: 0, y: 0 }, { w: 200, h: 140 });
    useDocStore.getState().setSelection([nestedNodeId]);
    render(<ContextMenu target="node" x={0} y={0} onClose={() => {}} />);
    expect(screen.getByText("Open child diagram")).toBeInTheDocument();
    expect(screen.queryByText("Convert to nested block")).not.toBeInTheDocument();
  });

  it("node target shows Add to Favorites for a single shape, a multi-shape selection, and a selected group, but not a bare nested node", () => {
    const id = useDocStore.getState().addShapeNode("general/rect", { x: 0, y: 0 }, { w: 100, h: 60 });
    useDocStore.getState().setSelection([id]);
    const { unmount: unmount1 } = render(<ContextMenu target="node" x={0} y={0} onClose={() => {}} />);
    expect(screen.getByText("Add to Favorites")).toBeInTheDocument();
    unmount1();

    const b = useDocStore.getState().addShapeNode("general/rect", { x: 200, y: 0 }, { w: 100, h: 60 });
    useDocStore.getState().setSelection([id, b]);
    const { unmount: unmount2 } = render(<ContextMenu target="node" x={0} y={0} onClose={() => {}} />);
    expect(screen.getByText("Add to Favorites")).toBeInTheDocument();
    unmount2();

    const groupId = useDocStore.getState().groupSelection()!;
    useDocStore.getState().setSelection([groupId]);
    const { unmount: unmount3 } = render(<ContextMenu target="node" x={0} y={0} onClose={() => {}} />);
    expect(screen.getByText("Add to Favorites")).toBeInTheDocument();
    unmount3();

    const { nestedNodeId } = useDocStore.getState().addNestedNode({ x: 400, y: 0 }, { w: 200, h: 140 });
    useDocStore.getState().setSelection([nestedNodeId]);
    render(<ContextMenu target="node" x={0} y={0} onClose={() => {}} />);
    expect(screen.queryByText("Add to Favorites")).not.toBeInTheDocument();
  });

  it("clicking Add to Favorites on a selected group captures each of its member shapes", async () => {
    const a = useDocStore.getState().addShapeNode("general/rect", { x: 0, y: 0 }, { w: 100, h: 60 });
    const b = useDocStore.getState().addShapeNode("general/rect", { x: 200, y: 0 }, { w: 100, h: 60 });
    useDocStore.getState().setSelection([a, b]);
    const groupId = useDocStore.getState().groupSelection()!;
    useDocStore.getState().setSelection([groupId]);
    const user = userEvent.setup();
    render(<ContextMenu target="node" x={0} y={0} onClose={() => {}} />);

    await user.click(screen.getByText("Add to Favorites"));
    expect(useDocStore.getState().scratchpad).toHaveLength(2);
  });

  it("clicking Add to Favorites captures the shape", async () => {
    const id = useDocStore.getState().addShapeNode("general/rect", { x: 0, y: 0 }, { w: 100, h: 60 });
    useDocStore.getState().setSelection([id]);
    const user = userEvent.setup();
    render(<ContextMenu target="node" x={0} y={0} onClose={() => {}} />);

    await user.click(screen.getByText("Add to Favorites"));
    expect(useDocStore.getState().scratchpad).toHaveLength(1);
  });

  it("edge target disables node-only actions (Cut/Copy/Duplicate) but keeps Delete", () => {
    const a = useDocStore.getState().addShapeNode("general/rect", { x: 0, y: 0 }, { w: 100, h: 60 });
    const b = useDocStore.getState().addShapeNode("general/rect", { x: 200, y: 0 }, { w: 100, h: 60 });
    const edgeId = useDocStore.getState().connect({
      sourceNodeId: a,
      sourceHandleId: "right",
      targetNodeId: b,
      targetHandleId: "left",
    });
    useDocStore.getState().setSelection([], [edgeId]);
    render(<ContextMenu target="edge" x={0} y={0} onClose={() => {}} />);
    expect(screen.getByText("Cut")).toBeDisabled();
    expect(screen.getByText("Copy")).toBeDisabled();
    expect(screen.getByText("Duplicate")).toBeDisabled();
    expect(screen.getByText("Delete")).toBeEnabled();
    expect(screen.queryByText("To Front")).not.toBeInTheDocument();
  });

  it("clicking Delete removes the selection and closes the menu", async () => {
    const id = useDocStore.getState().addShapeNode("general/rect", { x: 0, y: 0 }, { w: 100, h: 60 });
    useDocStore.getState().setSelection([id]);
    let closed = false;
    const user = userEvent.setup();
    render(<ContextMenu target="node" x={0} y={0} onClose={() => (closed = true)} />);

    await user.click(screen.getByText("Delete"));

    const diagramId = useDocStore.getState().currentDiagramId();
    expect(useDocStore.getState().doc.diagrams[diagramId].nodes).toHaveLength(0);
    expect(closed).toBe(true);
  });

  it("closes on outside pointerdown and on Escape", () => {
    let closed = false;
    render(<ContextMenu target="canvas" x={0} y={0} onClose={() => (closed = true)} />);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(closed).toBe(true);
  });
});
