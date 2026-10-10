// Pure doc-transform functions for the nesting feature, which keep the
// invariants validate.ts checks (README, "How a document is put together"). Kept separate from actions.ts because nesting mutations touch
// multiple diagrams at once (parent + child), unlike the single-diagram actions there.
import { nanoid } from "nanoid";
import { addNode } from "./actions";
import { createDefaultLayers } from "./layers";
import type { DiagramDocument, DEdge, Diagram, DNode, EdgeEnd, NestedNode, Port, RichLabel } from "./types";

function updateDiagram(doc: DiagramDocument, diagramId: string, fn: (diagram: Diagram) => Diagram): DiagramDocument {
  const diagram = doc.diagrams[diagramId];
  if (!diagram) return doc;
  return {
    ...doc,
    meta: { ...doc.meta, modified: new Date().toISOString() },
    diagrams: { ...doc.diagrams, [diagramId]: fn(diagram) },
  };
}

function isNested(node: DNode): node is NestedNode {
  return node.type === "nested";
}

export interface AddNestedNodeResult {
  doc: DiagramDocument;
  nestedNodeId: string;
  childDiagramId: string;
}

export function addNestedNode(
  doc: DiagramDocument,
  diagramId: string,
  position: { x: number; y: number },
  size: { w: number; h: number },
  title = "New Diagram",
): AddNestedNodeResult {
  const childDiagramId = nanoid();
  const nestedNodeId = nanoid();
  const childDiagram: Diagram = { id: childDiagramId, title, nodes: [], edges: [], layers: createDefaultLayers() };
  const node: Omit<NestedNode, "z"> = {
    id: nestedNodeId,
    type: "nested",
    position,
    size,
    style: {},
    childDiagramId,
    // No placeholder summary: the collapsed view derives "Empty" live from the child's actual
    // contents (see nesting/NestedNode.tsx), so a stored string can't go stale and leave a box
    // labelled "Empty" sitting on top of a diagram full of shapes. `summary` is now purely an
    // optional author-written subtitle.
    collapsed: { icons: [] },
    ports: [],
  };

  let next: DiagramDocument = { ...doc, diagrams: { ...doc.diagrams, [childDiagramId]: childDiagram } };
  next = addNode(next, diagramId, node);

  return { doc: next, nestedNodeId, childDiagramId };
}

const CHILD_MARGIN = 40;
const DEFAULT_NESTED_SIZE = { w: 200, h: 140 };

export interface ConvertToNestedResult {
  doc: DiagramDocument;
  nestedNodeId: string;
  childDiagramId: string;
}

// Moves the selected nodes (and any edges wholly inside the selection) into a new child
// diagram, replaces them in place with a NestedNode, and auto-creates a port for every edge
// that crossed the selection boundary — incoming edges get left-side ports, outgoing edges
// get right-side ports, matching the "incoming left, outgoing right" ghost-link convention.
export function convertSelectionToNested(
  doc: DiagramDocument,
  diagramId: string,
  nodeIds: string[],
  title = "New Diagram",
): ConvertToNestedResult | null {
  const diagram = doc.diagrams[diagramId];
  if (!diagram || nodeIds.length === 0) return null;

  const selectedSet = new Set(nodeIds);
  const selectedNodes = diagram.nodes.filter((n) => selectedSet.has(n.id));
  if (selectedNodes.length === 0) return null;

  const minX = Math.min(...selectedNodes.map((n) => n.position.x));
  const minY = Math.min(...selectedNodes.map((n) => n.position.y));
  const offsetX = CHILD_MARGIN - minX;
  const offsetY = CHILD_MARGIN - minY;
  const shift = (p: { x: number; y: number }) => ({ x: p.x + offsetX, y: p.y + offsetY });

  // layerId is dropped rather than carried over: the child diagram has its own fresh layer set,
  // and the moved nodes' old layerId (from the parent) wouldn't match anything in it.
  const childNodes: DNode[] = selectedNodes.map(
    (n, i) => ({ ...n, position: shift(n.position), z: i + 1, layerId: undefined }) as DNode,
  );

  // A free end (a line drawn from the Lines section) is attached to nothing, so it is never "in"
  // the selection: a line from a selected shape to open canvas becomes a boundary edge with a port.
  const inSel = (end: EdgeEnd) => !!end.nodeId && selectedSet.has(end.nodeId);
  const internalEdges = diagram.edges.filter((e) => inSel(e.source) && inSel(e.target));
  const childEdges: DEdge[] = internalEdges.map((e) => ({ ...e, waypoints: e.waypoints?.map(shift), layerId: undefined }));

  const boundaryEdges = diagram.edges.filter(
    (e) => inSel(e.source) !== inSel(e.target),
  );
  const incoming = boundaryEdges.filter((e) => inSel(e.target)); // external -> selection
  const outgoing = boundaryEdges.filter((e) => inSel(e.source)); // selection -> external

  const ports: Port[] = [
    ...incoming.map((e, i) => ({
      id: nanoid(),
      side: "left" as const,
      offset: (i + 1) / (incoming.length + 1),
      innerNodeId: e.target.nodeId!,
    })),
    ...outgoing.map((e, i) => ({
      id: nanoid(),
      side: "right" as const,
      offset: (i + 1) / (outgoing.length + 1),
      innerNodeId: e.source.nodeId!,
    })),
  ];

  const edgeToPort = new Map<string, string>();
  incoming.forEach((e, i) => edgeToPort.set(e.id, ports[i].id));
  outgoing.forEach((e, i) => edgeToPort.set(e.id, ports[incoming.length + i].id));

  const nestedNodeId = nanoid();
  const childDiagramId = nanoid();

  const rewrittenBoundaryEdges: DEdge[] = boundaryEdges.map((e) => {
    const portId = edgeToPort.get(e.id);
    if (inSel(e.target)) {
      return { ...e, target: { nodeId: nestedNodeId, portId } };
    }
    return { ...e, source: { nodeId: nestedNodeId, portId } };
  });

  const nestedNode: Omit<NestedNode, "z"> = {
    id: nestedNodeId,
    type: "nested",
    position: { x: minX, y: minY },
    size: DEFAULT_NESTED_SIZE,
    style: {},
    childDiagramId,
    // The same as a new block from the sidebar: no icons, so the box shows the live miniature of
    // what is inside, and no summary, which a "2 shapes" placeholder would make wrong the moment
    // a third shape went in (D113). The name is the child's title, so box and breadcrumb agree.
    label: { text: title },
    collapsed: { icons: [] },
    ports,
  };

  const childDiagram: Diagram = { id: childDiagramId, title, nodes: childNodes, edges: childEdges, layers: createDefaultLayers() };

  const internalEdgeIds = new Set(internalEdges.map((e) => e.id));
  const boundaryEdgeIds = new Set(boundaryEdges.map((e) => e.id));
  const remainingNodes = diagram.nodes.filter((n) => !selectedSet.has(n.id));
  const remainingEdges = diagram.edges.filter((e) => !internalEdgeIds.has(e.id) && !boundaryEdgeIds.has(e.id));

  let next: DiagramDocument = {
    ...doc,
    meta: { ...doc.meta, modified: new Date().toISOString() },
    diagrams: {
      ...doc.diagrams,
      [childDiagramId]: childDiagram,
      [diagramId]: { ...diagram, nodes: remainingNodes, edges: [...remainingEdges, ...rewrittenBoundaryEdges] },
    },
  };
  next = addNode(next, diagramId, nestedNode);

  return { doc: next, nestedNodeId, childDiagramId };
}

// Renames a nested node *and* the diagram it points at, in one undo step: the box's caption
// and the breadcrumb are two views of the same thing, so letting them drift apart would be a
// bug rather than a feature.
export function renameNestedNode(
  doc: DiagramDocument,
  diagramId: string,
  nestedNodeId: string,
  label: RichLabel,
): DiagramDocument {
  const parent = doc.diagrams[diagramId];
  const node = parent?.nodes.find((n) => n.id === nestedNodeId);
  if (!node || !isNested(node)) return doc;

  const withLabel = updateDiagram(doc, diagramId, (d) => ({
    ...d,
    nodes: d.nodes.map((n) => (n.id === nestedNodeId ? { ...n, label } : n)),
  }));

  const child = withLabel.diagrams[node.childDiagramId];
  if (!child || !label.text.trim()) return withLabel;
  return {
    ...withLabel,
    diagrams: { ...withLabel.diagrams, [child.id]: { ...child, title: label.text } },
  };
}

export function setNestedCollapsed(
  doc: DiagramDocument,
  diagramId: string,
  nestedNodeId: string,
  patch: Partial<NestedNode["collapsed"]>,
): DiagramDocument {
  return updateDiagram(doc, diagramId, (diagram) => ({
    ...diagram,
    nodes: diagram.nodes.map((n) =>
      n.id === nestedNodeId && isNested(n) ? { ...n, collapsed: { ...n.collapsed, ...patch } } : n,
    ),
  }));
}

// Ports on one side are spread evenly along it, the same 1/(n+1), 2/(n+1), ... spacing
// convertSelectionToNested lays out in one shot — re-run after adding one so a port appended
// later doesn't land on top of an existing one.
function respaceSide(ports: Port[], side: Port["side"]): Port[] {
  const onSide = ports.filter((p) => p.side === side);
  let i = 0;
  return ports.map((p) => (p.side === side ? { ...p, offset: ++i / (onSide.length + 1) } : p));
}

// Dropping an edge on a nested node's *body* (its generic
// hover handles) rather than on an existing port dot used to produce a plain node-level edge
// with no portId at all — which the ghost-link overlay then had no way to show inside the
// child, so the connection silently vanished from the author's point of view (the bug behind
// this work item). Every external edge touching a nested node now gets a real port, created on
// the side it was dropped on. The port starts unmapped: the child usually has nothing to map
// to yet, and guessing an inner node would be wrong more often than right.
export function portCarriesEdge(diagram: Diagram, nodeId: string, portId: string, exceptEdgeId?: string): boolean {
  return diagram.edges.some(
    (e) =>
      e.id !== exceptEdgeId &&
      ((e.source.nodeId === nodeId && e.source.portId === portId) ||
        (e.target.nodeId === nodeId && e.target.portId === portId)),
  );
}

export function ensurePortForConnection(
  doc: DiagramDocument,
  diagramId: string,
  nodeId: string,
  existingPortId: string | undefined,
  handleId: string,
  direction: "in" | "out",
  /** The edge being re-pointed, so reconnecting one onto its own port isn't read as a clash. */
  exceptEdgeId?: string,
): { doc: DiagramDocument; portId: string | undefined } {
  const diagram = doc.diagrams[diagramId];
  const node = diagram?.nodes.find((n) => n.id === nodeId);
  if (!node || !isNested(node)) return { doc, portId: existingPortId };

  // Reuse the targeted port only while it is still free. Aiming at a port the author created
  // themselves and attaching to it is the intended gesture (a port is created when
  // the author didn't aim at an existing port dot) — but a port that already carries an edge
  // must not silently take a second one.
  //
  // It happened constantly, because React Flow snaps a connection to any handle within its
  // connectionRadius: dropping a second edge merely NEAR the first one's dot handed both edges
  // the same portId. Inside the child that produced one ghost where there should have been
  // two, stacked at identical coordinates so the earlier one was invisible, and mapping "one"
  // of them moved both — the whole connection appeared to jump to wherever you last dropped it
  // and its predecessor to vanish. One port per external edge is what makes each crossing
  // separately visible, mappable and detachable.
  const targeted = existingPortId ? node.ports.find((p) => p.id === existingPortId) : undefined;
  if (existingPortId && !portCarriesEdge(diagram, nodeId, existingPortId, exceptEdgeId)) {
    return { doc, portId: existingPortId };
  }

  // Handle ids are "top"/"right"/"bottom"/"left" plus corners like "top-left" (see
  // canvas/ConnectionHandles.tsx); the leading token is the side in both shapes. When we are
  // superseding an occupied port the handle id is "port:<id>" and carries no side, so inherit
  // the side of the port that was aimed at — that is where the author pointed.
  const token = handleId.split("-")[0];
  const side: Port["side"] =
    token === "top" || token === "bottom" || token === "left" || token === "right"
      ? token
      : (targeted?.side ??
        (direction === "in" ? "left" : "right"));

  const portId = nanoid();
  const label = `${direction}-${node.ports.filter((p) => p.label?.startsWith(`${direction}-`)).length + 1}`;
  const next = updateDiagram(doc, diagramId, (d) => ({
    ...d,
    nodes: d.nodes.map((n) =>
      n.id === nodeId && isNested(n)
        ? { ...n, ports: respaceSide([...n.ports, { id: portId, side, offset: 0.5, label }], side) }
        : n,
    ),
  }));
  return { doc: next, portId };
}

// Points an existing port at an inner node — the "link this waiting connection here" step, and
// also how a port orphaned by cascadePortCleanup gets re-attached.
export function mapPort(
  doc: DiagramDocument,
  parentDiagramId: string,
  nestedNodeId: string,
  portId: string,
  innerNodeId: string,
): DiagramDocument {
  return updatePort(doc, parentDiagramId, nestedNodeId, portId, { innerNodeId });
}

export function addPort(doc: DiagramDocument, diagramId: string, nestedNodeId: string, port: Omit<Port, "id">): DiagramDocument {
  return updateDiagram(doc, diagramId, (diagram) => ({
    ...diagram,
    nodes: diagram.nodes.map((n) =>
      n.id === nestedNodeId && isNested(n) ? { ...n, ports: [...n.ports, { ...port, id: nanoid() }] } : n,
    ),
  }));
}

export function updatePort(
  doc: DiagramDocument,
  diagramId: string,
  nestedNodeId: string,
  portId: string,
  patch: Partial<Omit<Port, "id">>,
): DiagramDocument {
  return updateDiagram(doc, diagramId, (diagram) => ({
    ...diagram,
    nodes: diagram.nodes.map((n) =>
      n.id === nestedNodeId && isNested(n)
        ? { ...n, ports: n.ports.map((p) => (p.id === portId ? { ...p, ...patch } : p)) }
        : n,
    ),
  }));
}

// Removing a port also clears it from any edge endpoint that referenced it, degrading that
// edge to a plain node-level connection rather than leaving a dangling portId.
//
// "Node-level" means a real handle: the side the port was on. Clearing only `portId` left the
// edge's handle string as "port:<removed>", which React Flow cannot find, so the edge vanished
// from the canvas while staying in the file and in every export.
export function removePort(doc: DiagramDocument, diagramId: string, nestedNodeId: string, portId: string): DiagramDocument {
  return updateDiagram(doc, diagramId, (diagram) => {
    const owner = diagram.nodes.find((n) => n.id === nestedNodeId);
    const side = owner && isNested(owner) ? owner.ports.find((p) => p.id === portId)?.side : undefined;
    return {
      ...diagram,
      nodes: diagram.nodes.map((n) =>
        n.id === nestedNodeId && isNested(n) ? { ...n, ports: n.ports.filter((p) => p.id !== portId) } : n,
      ),
      edges: diagram.edges.map((e) => {
        const atSource = e.source.nodeId === nestedNodeId && e.source.portId === portId;
        const atTarget = e.target.nodeId === nestedNodeId && e.target.portId === portId;
        if (!atSource && !atTarget) return e;
        const style = { ...e.style };
        for (const [hit, key] of [
          [atSource, "sourceHandle"],
          [atTarget, "targetHandle"],
        ] as const) {
          if (!hit) continue;
          if (side) style[key] = side;
          else delete style[key];
        }
        return {
          ...e,
          source: atSource ? { ...e.source, portId: undefined } : e.source,
          target: atTarget ? { ...e.target, portId: undefined } : e.target,
          style,
        };
      }),
    };
  });
}

// All descendant diagram ids reachable from rootDiagramId via nested nodes (not including
// rootDiagramId itself). Used to delete a nested node's whole subtree.
export function collectDescendantDiagramIds(doc: DiagramDocument, rootDiagramId: string): string[] {
  const result: string[] = [];
  const visit = (id: string) => {
    const diagram = doc.diagrams[id];
    if (!diagram) return;
    for (const node of diagram.nodes) {
      if (isNested(node)) {
        result.push(node.childDiagramId);
        visit(node.childDiagramId);
      }
    }
  };
  visit(rootDiagramId);
  return result;
}

// Finds any nested nodes (in any diagram) whose childDiagramId is childDiagramId, and *unmaps*
// (rather than deletes) ports pointing at inner nodes that no longer exist. Call after deleting
// nodes from childDiagramId to keep the DANGLING_PORT invariant from validate.ts satisfied.
//
// Unmapping, not removal, since formatVersion 2: deleting the port outright also silently
// degraded the parent's external edge to a plain node-level connection, so the author lost the
// link with no indication anything had happened — the same invisible-failure class this
// release set out to fix. Keeping the port (now unmapped) preserves the edge and surfaces it
// inside the child as an amber "waiting to be linked" ghost, which is the non-modal reading of
// Deleting an inner node a port maps to: keep the port waiting (unmapped) or remove it.
export function cascadePortCleanup(doc: DiagramDocument, childDiagramId: string, deletedInnerNodeIds: string[]): DiagramDocument {
  if (deletedInnerNodeIds.length === 0) return doc;
  const deleted = new Set(deletedInnerNodeIds);
  let next = doc;

  for (const diagram of Object.values(doc.diagrams)) {
    for (const node of diagram.nodes) {
      if (!isNested(node) || node.childDiagramId !== childDiagramId) continue;
      const orphanedPortIds = new Set(
        node.ports.filter((p) => p.innerNodeId !== undefined && deleted.has(p.innerNodeId)).map((p) => p.id),
      );
      if (orphanedPortIds.size === 0) continue;

      next = updateDiagram(next, diagram.id, (d) => ({
        ...d,
        nodes: d.nodes.map((n) =>
          n.id === node.id && isNested(n)
            ? { ...n, ports: n.ports.map((p) => (orphanedPortIds.has(p.id) ? { ...p, innerNodeId: undefined } : p)) }
            : n,
        ),
      }));
    }
  }

  return next;
}

// Deletes the given nodes/edges from diagramId — a removed nested node's whole subtree with it —
// and cascades port cleanup to any ancestor whose port mapped into diagramId. The store asks
// first when that would take a level's contents or a parent's links (model/deletion.ts, D138).
export function removeSelectionCascading(
  doc: DiagramDocument,
  diagramId: string,
  nodeIds: string[],
  edgeIds: string[],
  removeSelection: (doc: DiagramDocument, diagramId: string, nodeIds: string[], edgeIds: string[]) => DiagramDocument,
): DiagramDocument {
  const diagram = doc.diagrams[diagramId];
  if (!diagram) return doc;

  const diagramIdsToDelete = new Set<string>();
  for (const node of diagram.nodes) {
    if (nodeIds.includes(node.id) && isNested(node)) {
      diagramIdsToDelete.add(node.childDiagramId);
      for (const d of collectDescendantDiagramIds(doc, node.childDiagramId)) diagramIdsToDelete.add(d);
    }
  }

  let next = removeSelection(doc, diagramId, nodeIds, edgeIds);

  if (diagramIdsToDelete.size > 0) {
    const remainingDiagrams = { ...next.diagrams };
    for (const id of diagramIdsToDelete) delete remainingDiagrams[id];
    next = {
      ...next,
      diagrams: remainingDiagrams,
      rootDiagramIds: next.rootDiagramIds.filter((id) => !diagramIdsToDelete.has(id)),
    };
  }

  next = cascadePortCleanup(next, diagramId, nodeIds);

  return next;
}

// BFS from every root diagram, through nested nodes, for a path of diagram ids leading to
// targetDiagramId (inclusive). Used for breadcrumb navigation and to relocate the user after
// an undo/redo that changed a diagram other than the one currently in view.
export function findDiagramPath(doc: DiagramDocument, targetDiagramId: string): string[] | null {
  for (const rootId of doc.rootDiagramIds) {
    const path = findPathFrom(doc, rootId, targetDiagramId, new Set());
    if (path) return path;
  }
  return null;
}

function findPathFrom(doc: DiagramDocument, currentId: string, targetId: string, visited: Set<string>): string[] | null {
  if (currentId === targetId) return [currentId];
  if (visited.has(currentId)) return null;
  visited.add(currentId);
  const diagram = doc.diagrams[currentId];
  if (!diagram) return null;
  for (const node of diagram.nodes) {
    if (isNested(node)) {
      const sub = findPathFrom(doc, node.childDiagramId, targetId, visited);
      if (sub) return [currentId, ...sub];
    }
  }
  return null;
}

/**
 * Gives every external edge its own port, splitting any port that several edges share.
 *
 * Documents written before `ensurePortForConnection` refused to hand a busy port a second edge
 * can contain them, and the state is unusable rather than merely untidy: inside the child, each
 * of those edges produces a ghost at identical coordinates, so all but the last are hidden
 * underneath, and mapping or detaching "one" of them moves every edge on that port at once.
 *
 * The repair is additive and loses nothing — the first edge keeps the original port, each
 * extra edge gets a new port on the same side carrying the same `innerNodeId`, so a mapping
 * the author already made survives and the picture inside the child is unchanged apart from
 * the hidden connections becoming visible. Run on open (see file/documentFormat.ts) rather
 * than as a format migration: no schema changed, so no `formatVersion` bump is warranted.
 */
export function splitSharedPorts(doc: DiagramDocument): DiagramDocument {
  let changed = false;
  const diagrams: Record<string, Diagram> = {};

  for (const [diagramId, diagram] of Object.entries(doc.diagrams)) {
    // portId -> the edge ends using it, in document order. Only ends that name a nested node
    // in THIS diagram count; portIds are unique per node, so key by both.
    const usage = new Map<string, { edgeId: string; end: "source" | "target" }[]>();
    const nestedIds = new Set(diagram.nodes.filter(isNested).map((n) => n.id));

    for (const edge of diagram.edges) {
      for (const end of ["source", "target"] as const) {
        const { nodeId, portId } = edge[end];
        if (!portId || !nodeId || !nestedIds.has(nodeId)) continue;
        const key = `${nodeId}\u0000${portId}`;
        const list = usage.get(key) ?? [];
        list.push({ edgeId: edge.id, end });
        usage.set(key, list);
      }
    }

    // edgeId -> end -> replacement portId
    const reassign = new Map<string, string>();
    const addedByNode = new Map<string, Port[]>();

    for (const [key, uses] of usage) {
      if (uses.length < 2) continue;
      const [nodeId, portId] = key.split("\u0000");
      const node = diagram.nodes.find((n) => n.id === nodeId);
      if (!node || !isNested(node)) continue;
      const original = node.ports.find((p) => p.id === portId);
      if (!original) continue;

      // uses[0] keeps the original port; every later one gets a clone of it.
      for (const use of uses.slice(1)) {
        const clone: Port = { ...original, id: nanoid(), label: original.label ? `${original.label}-b` : undefined };
        reassign.set(`${use.edgeId}\u0000${use.end}`, clone.id);
        addedByNode.set(nodeId, [...(addedByNode.get(nodeId) ?? []), clone]);
        changed = true;
      }
    }

    if (addedByNode.size === 0) {
      diagrams[diagramId] = diagram;
      continue;
    }

    diagrams[diagramId] = {
      ...diagram,
      nodes: diagram.nodes.map((n) => {
        const added = addedByNode.get(n.id);
        if (!added || !isNested(n)) return n;
        let ports = [...n.ports, ...added];
        // Re-space each side that gained a port so the new dots don't sit on the old one.
        for (const side of new Set(added.map((p) => p.side))) ports = respaceSide(ports, side);
        return { ...n, ports };
      }),
      edges: diagram.edges.map((e) => {
        const source = reassign.get(`${e.id}\u0000source`);
        const target = reassign.get(`${e.id}\u0000target`);
        if (!source && !target) return e;
        return {
          ...e,
          source: source ? { ...e.source, portId: source } : e.source,
          target: target ? { ...e.target, portId: target } : e.target,
        };
      }),
    };
  }

  return changed ? { ...doc, diagrams } : doc;
}
