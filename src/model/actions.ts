// Pure doc-transform functions. Every mutation in the app goes through one of these
// (command pattern) so the store can wrap each
// call in exactly one undo entry. No component mutates `doc` directly.
import { nanoid } from "nanoid";
import type { DiagramDocument, DEdge, Diagram, DNode, NodeBase, RichLabel } from "./types";
import { copyEdges, edgesToCopy } from "./edgeEnds";

export function updateDiagram(doc: DiagramDocument, diagramId: string, fn: (diagram: Diagram) => Diagram): DiagramDocument {
  const diagram = doc.diagrams[diagramId];
  if (!diagram) return doc;
  return {
    ...doc,
    meta: { ...doc.meta, modified: new Date().toISOString() },
    diagrams: { ...doc.diagrams, [diagramId]: fn(diagram) },
  };
}

function nextZ(diagram: Diagram): number {
  return diagram.nodes.reduce((max, n) => Math.max(max, n.z), 0) + 1;
}

export function renameDiagram(doc: DiagramDocument, diagramId: string, title: string): DiagramDocument {
  return updateDiagram(doc, diagramId, (d) => ({ ...d, title }));
}

// Undefined clears the page concept entirely, returning the diagram to a purely infinite
// canvas — the key is dropped rather than set to undefined so the saved JSON stays clean and
// round-trips byte-identically.
export function setDiagramPageSize(
  doc: DiagramDocument,
  diagramId: string,
  pageSize: { w: number; h: number } | undefined,
): DiagramDocument {
  return updateDiagram(doc, diagramId, (d) => {
    if (pageSize === undefined) {
      const { pageSize: _drop, ...rest } = d;
      void _drop;
      return rest;
    }
    return { ...d, pageSize };
  });
}

export function setDiagramBackground(doc: DiagramDocument, diagramId: string, background: string | undefined): DiagramDocument {
  return updateDiagram(doc, diagramId, (d) => {
    if (background === undefined) {
      const { background: _drop, ...rest } = d;
      void _drop;
      return rest;
    }
    return { ...d, background };
  });
}

export function addNode(doc: DiagramDocument, diagramId: string, node: Omit<DNode, "z">): DiagramDocument {
  return updateDiagram(doc, diagramId, (diagram) => ({
    ...diagram,
    nodes: [...diagram.nodes, { ...node, z: nextZ(diagram) } as DNode],
  }));
}


export interface NodePatch {
  id: string;
  patch: Partial<Pick<NodeBase, "position" | "size" | "rotation" | "style" | "layerId">>;
}

export function updateNodes(doc: DiagramDocument, diagramId: string, updates: NodePatch[]): DiagramDocument {
  const patchById = new Map(updates.map((u) => [u.id, u.patch]));
  return updateDiagram(doc, diagramId, (diagram) => ({
    ...diagram,
    nodes: diagram.nodes.map((n) => (patchById.has(n.id) ? ({ ...n, ...patchById.get(n.id) } as DNode) : n)),
  }));
}

export function setNodeLabel(doc: DiagramDocument, diagramId: string, nodeId: string, label: RichLabel): DiagramDocument {
  return updateDiagram(doc, diagramId, (diagram) => ({
    ...diagram,
    nodes: diagram.nodes.map((n) => (n.id === nodeId ? ({ ...n, label } as DNode) : n)),
  }));
}

export function bringToFront(doc: DiagramDocument, diagramId: string, nodeIds: string[]): DiagramDocument {
  const selected = new Set(nodeIds);
  return updateDiagram(doc, diagramId, (diagram) => {
    const z = nextZ(diagram);
    let offset = 0;
    return {
      ...diagram,
      nodes: diagram.nodes.map((n) => (selected.has(n.id) ? ({ ...n, z: z + offset++ } as DNode) : n)),
    };
  });
}

export interface DuplicateResult {
  doc: DiagramDocument;
  newIds: string[];
  /** The copied lines (edgesToCopy): selected ones, and connections between copied shapes. */
  newEdgeIds: string[];
}

const DUPLICATE_OFFSET = 20;

export function duplicateNodes(doc: DiagramDocument, diagramId: string, nodeIds: string[], edgeIds: string[] = []): DuplicateResult {
  const diagram = doc.diagrams[diagramId];
  if (!diagram) return { doc, newIds: [], newEdgeIds: [] };

  const idMap = new Map<string, string>();
  const toCopy = diagram.nodes.filter((n) => nodeIds.includes(n.id));
  const copies: DNode[] = toCopy.map((n) => {
    const newId = nanoid();
    idMap.set(n.id, newId);
    return {
      ...n,
      id: newId,
      position: { x: n.position.x + DUPLICATE_OFFSET, y: n.position.y + DUPLICATE_OFFSET },
    } as DNode;
  });

  const edgeCopies = copyEdges(
    edgesToCopy(diagram.edges, new Set(nodeIds), new Set(edgeIds)),
    idMap,
    nanoid,
    DUPLICATE_OFFSET,
    DUPLICATE_OFFSET,
  );

  const nextDoc = updateDiagram(doc, diagramId, (d) => {
    const z = nextZ(d);
    return {
      ...d,
      nodes: [...d.nodes, ...copies.map((c, i) => ({ ...c, z: z + i }))],
      edges: [...d.edges, ...edgeCopies],
    };
  });

  return { doc: nextDoc, newIds: Array.from(idMap.values()), newEdgeIds: edgeCopies.map((e) => e.id) };
}

// Removes nodes and edges together in a single doc transform so a mixed selection commits
// as one undo entry, matching draw.io's single Delete-key press behavior.
export function removeSelection(doc: DiagramDocument, diagramId: string, nodeIds: string[], edgeIds: string[]): DiagramDocument {
  const removedNodes = new Set(nodeIds);
  const removedEdges = new Set(edgeIds);
  return updateDiagram(doc, diagramId, (diagram) => ({
    ...diagram,
    nodes: diagram.nodes.filter((n) => !removedNodes.has(n.id)),
    edges: diagram.edges.filter(
      (e) =>
        !removedEdges.has(e.id) &&
        !(e.source.nodeId && removedNodes.has(e.source.nodeId)) &&
        !(e.target.nodeId && removedNodes.has(e.target.nodeId)),
    ),
  }));
}

export function addEdge(doc: DiagramDocument, diagramId: string, edge: DEdge): DiagramDocument {
  return updateDiagram(doc, diagramId, (diagram) => ({ ...diagram, edges: [...diagram.edges, edge] }));
}

export function removeEdges(doc: DiagramDocument, diagramId: string, edgeIds: string[]): DiagramDocument {
  const removed = new Set(edgeIds);
  return updateDiagram(doc, diagramId, (diagram) => ({
    ...diagram,
    edges: diagram.edges.filter((e) => !removed.has(e.id)),
  }));
}

export type EdgePatch = Partial<Pick<DEdge, "source" | "target" | "waypoints" | "style" | "label" | "labelPosition">>;

export function updateEdge(doc: DiagramDocument, diagramId: string, edgeId: string, patch: EdgePatch): DiagramDocument {
  return updateDiagram(doc, diagramId, (diagram) => ({
    ...diagram,
    edges: diagram.edges.map((e) => (e.id === edgeId ? { ...e, ...patch } : e)),
  }));
}

function neighborAbove(sorted: DNode[], id: string): DNode | null {
  const idx = sorted.findIndex((n) => n.id === id);
  return idx >= 0 && idx < sorted.length - 1 ? sorted[idx + 1] : null;
}

function neighborBelow(sorted: DNode[], id: string): DNode | null {
  const idx = sorted.findIndex((n) => n.id === id);
  return idx > 0 ? sorted[idx - 1] : null;
}

export function sendToBack(doc: DiagramDocument, diagramId: string, nodeIds: string[]): DiagramDocument {
  const selected = new Set(nodeIds);
  return updateDiagram(doc, diagramId, (diagram) => {
    const minZ = diagram.nodes.reduce((min, n) => Math.min(min, n.z), 0);
    const ordered = diagram.nodes.filter((n) => selected.has(n.id)).sort((a, b) => a.z - b.z);
    const zById = new Map(ordered.map((n, i) => [n.id, minZ - ordered.length + i]));
    return {
      ...diagram,
      nodes: diagram.nodes.map((n) => (zById.has(n.id) ? ({ ...n, z: zById.get(n.id)! } as DNode) : n)),
    };
  });
}

// Swaps each selected node's z with its immediate neighbor above/below, computed from the
// original (pre-swap) stacking order. Correct for the common case of moving one shape at a
// time; adjacent multi-selections may swap with each other rather than the next unselected
// neighbor, an acceptable v1 simplification for a secondary, rarely-multi-selected command.
export function moveForward(doc: DiagramDocument, diagramId: string, nodeIds: string[]): DiagramDocument {
  const selected = new Set(nodeIds);
  return updateDiagram(doc, diagramId, (diagram) => {
    const sorted = [...diagram.nodes].sort((a, b) => a.z - b.z);
    const zById = new Map(diagram.nodes.map((n) => [n.id, n.z]));
    for (const n of sorted) {
      if (!selected.has(n.id)) continue;
      const above = neighborAbove(sorted, n.id);
      if (above && !selected.has(above.id)) {
        const a = zById.get(n.id)!;
        const b = zById.get(above.id)!;
        zById.set(n.id, b);
        zById.set(above.id, a);
      }
    }
    return { ...diagram, nodes: diagram.nodes.map((n) => ({ ...n, z: zById.get(n.id)! }) as DNode) };
  });
}

export function moveBackward(doc: DiagramDocument, diagramId: string, nodeIds: string[]): DiagramDocument {
  const selected = new Set(nodeIds);
  return updateDiagram(doc, diagramId, (diagram) => {
    const sorted = [...diagram.nodes].sort((a, b) => a.z - b.z);
    const zById = new Map(diagram.nodes.map((n) => [n.id, n.z]));
    for (const n of [...sorted].reverse()) {
      if (!selected.has(n.id)) continue;
      const below = neighborBelow(sorted, n.id);
      if (below && !selected.has(below.id)) {
        const a = zById.get(n.id)!;
        const b = zById.get(below.id)!;
        zById.set(n.id, b);
        zById.set(below.id, a);
      }
    }
    return { ...diagram, nodes: diagram.nodes.map((n) => ({ ...n, z: zById.get(n.id)! }) as DNode) };
  });
}

export type AlignMode = "left" | "center-h" | "right" | "top" | "middle-v" | "bottom";

export function alignNodes(doc: DiagramDocument, diagramId: string, nodeIds: string[], mode: AlignMode): DiagramDocument {
  const selected = new Set(nodeIds);
  return updateDiagram(doc, diagramId, (diagram) => {
    const targets = diagram.nodes.filter((n) => selected.has(n.id));
    if (targets.length < 2) return diagram;

    const minX = Math.min(...targets.map((n) => n.position.x));
    const maxX = Math.max(...targets.map((n) => n.position.x + n.size.w));
    const minY = Math.min(...targets.map((n) => n.position.y));
    const maxY = Math.max(...targets.map((n) => n.position.y + n.size.h));

    const patchById = new Map<string, { x?: number; y?: number }>();
    for (const n of targets) {
      switch (mode) {
        case "left":
          patchById.set(n.id, { x: minX });
          break;
        case "right":
          patchById.set(n.id, { x: maxX - n.size.w });
          break;
        case "center-h":
          patchById.set(n.id, { x: (minX + maxX) / 2 - n.size.w / 2 });
          break;
        case "top":
          patchById.set(n.id, { y: minY });
          break;
        case "bottom":
          patchById.set(n.id, { y: maxY - n.size.h });
          break;
        case "middle-v":
          patchById.set(n.id, { y: (minY + maxY) / 2 - n.size.h / 2 });
          break;
      }
    }

    return {
      ...diagram,
      nodes: diagram.nodes.map((n) => {
        const p = patchById.get(n.id);
        if (!p) return n;
        return { ...n, position: { x: p.x ?? n.position.x, y: p.y ?? n.position.y } } as DNode;
      }),
    };
  });
}

export type DistributeAxis = "horizontal" | "vertical";

export function distributeNodes(doc: DiagramDocument, diagramId: string, nodeIds: string[], axis: DistributeAxis): DiagramDocument {
  const selected = new Set(nodeIds);
  return updateDiagram(doc, diagramId, (diagram) => {
    const targets = diagram.nodes.filter((n) => selected.has(n.id));
    if (targets.length < 3) return diagram;

    const sorted = [...targets].sort((a, b) =>
      axis === "horizontal" ? a.position.x - b.position.x : a.position.y - b.position.y,
    );
    const first = sorted[0];
    const last = sorted[sorted.length - 1];
    const totalSpan =
      axis === "horizontal"
        ? last.position.x + last.size.w - first.position.x
        : last.position.y + last.size.h - first.position.y;
    const totalSize = sorted.reduce((sum, n) => sum + (axis === "horizontal" ? n.size.w : n.size.h), 0);
    const gap = (totalSpan - totalSize) / (sorted.length - 1);

    const patchById = new Map<string, number>();
    let cursor = axis === "horizontal" ? first.position.x : first.position.y;
    for (const n of sorted) {
      patchById.set(n.id, cursor);
      cursor += (axis === "horizontal" ? n.size.w : n.size.h) + gap;
    }

    return {
      ...diagram,
      nodes: diagram.nodes.map((n) => {
        const v = patchById.get(n.id);
        if (v === undefined) return n;
        return {
          ...n,
          position: axis === "horizontal" ? { x: v, y: n.position.y } : { x: n.position.x, y: v },
        } as DNode;
      }),
    };
  });
}
