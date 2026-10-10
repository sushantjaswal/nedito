import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { useDocStore } from "../model/store";
import { LayersPanel } from "./LayersPanel";

function resetStore() {
  const initial = useDocStore.getState();
  const diagramId = initial.currentDiagramId();
  useDocStore.setState({
    doc: {
      ...initial.doc,
      diagrams: {
        ...initial.doc.diagrams,
        [diagramId]: { ...initial.doc.diagrams[diagramId], nodes: [], edges: [], layers: undefined },
      },
    },
    selection: { nodeIds: [], edgeIds: [] },
    activeLayerByDiagram: {},
    ui: { ...initial.ui, layersPanelOpen: false },
  });
  useDocStore.temporal.getState().clear();
}

describe("LayersPanel", () => {
  beforeEach(resetStore);

  it("renders nothing when closed", () => {
    render(<LayersPanel />);
    expect(screen.queryByTestId("nd-layers-panel")).not.toBeInTheDocument();
  });

  it("shows the diagram's default layer when opened", () => {
    useDocStore.getState().toggleLayersPanel();
    render(<LayersPanel />);
    expect(screen.getByTestId("nd-layers-panel")).toBeInTheDocument();
    expect(screen.getByText("Layer 1")).toBeInTheDocument();
  });

  it("adding a layer makes it active and shows it in the list", async () => {
    useDocStore.getState().toggleLayersPanel();
    const user = userEvent.setup();
    render(<LayersPanel />);

    await user.click(screen.getByTestId("nd-layer-add"));

    const layers = useDocStore.getState().currentLayers();
    expect(layers).toHaveLength(2);
    expect(useDocStore.getState().activeLayerId()).toBe(layers[1].id);
    expect(screen.getByText("Layer 2")).toBeInTheDocument();
  });

  it("toggling visibility and lock updates the model", async () => {
    useDocStore.getState().toggleLayersPanel();
    const user = userEvent.setup();
    render(<LayersPanel />);
    const layerId = useDocStore.getState().currentLayers()[0].id;

    await user.click(screen.getByTestId(`nd-layer-visible-${layerId}`));
    expect(useDocStore.getState().currentLayers()[0].visible).toBe(false);

    await user.click(screen.getByTestId(`nd-layer-locked-${layerId}`));
    expect(useDocStore.getState().currentLayers()[0].locked).toBe(true);
  });

  it("double-clicking a layer name renames it", async () => {
    useDocStore.getState().toggleLayersPanel();
    const user = userEvent.setup();
    render(<LayersPanel />);

    await user.dblClick(screen.getByText("Layer 1"));
    const input = screen.getByDisplayValue("Layer 1");
    await user.clear(input);
    await user.type(input, "Background{Enter}");

    expect(useDocStore.getState().currentLayers()[0].name).toBe("Background");
  });

  it("does not offer a delete button for the only remaining layer", () => {
    useDocStore.getState().toggleLayersPanel();
    render(<LayersPanel />);
    expect(screen.queryByTitle("Delete layer")).not.toBeInTheDocument();
  });

  it("deletes a layer when more than one exists", async () => {
    useDocStore.getState().toggleLayersPanel();
    useDocStore.getState().addLayer("Layer 2");

    const user = userEvent.setup();
    render(<LayersPanel />);

    await user.click(screen.getAllByTitle("Delete layer")[0]);
    expect(useDocStore.getState().currentLayers()).toHaveLength(1);
  });

  it("closes when the close button is clicked", async () => {
    useDocStore.getState().toggleLayersPanel();
    const user = userEvent.setup();
    render(<LayersPanel />);

    await user.click(screen.getByLabelText("Close layers panel"));
    expect(useDocStore.getState().ui.layersPanelOpen).toBe(false);
  });
});
