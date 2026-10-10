// Renders the context bar and canvas chip the way the canvas mounts them — inside React Flow's
// provider, which they read the viewport and pane size from — for component tests.
import { render } from "@testing-library/react";
import { ReactFlowProvider } from "@xyflow/react";
import { useDocStore } from "../model/store";
import { CanvasChip } from "./CanvasChip";
import { ContextBar } from "./ContextBar";

export function renderBar() {
  return render(
    <ReactFlowProvider>
      <ContextBar />
      <CanvasChip />
    </ReactFlowProvider>,
  );
}

/** A store with one empty page and nothing selected or undoable. */
export function resetStore() {
  const initial = useDocStore.getState();
  const rootId = initial.doc.rootDiagramIds[0];
  useDocStore.setState({
    doc: { ...initial.doc, rootDiagramIds: [rootId], diagrams: { [rootId]: { id: rootId, title: "Page 1", nodes: [], edges: [] } } },
    navStack: [rootId],
    selection: { nodeIds: [], edgeIds: [] },
    ui: { ...initial.ui, canvasGesture: false, pageSettingsOpen: false },
  });
  useDocStore.temporal.getState().clear();
}
