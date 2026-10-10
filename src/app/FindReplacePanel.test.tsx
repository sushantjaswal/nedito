import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { useDocStore } from "../model/store";
import { FindReplacePanel } from "./FindReplacePanel";

function resetStore() {
  const initial = useDocStore.getState();
  const diagramId = initial.currentDiagramId();
  useDocStore.setState({
    doc: {
      ...initial.doc,
      diagrams: { ...initial.doc.diagrams, [diagramId]: { ...initial.doc.diagrams[diagramId], nodes: [], edges: [] } },
    },
    selection: { nodeIds: [], edgeIds: [] },
    ui: { ...initial.ui, findReplaceOpen: false },
  });
  useDocStore.temporal.getState().clear();
}

describe("FindReplacePanel", () => {
  beforeEach(resetStore);

  it("renders nothing when closed", () => {
    render(<FindReplacePanel />);
    expect(screen.queryByTestId("nd-find-replace-panel")).not.toBeInTheDocument();
  });

  it("shows a 0/0 count with no query, and finds matches once typed", async () => {
    useDocStore.getState().addShapeNode("general/rect", { x: 0, y: 0 }, { w: 100, h: 60 });
    useDocStore.getState().setNodeLabel(useDocStore.getState().selection.nodeIds[0], { text: "Payment Service" });
    useDocStore.getState().toggleFindReplace();

    const user = userEvent.setup();
    render(<FindReplacePanel />);
    expect(screen.getByTestId("nd-find-count")).toHaveTextContent("0/0");

    await user.type(screen.getByTestId("nd-find-input"), "payment");
    expect(screen.getByTestId("nd-find-count")).toHaveTextContent("1/1");
  });

  it("selects the matched node when a match is found", async () => {
    const id = useDocStore.getState().addShapeNode("general/rect", { x: 0, y: 0 }, { w: 100, h: 60 });
    useDocStore.getState().setNodeLabel(id, { text: "Orders DB" });
    useDocStore.getState().clearSelection();
    useDocStore.getState().toggleFindReplace();

    const user = userEvent.setup();
    render(<FindReplacePanel />);
    await user.type(screen.getByTestId("nd-find-input"), "orders");

    expect(useDocStore.getState().selection.nodeIds).toEqual([id]);
  });

  it("Match case narrows results", async () => {
    const id = useDocStore.getState().addShapeNode("general/rect", { x: 0, y: 0 }, { w: 100, h: 60 });
    useDocStore.getState().setNodeLabel(id, { text: "Payment Service" });
    useDocStore.getState().toggleFindReplace();

    const user = userEvent.setup();
    render(<FindReplacePanel />);
    await user.type(screen.getByTestId("nd-find-input"), "payment");
    expect(screen.getByTestId("nd-find-count")).toHaveTextContent("1/1");

    await user.click(screen.getByTitle("Match case"));
    expect(screen.getByTestId("nd-find-count")).toHaveTextContent("0/0");
  });

  it("Replace changes only the current match's label text", async () => {
    const id = useDocStore.getState().addShapeNode("general/rect", { x: 0, y: 0 }, { w: 100, h: 60 });
    useDocStore.getState().setNodeLabel(id, { text: "Payment Service", bold: true });
    useDocStore.getState().toggleFindReplace();

    const user = userEvent.setup();
    render(<FindReplacePanel />);
    await user.type(screen.getByTestId("nd-find-input"), "Payment");
    await user.type(screen.getByTestId("nd-replace-input"), "Billing");
    await user.click(screen.getByText("Replace"));

    const diagramId = useDocStore.getState().currentDiagramId();
    const node = useDocStore.getState().doc.diagrams[diagramId].nodes.find((n) => n.id === id);
    expect(node?.label).toEqual({ text: "Billing Service", bold: true });
  });

  it("Replace All replaces every match in a single undo entry", async () => {
    const a = useDocStore.getState().addShapeNode("general/rect", { x: 0, y: 0 }, { w: 100, h: 60 });
    useDocStore.getState().setNodeLabel(a, { text: "foo one" });
    const b = useDocStore.getState().addShapeNode("general/rect", { x: 200, y: 0 }, { w: 100, h: 60 });
    useDocStore.getState().setNodeLabel(b, { text: "foo two" });
    useDocStore.getState().toggleFindReplace();
    const pastBefore = useDocStore.temporal.getState().pastStates.length;

    const user = userEvent.setup();
    render(<FindReplacePanel />);
    await user.type(screen.getByTestId("nd-find-input"), "foo");
    await user.type(screen.getByTestId("nd-replace-input"), "bar");
    await user.click(screen.getByText("Replace All"));

    const diagramId = useDocStore.getState().currentDiagramId();
    const nodes = useDocStore.getState().doc.diagrams[diagramId].nodes;
    expect(nodes.find((n) => n.id === a)?.label?.text).toBe("bar one");
    expect(nodes.find((n) => n.id === b)?.label?.text).toBe("bar two");
    expect(useDocStore.temporal.getState().pastStates.length).toBe(pastBefore + 1);
  });

  it("Escape in the search input closes the panel", async () => {
    useDocStore.getState().toggleFindReplace();
    const user = userEvent.setup();
    render(<FindReplacePanel />);
    await user.type(screen.getByTestId("nd-find-input"), "{Escape}");
    expect(useDocStore.getState().ui.findReplaceOpen).toBe(false);
  });

  it("closes when the close button is clicked", async () => {
    useDocStore.getState().toggleFindReplace();
    const user = userEvent.setup();
    render(<FindReplacePanel />);
    await user.click(screen.getByLabelText("Close find and replace"));
    expect(useDocStore.getState().ui.findReplaceOpen).toBe(false);
  });
});
