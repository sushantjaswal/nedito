// Pure doc-transform functions for per-diagram layers (the Layers panel).
// The Layers panel: a per-diagram, top-to-bottom-ordered list of layers, each with a
// visibility toggle, a lock toggle, a name, and every shape/edge belongs to exactly one layer.
// Hidden layers don't render; locked layers render but can't be selected/moved. New objects
// land on whichever layer is "active" (a UI concept, not a document field — see store.ts's
// activeLayerByDiagram).
import { nanoid } from "nanoid";
import type { DiagramDocument, Diagram, Layer } from "./types";

// A synthesized stand-in for diagrams saved before layers existed, so old .nedito files
// don't need a migration — they just behave as if everything sits on one default layer. Kept
// as a single well-known id (not a fresh nanoid per call) so repeated getLayers() calls on the
// same un-migrated diagram are referentially stable across renders.
export const DEFAULT_LAYER_ID = "__default_layer__";

// A stable singleton, not a fresh literal per call: getLayers() is called directly inside
// Zustand selectors (e.g. `useDocStore((s) => s.currentLayers())`), which compare the selected
// value by reference to decide whether to re-render. A fresh array on every call would compare
// unequal to itself call-over-call and infinite-loop React ("Maximum update depth exceeded").
const DEFAULT_LAYERS: Layer[] = [{ id: DEFAULT_LAYER_ID, name: "Layer 1", visible: true, locked: false }];

function defaultLayers(): Layer[] {
  return DEFAULT_LAYERS;
}

// Used when actually creating a new diagram (addPage, addNestedNode's child diagram, the
// initial doc), as opposed to defaultLayers() above which stands in for an *existing*
// un-migrated diagram — this one mints a real nanoid rather than the shared placeholder id.
export function createDefaultLayers(): Layer[] {
  return [{ id: nanoid(), name: "Layer 1", visible: true, locked: false }];
}

export function getLayers(diagram: Diagram): Layer[] {
  return diagram.layers && diagram.layers.length > 0 ? diagram.layers : defaultLayers();
}

export function getLayerId(item: { layerId?: string }, diagram: Diagram): string {
  return item.layerId ?? getLayers(diagram)[0].id;
}

function updateDiagram(doc: DiagramDocument, diagramId: string, fn: (diagram: Diagram) => Diagram): DiagramDocument {
  const diagram = doc.diagrams[diagramId];
  if (!diagram) return doc;
  const next = fn(diagram);
  if (next === diagram) return doc; // preserve identity for no-op cases (removeLayer/reorderLayer's early returns)
  return {
    ...doc,
    meta: { ...doc.meta, modified: new Date().toISOString() },
    diagrams: { ...doc.diagrams, [diagramId]: next },
  };
}

export interface AddLayerResult {
  doc: DiagramDocument;
  layerId: string;
}

export function addLayer(doc: DiagramDocument, diagramId: string, name: string): AddLayerResult {
  const layerId = nanoid();
  const next = updateDiagram(doc, diagramId, (diagram) => ({
    ...diagram,
    layers: [...getLayers(diagram), { id: layerId, name, visible: true, locked: false }],
  }));
  return { doc: next, layerId };
}

export function renameLayer(doc: DiagramDocument, diagramId: string, layerId: string, name: string): DiagramDocument {
  return updateDiagram(doc, diagramId, (diagram) => ({
    ...diagram,
    layers: getLayers(diagram).map((l) => (l.id === layerId ? { ...l, name } : l)),
  }));
}

export function setLayerVisible(doc: DiagramDocument, diagramId: string, layerId: string, visible: boolean): DiagramDocument {
  return updateDiagram(doc, diagramId, (diagram) => ({
    ...diagram,
    layers: getLayers(diagram).map((l) => (l.id === layerId ? { ...l, visible } : l)),
  }));
}

export function setLayerLocked(doc: DiagramDocument, diagramId: string, layerId: string, locked: boolean): DiagramDocument {
  return updateDiagram(doc, diagramId, (diagram) => ({
    ...diagram,
    layers: getLayers(diagram).map((l) => (l.id === layerId ? { ...l, locked } : l)),
  }));
}

// No-op if this would remove the diagram's only layer — a diagram always keeps at least one.
// Nodes/edges on the removed layer merge onto its neighbor (the layer above it in the list, or
// the new top layer if it was first) rather than being deleted: deleting a
// layer keeps the shapes and only removes the grouping.
export function removeLayer(doc: DiagramDocument, diagramId: string, layerId: string): DiagramDocument {
  return updateDiagram(doc, diagramId, (diagram) => {
    const layers = getLayers(diagram);
    if (layers.length <= 1) return diagram;
    const idx = layers.findIndex((l) => l.id === layerId);
    if (idx === -1) return diagram;
    const fallbackId = layers[idx > 0 ? idx - 1 : 1].id;

    return {
      ...diagram,
      layers: layers.filter((l) => l.id !== layerId),
      nodes: diagram.nodes.map((n) =>
        getLayerId(n, diagram) === layerId ? ({ ...n, layerId: fallbackId } as typeof n) : n,
      ),
      edges: diagram.edges.map((e) => (getLayerId(e, diagram) === layerId ? { ...e, layerId: fallbackId } : e)),
    };
  });
}

export function reorderLayer(doc: DiagramDocument, diagramId: string, fromIndex: number, toIndex: number): DiagramDocument {
  return updateDiagram(doc, diagramId, (diagram) => {
    const layers = getLayers(diagram);
    if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0 || fromIndex >= layers.length || toIndex >= layers.length) {
      return diagram;
    }
    const next = [...layers];
    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved);
    return { ...diagram, layers: next };
  });
}

export function moveSelectionToLayer(
  doc: DiagramDocument,
  diagramId: string,
  nodeIds: string[],
  layerId: string,
): DiagramDocument {
  const selected = new Set(nodeIds);
  return updateDiagram(doc, diagramId, (diagram) => ({
    ...diagram,
    layers: getLayers(diagram),
    nodes: diagram.nodes.map((n) => (selected.has(n.id) ? ({ ...n, layerId } as typeof n) : n)),
  }));
}
