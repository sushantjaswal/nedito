import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { useDocStore } from "../model/store";
import { DiagramCanvas } from "./DiagramCanvas";

function resetStore() {
  const initial = useDocStore.getState();
  const diagramId = initial.currentDiagramId();
  useDocStore.setState({
    doc: {
      ...initial.doc,
      diagrams: { ...initial.doc.diagrams, [diagramId]: { ...initial.doc.diagrams[diagramId], nodes: [], edges: [] } },
    },
    selection: { nodeIds: [], edgeIds: [] },
    editingNodeId: null,
  });
  useDocStore.temporal.getState().clear();
}

describe("DiagramCanvas", () => {
  beforeEach(resetStore);

  it("renders a shape node placed via the store", () => {
    const id = useDocStore.getState().addShapeNode("general/rect", { x: 0, y: 0 }, { w: 100, h: 60 });
    render(<DiagramCanvas />);
    expect(screen.getByTestId(`nd-shape-node-${id}`)).toBeInTheDocument();
  });

  it("double-click opens the label editor and Enter commits the label text", async () => {
    const user = userEvent.setup();
    const id = useDocStore.getState().addShapeNode("general/rect", { x: 0, y: 0 }, { w: 100, h: 60 });
    render(<DiagramCanvas />);

    // fireEvent (not userEvent) here: userEvent's dblClick replays a full native
    // mousedown/mouseup sequence, which trips React Flow's d3-drag node-drag handler in
    // jsdom (a known jsdom/d3-drag incompatibility, unrelated to our double-click handler).
    const node = screen.getByTestId(`nd-shape-node-${id}`);
    fireEvent.doubleClick(node);

    const textarea = await screen.findByRole("textbox");
    await user.type(textarea, "Hello");
    await user.keyboard("{Enter}");

    const diagramId = useDocStore.getState().currentDiagramId();
    const stored = useDocStore.getState().doc.diagrams[diagramId].nodes.find((n) => n.id === id);
    expect(stored?.label?.text).toBe("Hello");
    expect(useDocStore.getState().editingNodeId).toBeNull();
  });
});
