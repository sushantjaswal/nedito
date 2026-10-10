// Flat groups (CLAUDE.md: "a group is NOT a nested node; groups are flat draw.io-style
// groups"). A GroupNode is a sibling of its children in the same diagram.nodes array — it
// just carries a bounding-box position/size and a childIds list. Children keep their own
// absolute positions in the model at all times; DiagramCanvas.tsx's React Flow adapter layer
// is what converts to/from parent-relative coordinates for rendering and dragging.
import { nanoid } from "nanoid";
import type { DiagramDocument, Diagram, DNode, GroupNode } from "./types";

const GROUP_PADDING = 20;

export function findContainingGroup(diagram: Diagram, nodeId: string): GroupNode | undefined {
  return diagram.nodes.find((n): n is GroupNode => n.type === "group" && n.childIds.includes(nodeId));
}

export interface GroupResult {
  doc: DiagramDocument;
  groupId: string;
}

export function groupNodes(doc: DiagramDocument, diagramId: string, nodeIds: string[]): GroupResult | null {
  const diagram = doc.diagrams[diagramId];
  if (!diagram) return null;

  // Grouping a node that's already in a group re-groups it under the new group (the old
  // group loses that child, and is dropped entirely if that empties it) rather than nesting
  // groups inside groups — flat groups stay flat.
  const targets = diagram.nodes.filter((n) => nodeIds.includes(n.id) && n.type !== "group");
  if (targets.length < 2) return null;

  const minX = Math.min(...targets.map((n) => n.position.x));
  const minY = Math.min(...targets.map((n) => n.position.y));
  const maxX = Math.max(...targets.map((n) => n.position.x + n.size.w));
  const maxY = Math.max(...targets.map((n) => n.position.y + n.size.h));
  const minChildZ = Math.min(...targets.map((n) => n.z));

  const groupId = nanoid();
  const targetIds = new Set(targets.map((n) => n.id));
  const group: GroupNode = {
    id: groupId,
    type: "group",
    position: { x: minX - GROUP_PADDING, y: minY - GROUP_PADDING },
    size: { w: maxX - minX + GROUP_PADDING * 2, h: maxY - minY + GROUP_PADDING * 2 },
    z: minChildZ - 1,
    style: {},
    childIds: targets.map((n) => n.id),
  };

  // Drop the grouped nodes from any group they previously belonged to.
  const nextNodes: DNode[] = diagram.nodes.map((n) =>
    n.type === "group" ? { ...n, childIds: n.childIds.filter((id) => !targetIds.has(id)) } : n,
  );
  const surviving = nextNodes.filter((n) => n.type !== "group" || n.childIds.length >= 2);
  surviving.push(group);

  const nextDiagram: Diagram = { ...diagram, nodes: surviving };
  return {
    doc: {
      ...doc,
      meta: { ...doc.meta, modified: new Date().toISOString() },
      diagrams: { ...doc.diagrams, [diagramId]: nextDiagram },
    },
    groupId,
  };
}

export function ungroupNodes(doc: DiagramDocument, diagramId: string, groupId: string): DiagramDocument {
  const diagram = doc.diagrams[diagramId];
  if (!diagram) return doc;
  const group = diagram.nodes.find((n) => n.id === groupId && n.type === "group");
  if (!group) return doc;

  const nextDiagram: Diagram = { ...diagram, nodes: diagram.nodes.filter((n) => n.id !== groupId) };
  return {
    ...doc,
    meta: { ...doc.meta, modified: new Date().toISOString() },
    diagrams: { ...doc.diagrams, [diagramId]: nextDiagram },
  };
}

// Called when nodes are deleted: strips them out of any group's childIds, and drops any
// group that a deletion leaves with fewer than 2 children (a 1-child or 0-child "group"
// isn't meaningfully a group anymore).
export function cascadeGroupCleanup(diagram: Diagram, removedNodeIds: string[]): Diagram {
  const removed = new Set(removedNodeIds);
  const nextNodes = diagram.nodes
    .map((n) => (n.type === "group" ? { ...n, childIds: n.childIds.filter((id) => !removed.has(id)) } : n))
    .filter((n) => n.type !== "group" || n.childIds.length >= 2);
  return { ...diagram, nodes: nextNodes };
}
