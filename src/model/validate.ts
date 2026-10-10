// The document's invariants, checked whenever a document is read: opening a file, restoring
// the autosave, importing (README, "How a document is put together").
import { motionProblems } from "./motion";
import { assetProblem, isImageNode } from "./assets";
import type { DiagramDocument, Diagram, DNode, EdgeEnd, NestedNode } from "./types";

export interface ValidationError {
  code: string;
  message: string;
  diagramId?: string;
  nodeId?: string;
}

export function isNestedNode(node: DNode): node is NestedNode {
  return node.type === "nested";
}

export function validateDoc(doc: DiagramDocument): ValidationError[] {
  const errors: ValidationError[] = [];

  errors.push(...checkUniqueIds(doc));
  errors.push(...checkRootDiagramsExist(doc));
  errors.push(...checkChildDiagramsExist(doc));
  errors.push(...checkNoCycles(doc));
  errors.push(...checkPortsReferenceRealNodes(doc));
  errors.push(...checkLayerIdsReferenceRealLayers(doc));
  errors.push(...checkImagesHaveSoundAssets(doc));
  errors.push(...checkEdgeEnds(doc));
  errors.push(...motionProblems(doc).map((p) => ({ code: "BAD_MOTION", message: p.message, diagramId: p.diagramId })));

  return errors;
}

/**
 * Every edge end is attached to a node or free at a point — exactly one (types.ts EdgeEnd). An end
 * with neither has nowhere to be drawn; one with both would be read two ways by two renderers.
 */
function checkEdgeEnds(doc: DiagramDocument): ValidationError[] {
  const errors: ValidationError[] = [];
  const finite = (p: unknown): boolean =>
    typeof p === "object" && p !== null && Number.isFinite((p as { x: unknown }).x) && Number.isFinite((p as { y: unknown }).y);
  for (const diagram of Object.values(doc.diagrams)) {
    for (const edge of diagram.edges) {
      for (const name of ["source", "target"] as const) {
        const end = edge[name] as EdgeEnd | undefined;
        const attached = typeof end?.nodeId === "string" && end.nodeId.length > 0;
        const free = end?.point !== undefined;
        if (attached === free || (free && !finite(end?.point))) {
          errors.push({
            code: "BAD_EDGE_END",
            message: `Edge "${edge.id}" in diagram "${diagram.id}" has a ${name} that is ${attached ? "both attached and free" : free ? "at an invalid point" : "neither attached nor free"}`,
            diagramId: diagram.id,
          });
        }
      }
      const at = edge.labelPosition;
      if (at !== undefined && !(Number.isFinite(at.t) && at.t >= 0 && at.t <= 1 && Number.isFinite(at.dx) && Number.isFinite(at.dy))) {
        errors.push({
          code: "BAD_EDGE_END",
          message: `Edge "${edge.id}" in diagram "${diagram.id}" has an invalid label position`,
          diagramId: diagram.id,
        });
      }
    }
  }
  return errors;
}

/** Every image node shows an asset that exists, and every asset is what it claims to be (D79). */
function checkImagesHaveSoundAssets(doc: DiagramDocument): ValidationError[] {
  const errors: ValidationError[] = [];
  for (const [id, asset] of Object.entries(doc.assets ?? {})) {
    const problem = assetProblem(asset);
    if (problem) errors.push({ code: "BAD_ASSET", message: `Image "${asset.name ?? id}": ${problem}` });
  }
  for (const diagram of Object.values(doc.diagrams)) {
    for (const node of diagram.nodes) {
      if (!isImageNode(node)) continue;
      if (!node.imageId || !doc.assets?.[node.imageId]) {
        errors.push({
          code: "MISSING_ASSET",
          message: `Image node "${node.id}" in diagram "${diagram.id}" shows a picture that isn't in the file`,
          diagramId: diagram.id,
          nodeId: node.id,
        });
      }
    }
  }
  return errors;
}

function checkUniqueIds(doc: DiagramDocument): ValidationError[] {
  const errors: ValidationError[] = [];
  const seen = new Set<string>();

  const record = (id: string, diagramId?: string, nodeId?: string) => {
    if (seen.has(id)) {
      errors.push({
        code: "DUPLICATE_ID",
        message: `Duplicate id "${id}" found in document`,
        diagramId,
        nodeId,
      });
    }
    seen.add(id);
  };

  for (const diagram of Object.values(doc.diagrams)) {
    record(diagram.id, diagram.id);
    for (const node of diagram.nodes) {
      record(node.id, diagram.id, node.id);
      if (isNestedNode(node)) {
        for (const port of node.ports) {
          record(port.id, diagram.id, node.id);
        }
      }
    }
    for (const edge of diagram.edges) {
      record(edge.id, diagram.id);
    }
  }
  // Asset ids share the document's one id space, like every other id.
  for (const assetId of Object.keys(doc.assets ?? {})) record(assetId);

  return errors;
}

function checkRootDiagramsExist(doc: DiagramDocument): ValidationError[] {
  return doc.rootDiagramIds
    .filter((id) => !doc.diagrams[id])
    .map((id) => ({
      code: "MISSING_ROOT_DIAGRAM",
      message: `rootDiagramIds references missing diagram "${id}"`,
      diagramId: id,
    }));
}

function checkChildDiagramsExist(doc: DiagramDocument): ValidationError[] {
  const errors: ValidationError[] = [];
  for (const diagram of Object.values(doc.diagrams)) {
    for (const node of diagram.nodes) {
      if (isNestedNode(node) && !doc.diagrams[node.childDiagramId]) {
        errors.push({
          code: "MISSING_CHILD_DIAGRAM",
          message: `Nested node "${node.id}" references missing diagram "${node.childDiagramId}"`,
          diagramId: diagram.id,
          nodeId: node.id,
        });
      }
    }
  }
  return errors;
}

function checkNoCycles(doc: DiagramDocument): ValidationError[] {
  const errors: ValidationError[] = [];
  // color: white=unvisited, grey=in current path, black=fully explored
  const color = new Map<string, "grey" | "black">();

  const childDiagramIdsOf = (diagram: Diagram): string[] =>
    diagram.nodes.filter(isNestedNode).map((n) => n.childDiagramId);

  const visit = (diagramId: string, path: string[]): void => {
    const diagram = doc.diagrams[diagramId];
    if (!diagram) return; // reported by checkChildDiagramsExist
    if (color.get(diagramId) === "black") return;
    if (color.get(diagramId) === "grey") {
      errors.push({
        code: "CYCLE",
        message: `Nesting cycle detected: ${[...path, diagramId].join(" -> ")}`,
        diagramId,
      });
      return;
    }
    color.set(diagramId, "grey");
    for (const childId of childDiagramIdsOf(diagram)) {
      visit(childId, [...path, diagramId]);
    }
    color.set(diagramId, "black");
  };

  for (const diagramId of Object.keys(doc.diagrams)) {
    if (!color.has(diagramId)) visit(diagramId, []);
  }

  return errors;
}

// Only checks nodes/edges that set an explicit layerId AND the diagram has a real (non-
// synthesized) layers array — an absent layerId always falls back safely (model/layers.ts's
// getLayerId), so there's nothing to validate for diagrams that haven't touched layers yet.
function checkLayerIdsReferenceRealLayers(doc: DiagramDocument): ValidationError[] {
  const errors: ValidationError[] = [];
  for (const diagram of Object.values(doc.diagrams)) {
    if (!diagram.layers || diagram.layers.length === 0) continue;
    const layerIds = new Set(diagram.layers.map((l) => l.id));
    for (const node of diagram.nodes) {
      if (node.layerId !== undefined && !layerIds.has(node.layerId)) {
        errors.push({
          code: "DANGLING_LAYER_ID",
          message: `Node "${node.id}" references missing layer "${node.layerId}" in diagram "${diagram.id}"`,
          diagramId: diagram.id,
          nodeId: node.id,
        });
      }
    }
    for (const edge of diagram.edges) {
      if (edge.layerId !== undefined && !layerIds.has(edge.layerId)) {
        errors.push({
          code: "DANGLING_LAYER_ID",
          message: `Edge "${edge.id}" references missing layer "${edge.layerId}" in diagram "${diagram.id}"`,
          diagramId: diagram.id,
        });
      }
    }
  }
  return errors;
}

function checkPortsReferenceRealNodes(doc: DiagramDocument): ValidationError[] {
  const errors: ValidationError[] = [];
  for (const diagram of Object.values(doc.diagrams)) {
    for (const node of diagram.nodes) {
      if (!isNestedNode(node)) continue;
      const child = doc.diagrams[node.childDiagramId];
      if (!child) continue; // reported by checkChildDiagramsExist
      const innerIds = new Set(child.nodes.map((n) => n.id));
      for (const port of node.ports) {
        // An absent innerNodeId is a legitimate "unmapped, waiting to be linked" port (see
        // types.ts's Port), not a dangling reference — only a *set* id that points at nothing
        // is a real violation: every set port.innerNodeId must exist in the child.
        if (port.innerNodeId === undefined) continue;
        if (!innerIds.has(port.innerNodeId)) {
          errors.push({
            code: "DANGLING_PORT",
            message: `Port "${port.id}" on node "${node.id}" references missing inner node "${port.innerNodeId}" in diagram "${child.id}"`,
            diagramId: diagram.id,
            nodeId: node.id,
          });
        }
      }
    }
  }
  return errors;
}
