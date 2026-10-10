// The deletion prompts D12 deferred (N7, CLAUDE_HISTORY.md D138). CLAUDE.md asks that deleting a
// Nested Block offer to delete what is inside it or keep it, and that deleting a shape a parent's
// link enters through offer to keep or remove that link. v1 had no dialogs and cascaded silently;
// these are the choices the prompts offer, as pure document transforms the store applies in one
// undo entry.
//
// "Keep" for a Nested Block means its contents come up onto this level where the block was — the
// "unused pool" CLAUDE.md first imagined had nowhere to be seen or reattached from, so a lifted
// level is the honest form of keeping it (approved 2026-10-08).
import { updateDiagram } from "./actions";
import { cascadeGroupCleanup } from "./groups";
import { collectDescendantDiagramIds } from "./nesting";
import { isNestedNode } from "./validate";
import type { DEdge, Diagram, DiagramDocument, DNode, EdgeEnd, NestedNode } from "./types";

export interface BlockStake {
  id: string;
  name: string;
  /** Shapes on every level inside it. */
  shapes: number;
}

export interface MappedStake {
  id: string;
  name: string;
  /** The parent's links that enter through it. */
  links: number;
}

const nameOf = (n: DNode) => n.label?.text?.trim() || (isNestedNode(n) ? "Nested Block" : "this shape");

/** What deleting these shapes would take with it, for the prompt; empty when nothing would. */
export function deletionStakes(doc: DiagramDocument, diagramId: string, nodeIds: string[]): { blocks: BlockStake[]; mapped: MappedStake[] } {
  const diagram = doc.diagrams[diagramId];
  const chosen = new Set(nodeIds);
  const blocks: BlockStake[] = [];
  const mapped: MappedStake[] = [];
  if (!diagram) return { blocks, mapped };

  for (const n of diagram.nodes) {
    if (!chosen.has(n.id) || !isNestedNode(n)) continue;
    const levels = [n.childDiagramId, ...collectDescendantDiagramIds(doc, n.childDiagramId)];
    const shapes = levels.reduce((sum, id) => sum + (doc.diagrams[id]?.nodes.filter((x) => x.type !== "group").length ?? 0), 0);
    // A block is named by its label, or else by its level's title — as its box shows it.
    const name = n.label?.text?.trim() || doc.diagrams[n.childDiagramId]?.title?.trim() || nameOf(n);
    if (shapes > 0) blocks.push({ id: n.id, name, shapes });
  }

  // A shape here that a parent's port maps to: the parent's links through that port depend on it.
  for (const parent of Object.values(doc.diagrams)) {
    for (const block of parent.nodes) {
      if (!isNestedNode(block) || block.childDiagramId !== diagramId) continue;
      for (const port of block.ports) {
        if (!port.innerNodeId || !chosen.has(port.innerNodeId)) continue;
        const links = parent.edges.filter((e) => e.source.portId === port.id || e.target.portId === port.id).length;
        const inner = diagram.nodes.find((x) => x.id === port.innerNodeId);
        const existing = mapped.find((m) => m.id === port.innerNodeId);
        if (existing) existing.links += links;
        else if (inner) mapped.push({ id: inner.id, name: nameOf(inner), links });
      }
    }
  }
  return { blocks, mapped: mapped.filter((m) => m.links > 0) };
}

/** A point moved by an offset. */
const shift = (p: { x: number; y: number }, by: { x: number; y: number }) => ({ x: p.x + by.x, y: p.y + by.y });

/**
 * Brings each Nested Block's contents up onto this level, where the block was, and removes the
 * block. Its shapes, lines and any Nested Blocks inside it keep their ids (they are unique across
 * the document); its own level goes, while the levels inside its blocks stay theirs. A link that
 * entered through a mapped port now goes straight to the shape it led to; one through an unmapped
 * port led nowhere inside, and goes with the block.
 */
export function liftNestedContents(doc: DiagramDocument, diagramId: string, blockIds: string[]): DiagramDocument {
  let next = doc;
  for (const blockId of blockIds) {
    const diagram = next.diagrams[diagramId];
    const block = diagram?.nodes.find((n): n is NestedNode => n.id === blockId && isNestedNode(n));
    if (!diagram || !block) continue;
    const child = next.diagrams[block.childDiagramId];
    const inner = child?.nodes ?? [];
    const innerEdges = child?.edges ?? [];

    // The contents' top-left lands on the block's; above everything already on this level.
    const minX = inner.length ? Math.min(...inner.map((n) => n.position.x)) : 0;
    const minY = inner.length ? Math.min(...inner.map((n) => n.position.y)) : 0;
    const by = { x: block.position.x - minX, y: block.position.y - minY };
    const zBase = Math.max(0, ...diagram.nodes.map((n) => n.z));
    // A lifted shape takes this level's first layer: its old level's layers go with the level.
    const lifted: DNode[] = inner.map((n) => {
      const moved = { ...n, position: shift(n.position, by), z: zBase + n.z } as DNode;
      delete (moved as { layerId?: string }).layerId;
      return moved;
    });
    const liftEnd = (end: EdgeEnd): EdgeEnd => (end.point ? { ...end, point: shift(end.point, by) } : end);
    const liftedEdges: DEdge[] = innerEdges.map((e) => {
      const moved: DEdge = { ...e, source: liftEnd(e.source), target: liftEnd(e.target) };
      if (e.waypoints) moved.waypoints = e.waypoints.map((w) => shift(w, by));
      delete moved.layerId;
      return moved;
    });

    // The parent's links to the block: through a mapped port, now to the shape it led to.
    const innerIds = new Set(inner.map((n) => n.id));
    const portTarget = new Map(block.ports.filter((p) => p.innerNodeId && innerIds.has(p.innerNodeId)).map((p) => [p.id, p.innerNodeId!]));
    const retarget = (end: EdgeEnd, handleKey: "sourceHandle" | "targetHandle", e: DEdge): EdgeEnd | null => {
      if (end.nodeId !== block.id) return end;
      const to = end.portId ? portTarget.get(end.portId) : undefined;
      if (!to) return null;
      if (typeof e.style[handleKey] === "string" && (e.style[handleKey] as string).startsWith("port:")) delete e.style[handleKey];
      return { nodeId: to };
    };
    const keptEdges: DEdge[] = [];
    for (const e of diagram.edges) {
      if (e.source.nodeId !== block.id && e.target.nodeId !== block.id) {
        keptEdges.push(e);
        continue;
      }
      const copy: DEdge = { ...e, style: { ...e.style } };
      const source = retarget(e.source, "sourceHandle", copy);
      const target = retarget(e.target, "targetHandle", copy);
      if (source && target) keptEdges.push({ ...copy, source, target });
    }

    next = updateDiagram(next, diagramId, (d: Diagram) =>
      cascadeGroupCleanup(
        {
          ...d,
          nodes: [...d.nodes.filter((n) => n.id !== block.id), ...lifted],
          edges: [...keptEdges, ...liftedEdges],
        },
        [block.id],
      ),
    );
    const diagrams = { ...next.diagrams };
    delete diagrams[block.childDiagramId];
    next = { ...next, diagrams };
  }
  return next;
}

/**
 * Removes the parent's links that enter this level through the given shapes: the ports mapped to
 * them and the lines attached to those ports — the other choice when deleting such a shape, beside
 * keeping the link waiting to be relinked.
 */
export function removeLinksThrough(doc: DiagramDocument, diagramId: string, innerIds: string[]): DiagramDocument {
  const gone = new Set(innerIds);
  let next = doc;
  for (const parent of Object.values(doc.diagrams)) {
    const blocks = parent.nodes.filter((n): n is NestedNode => isNestedNode(n) && n.childDiagramId === diagramId);
    const portIds = new Set(blocks.flatMap((b) => b.ports.filter((p) => p.innerNodeId && gone.has(p.innerNodeId)).map((p) => p.id)));
    if (portIds.size === 0) continue;
    next = updateDiagram(next, parent.id, (d) => ({
      ...d,
      nodes: d.nodes.map((n) => (isNestedNode(n) && n.childDiagramId === diagramId ? { ...n, ports: n.ports.filter((p) => !portIds.has(p.id)) } : n)),
      edges: d.edges.filter((e) => !(e.source.portId && portIds.has(e.source.portId)) && !(e.target.portId && portIds.has(e.target.portId))),
    }));
  }
  return next;
}

