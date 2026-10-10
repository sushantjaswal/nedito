// Pure computation for ghost links: read-only markers inside a child diagram showing edges
// that cross the nesting boundary in the parent, derived from the parent's port mappings.
import type { DiagramDocument, NestedNode, Port } from "../model/types";

export interface GhostLinkInfo {
  id: string;
  direction: "incoming" | "outgoing";
  label: string;
  /**
   * The node in *this* diagram the ghost is anchored to, or undefined when the port hasn't been
   * mapped to anything yet (see model/types.ts's Port). An undefined value is the whole point
   * of the unmapped state: the connection is real and worth showing, it just doesn't know where
   * to land, so the overlay renders it with a loose endpoint the author can drag onto a node.
   */
  innerNodeId?: string;
  /** Port this ghost came from, so the UI can map it once the author picks a target. */
  portId: string;
  /**
   * Which side of the inner node the ghost attaches to. Comes from the port, not from the
   * connection's direction: an incoming connection isn't necessarily meant to arrive on the
   * left, and forcing that made every ghost pile onto one side of the shape no matter where
   * the author dropped it.
   */
  side: Port["side"];
  // Ancestor labels beyond the immediate parent (nearest first), found by checking whether the
  // immediate parent's "other" node is itself the inner-node mapping of a port one level further
  // out, and so on. Empty when the connection doesn't continue past the immediate parent.
  chain: string[];
  // True only when the walk above successfully continued all the way to navStack[0] (the root
  // diagram) rather than stopping early because a further level had no matching port/edge.
  reachesRoot: boolean;
}

// Falls back to a readable placeholder rather than the node's id: ids are nanoids, and
// "⇠ -W0dQPVrNOh5Ph9oNfzQo · parent" tells the author nothing about what's on the other side of
// the boundary.
function nodeLabel(node: DiagramDocument["diagrams"][string]["nodes"][number]): string {
  if (node.type === "nested") return node.collapsed.summary || "Nested Block";
  if (node.type === "group") return node.label?.text || "Group";
  return node.label?.text || "Unlabeled shape";
}

// Continues a ghost link's story past the immediate parent: at each further-out level, the node
// this connection landed on (`otherNodeId`, living in the diagram at `childDiagramId`) is only
// part of a longer chain if THAT diagram is itself opened via a nested node one level further
// out, with a port mapped to that same node. Walks outward from `startLevel` (the immediate
// parent's index in navStack) toward the root, stopping the moment a level doesn't continue the
// story — most connections simply won't chain further, which is expected, not an error.
function walkAncestorChain(
  doc: DiagramDocument,
  navStack: string[],
  startLevel: number,
  startOtherNodeId: string,
  startChildDiagramId: string,
): { chain: string[]; reachesRoot: boolean } {
  const chain: string[] = [];
  let level = startLevel;
  let otherNodeId = startOtherNodeId;
  let childDiagramId = startChildDiagramId;
  let reachesRoot = false;

  while (level > 0) {
    const grandparentDiagramId = navStack[level - 1];
    const grandparentDiagram = doc.diagrams[grandparentDiagramId];
    if (!grandparentDiagram) break;

    const outerNestedNode = grandparentDiagram.nodes.find(
      (n): n is NestedNode => n.type === "nested" && n.childDiagramId === childDiagramId,
    );
    if (!outerNestedNode) break;

    const port = outerNestedNode.ports.find((p) => p.innerNodeId === otherNodeId);
    if (!port) break;

    const edge = grandparentDiagram.edges.find(
      (e) =>
        (e.target.nodeId === outerNestedNode.id && e.target.portId === port.id) ||
        (e.source.nodeId === outerNestedNode.id && e.source.portId === port.id),
    );
    if (!edge) break;

    const targetsPort = edge.target.nodeId === outerNestedNode.id && edge.target.portId === port.id;
    const otherEnd = targetsPort ? edge.source : edge.target;
    const otherNode = grandparentDiagram.nodes.find((n) => n.id === otherEnd.nodeId);
    if (!otherNode) break;

    chain.push(nodeLabel(otherNode));
    otherNodeId = otherNode.id;
    childDiagramId = grandparentDiagramId;
    level -= 1;
    if (level === 0) reachesRoot = true;
  }

  return { chain, reachesRoot };
}

export function computeGhostLinks(doc: DiagramDocument, navStack: string[]): GhostLinkInfo[] {
  if (navStack.length < 2) return [];
  const currentDiagramId = navStack[navStack.length - 1];
  const parentLevel = navStack.length - 2;
  const parentDiagramId = navStack[parentLevel];
  const parentDiagram = doc.diagrams[parentDiagramId];
  if (!parentDiagram) return [];

  const nestedNode = parentDiagram.nodes.find(
    (n): n is NestedNode => n.type === "nested" && n.childDiagramId === currentDiagramId,
  );
  if (!nestedNode) return [];

  const results: GhostLinkInfo[] = [];
  for (const edge of parentDiagram.edges) {
    const targetsPort = edge.target.nodeId === nestedNode.id && !!edge.target.portId;
    const sourcesPort = edge.source.nodeId === nestedNode.id && !!edge.source.portId;
    if (!targetsPort && !sourcesPort) continue;

    const portId = targetsPort ? edge.target.portId : edge.source.portId;
    const port = nestedNode.ports.find((p) => p.id === portId);
    if (!port) continue;

    const otherEnd = targetsPort ? edge.source : edge.target;
    const otherNode = parentDiagram.nodes.find((n) => n.id === otherEnd.nodeId);
    // A free end (a line from the Lines section) has nothing to name.
    const label = otherNode ? nodeLabel(otherNode) : (otherEnd.nodeId ?? "Unconnected line");
    const { chain, reachesRoot } = otherNode
      ? walkAncestorChain(doc, navStack, parentLevel, otherNode.id, parentDiagramId)
      : { chain: [], reachesRoot: false };

    results.push({
      id: edge.id,
      direction: targetsPort ? "incoming" : "outgoing",
      label,
      innerNodeId: port.innerNodeId,
      portId: port.id,
      side: port.side,
      chain,
      reachesRoot,
    });
  }
  return results;
}
