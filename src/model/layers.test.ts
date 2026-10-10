import { describe, expect, it } from "vitest";
import { addNode } from "./actions";
import {
  addLayer,
  DEFAULT_LAYER_ID,
  getLayerId,
  getLayers,
  moveSelectionToLayer,
  removeLayer,
  renameLayer,
  reorderLayer,
  setLayerLocked,
  setLayerVisible,
} from "./layers";
import type { DiagramDocument, ShapeNode } from "./types";

function emptyDoc(diagramId = "root"): DiagramDocument {
  return {
    formatVersion: 1,
    meta: { title: "Untitled", created: "2026-08-08", modified: "2026-08-08", appVersion: "0.0.1" },
    rootDiagramIds: [diagramId],
    diagrams: { [diagramId]: { id: diagramId, title: "Page 1", nodes: [], edges: [] } },
  };
}

function shape(id: string, layerId?: string): Omit<ShapeNode, "z"> {
  return { id, type: "shape", shapeRef: "general/rect", position: { x: 0, y: 0 }, size: { w: 100, h: 60 }, style: {}, layerId };
}

describe("getLayers / getLayerId", () => {
  it("synthesizes a single default layer for a diagram with no layers field", () => {
    const doc = emptyDoc();
    const layers = getLayers(doc.diagrams.root);
    expect(layers).toEqual([{ id: DEFAULT_LAYER_ID, name: "Layer 1", visible: true, locked: false }]);
  });

  it("getLayerId falls back to the diagram's first layer when the node has none set", () => {
    const doc = emptyDoc();
    expect(getLayerId({}, doc.diagrams.root)).toBe(DEFAULT_LAYER_ID);
  });

  it("getLayerId returns the node's own layerId when set", () => {
    const doc = emptyDoc();
    expect(getLayerId({ layerId: "x" }, doc.diagrams.root)).toBe("x");
  });

  it("returns a referentially stable array across repeated calls for a diagram with no real layers", () => {
    // Regression: getLayers() is called directly inside Zustand selectors
    // (useDocStore((s) => s.currentLayers())), which re-render on reference inequality. A
    // fresh array literal per call previously infinite-looped React.
    const doc = emptyDoc();
    expect(getLayers(doc.diagrams.root)).toBe(getLayers(doc.diagrams.root));
  });
});

describe("addLayer", () => {
  it("appends a new visible, unlocked layer after materializing the default one", () => {
    const doc = emptyDoc();
    const { doc: next, layerId } = addLayer(doc, "root", "Layer 2");
    expect(next.diagrams.root.layers).toEqual([
      { id: DEFAULT_LAYER_ID, name: "Layer 1", visible: true, locked: false },
      { id: layerId, name: "Layer 2", visible: true, locked: false },
    ]);
  });
});

describe("renameLayer / setLayerVisible / setLayerLocked", () => {
  it("patches the matching layer only", () => {
    let doc = emptyDoc();
    const added = addLayer(doc, "root", "Layer 2");
    doc = added.doc;

    doc = renameLayer(doc, "root", added.layerId, "Background");
    doc = setLayerVisible(doc, "root", added.layerId, false);
    doc = setLayerLocked(doc, "root", added.layerId, true);

    const layers = getLayers(doc.diagrams.root);
    expect(layers[0]).toEqual({ id: DEFAULT_LAYER_ID, name: "Layer 1", visible: true, locked: false });
    expect(layers[1]).toEqual({ id: added.layerId, name: "Background", visible: false, locked: true });
  });
});

describe("removeLayer", () => {
  it("refuses to remove the diagram's only layer", () => {
    const doc = emptyDoc();
    const next = removeLayer(doc, "root", DEFAULT_LAYER_ID);
    expect(getLayers(next.diagrams.root)).toHaveLength(1);
  });

  it("merges the removed layer's nodes onto the neighboring layer instead of deleting them", () => {
    let doc = emptyDoc();
    const layer2 = addLayer(doc, "root", "Layer 2");
    doc = layer2.doc;
    doc = addNode(doc, "root", shape("a", layer2.layerId));

    doc = removeLayer(doc, "root", layer2.layerId);

    expect(getLayers(doc.diagrams.root)).toEqual([{ id: DEFAULT_LAYER_ID, name: "Layer 1", visible: true, locked: false }]);
    expect(getLayerId(doc.diagrams.root.nodes[0], doc.diagrams.root)).toBe(DEFAULT_LAYER_ID);
  });

  it("is a no-op for an unknown layer id", () => {
    const doc = emptyDoc();
    expect(removeLayer(doc, "root", "ghost")).toBe(doc);
  });
});

describe("reorderLayer", () => {
  it("moves a layer from one index to another", () => {
    let doc = emptyDoc();
    doc = addLayer(doc, "root", "Layer 2").doc;
    doc = addLayer(doc, "root", "Layer 3").doc;
    const [l1, l2, l3] = getLayers(doc.diagrams.root);

    const next = reorderLayer(doc, "root", 0, 2);
    expect(getLayers(next.diagrams.root).map((l) => l.id)).toEqual([l2.id, l3.id, l1.id]);
  });

  it("is a no-op for an out-of-range index", () => {
    const doc = emptyDoc();
    expect(reorderLayer(doc, "root", 0, 5)).toBe(doc);
  });
});

describe("moveSelectionToLayer", () => {
  it("reassigns only the given node ids", () => {
    let doc = emptyDoc();
    const layer2 = addLayer(doc, "root", "Layer 2");
    doc = layer2.doc;
    doc = addNode(doc, "root", shape("a"));
    doc = addNode(doc, "root", shape("b"));

    doc = moveSelectionToLayer(doc, "root", ["a"], layer2.layerId);

    expect(getLayerId(doc.diagrams.root.nodes[0], doc.diagrams.root)).toBe(layer2.layerId);
    expect(getLayerId(doc.diagrams.root.nodes[1], doc.diagrams.root)).toBe(DEFAULT_LAYER_ID);
  });
});
