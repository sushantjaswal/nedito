// Auto-layout: give a level tidy positions without moving anything by hand.
//
// draw.io has Arrange > Layout, which runs one of several algorithms over the whole page and
// leaves groups alone. Nedito's own take differs in three ways, each because of something only
// this model knows:
//
//   - **Groups lay out from the inside.** A group here is a flat box with a `childIds` list
//     (model/groups.ts), so a group becomes a compound node: its members are placed inside it and
//     the box is resized to fit what they became. Shapes that belong together stay together.
//   - **A Nested Block's ports are honoured where they are.** A port has a side and an offset
//     along it, and lines from this level arrive there. Those are handed to the engine as fixed
//     port positions, so the layout puts the shape that feeds a left-side port on the left,
//     instead of routing a line all the way around the box.
//   - **It can run down every level.** A nested document is the thing that is actually tedious to
//     tidy by hand, because the work is per level and there can be any number of them.
//
// The layout engine is ELK (Eclipse Layout Kernel) with its `layered` algorithm. It is loaded on
// first use (model/elkEngine.ts), never in the main bundle.
//
// This module is pure. Building the graph and applying the result are separate from the one async
// call in between, so both halves are testable without a layout engine, and the whole thing is a
// single document update: one undo entry, whatever it moved and however many levels deep.
import type { ElkExtendedEdge, ElkNode } from "elkjs/lib/elk-api";
import type { DEdge, Diagram, DiagramDocument, DNode, GroupNode, NestedNode, Port } from "./types";
import { MAX_NESTING_DEPTH } from "./validate";

/** Which way the flow of the diagram runs. */
export type LayoutDirection = "right" | "down";

export interface LayoutOptions {
  direction: LayoutDirection;
  /**
   * Lay out only these nodes, leaving the rest of the level where it is. Omitted: the whole level.
   * A selection is widened to whole groups, because half a group cannot be placed sensibly.
   */
  nodeIds?: string[];
  /**
   * Drop the waypoints of every line that touches a shape which moved, so the line takes its own
   * route through the new positions instead of bending through the places the old ones were.
   */
  relayoutLines?: boolean;
  /** Round the result to this grid, when snapping is on. Omitted: exact positions. */
  snap?: number;
}

/**
 * What the engine gives back: positions and sizes, nested the way the graph was. Spelled out
 * structurally rather than taken from the engine's own types, which describe the result loosely,
 * so this module states exactly the shape it reads.
 */
export interface LaidOutNode {
  id?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  children?: LaidOutNode[];
}

/** Just enough of the engine's surface for this module; the real one arrives from elkEngine.ts. */
export interface LayoutEngine {
  layout(graph: ElkNode): Promise<LaidOutNode>;
}

const GROUP_PADDING = 20;
/** Room above a group's members for the title a group may carry. */
const GROUP_PADDING_TOP = 24;
const SPACING_NODE = 50;
const SPACING_LAYER = 70;

function elkOptions(direction: LayoutDirection): Record<string, string> {
  return {
    "elk.algorithm": "layered",
    "elk.direction": direction === "right" ? "RIGHT" : "DOWN",
    "elk.spacing.nodeNode": String(SPACING_NODE),
    "elk.layered.spacing.nodeNodeBetweenLayers": String(SPACING_LAYER),
    "elk.spacing.edgeNode": "30",
    "elk.spacing.componentComponent": String(SPACING_NODE),
    // Lay the hierarchy out as one graph rather than each group on its own, so a line that
    // leaves one group and enters another still decides where those groups sit. Without this,
    // groups are placed as opaque boxes and the flow between them is lost.
    "elk.hierarchyHandling": "INCLUDE_CHILDREN",
    // Keeps what is drawn where it was put, as far as the algorithm allows: with no reason to
    // prefer one order, the order already on the canvas wins, so tidying up a level the author
    // has arranged doesn't shuffle it.
    "elk.layered.considerModelOrder.strategy": "NODES_AND_EDGES",
  };
}

/**
 * Laying out the whole level covers the shapes that are connected to something, and leaves the
 * rest where they are. A title, a subtitle, a legend's swatches: a layout has nothing to say about
 * where they belong, and a tidy-up that scatters the furniture of a diagram is worse than none —
 * found by running this over a template whose title and key moved into the middle of the flow.
 * A level where nothing at all is connected is laid out whole, since there is no furniture to tell
 * apart from the diagram.
 */
function wholeLevelTargets(diagram: Diagram): Set<string> {
  const connected = new Set<string>();
  for (const edge of diagram.edges) {
    if (edge.source.nodeId) connected.add(edge.source.nodeId);
    if (edge.target.nodeId) connected.add(edge.target.nodeId);
  }
  const ids = new Set(diagram.nodes.filter((n) => connected.has(n.id)).map((n) => n.id));
  return ids.size > 0 ? ids : new Set(diagram.nodes.map((n) => n.id));
}

/**
 * The nodes a layout actually covers: every group any of them belongs to, and every member of
 * those groups. Selecting one shape inside a group tidies the group it lives in. A selection is
 * taken as given — those shapes were chosen, connected or not; without one, the rule above
 * applies.
 */
export function layoutTargets(diagram: Diagram, nodeIds?: string[]): Set<string> {
  const ids = nodeIds ? new Set(nodeIds) : wholeLevelTargets(diagram);
  for (const node of diagram.nodes) {
    if (node.type !== "group") continue;
    const touched = ids.has(node.id) || node.childIds.some((id) => ids.has(id));
    if (!touched) continue;
    ids.add(node.id);
    for (const id of node.childIds) ids.add(id);
  }
  return ids;
}

/** Where a port sits on its node's box, in the node's own coordinates. */
function portPosition(node: NestedNode, port: Port): { x: number; y: number } {
  const along = Math.min(Math.max(port.offset, 0), 1);
  switch (port.side) {
    case "top":
      return { x: node.size.w * along, y: 0 };
    case "bottom":
      return { x: node.size.w * along, y: node.size.h };
    case "left":
      return { x: 0, y: node.size.h * along };
    case "right":
      return { x: node.size.w, y: node.size.h * along };
  }
}

const ELK_SIDE = { top: "NORTH", right: "EAST", bottom: "SOUTH", left: "WEST" } as const;

/** Port ids are only unique within their node, so the graph needs a qualified one. */
function elkPortId(nodeId: string, portId: string): string {
  return `${nodeId}::${portId}`;
}

function elkLeaf(node: DNode): ElkNode {
  const leaf: ElkNode = { id: node.id, width: node.size.w, height: node.size.h };
  if (node.type !== "nested" || node.ports.length === 0) return leaf;
  // FIXED_POS, not a free choice of side: these ports are where the author put them, and the
  // lines on this level already arrive there. The layout works around them.
  leaf.layoutOptions = { "elk.portConstraints": "FIXED_POS" };
  leaf.ports = node.ports.map((port) => {
    const at = portPosition(node, port);
    return {
      id: elkPortId(node.id, port.id),
      x: at.x,
      y: at.y,
      width: 1,
      height: 1,
      layoutOptions: { "elk.port.side": ELK_SIDE[port.side] },
    };
  });
  return leaf;
}

/** The id an edge end attaches to in the graph: a port when it has one, else the node itself. */
function endId(end: DEdge["source"], byId: Map<string, DNode>): string | null {
  if (!end.nodeId) return null;
  const node = byId.get(end.nodeId);
  if (!node) return null;
  if (end.portId && node.type === "nested" && node.ports.some((p) => p.id === end.portId)) {
    return elkPortId(node.id, end.portId);
  }
  return node.id;
}

/**
 * The graph handed to the engine: the laid-out nodes, groups holding their members, and the lines
 * between two of them. A line with a loose end, or one that reaches a shape outside the layout, is
 * left out — it has nothing to say about where things go, and its own ends don't move.
 */
export function buildLayoutGraph(diagram: Diagram, options: LayoutOptions): ElkNode {
  const targets = layoutTargets(diagram, options.nodeIds);
  const byId = new Map(diagram.nodes.map((n) => [n.id, n]));
  const inGroup = new Map<string, string>();
  for (const node of diagram.nodes) {
    if (node.type !== "group" || !targets.has(node.id)) continue;
    for (const id of node.childIds) if (targets.has(id)) inGroup.set(id, node.id);
  }

  const children: ElkNode[] = [];
  for (const node of diagram.nodes) {
    if (!targets.has(node.id) || inGroup.has(node.id)) continue;
    if (node.type === "group") {
      const members = node.childIds.filter((id) => targets.has(id) && byId.has(id));
      // A group with nothing of its own left in the layout is a box, not a container.
      if (members.length === 0) {
        children.push(elkLeaf(node));
        continue;
      }
      children.push({
        id: node.id,
        layoutOptions: {
          "elk.padding": `[top=${GROUP_PADDING_TOP},left=${GROUP_PADDING},bottom=${GROUP_PADDING},right=${GROUP_PADDING}]`,
        },
        children: members.map((id) => elkLeaf(byId.get(id) as DNode)),
      });
      continue;
    }
    children.push(elkLeaf(node));
  }

  const laidOut = (end: DEdge["source"]) => Boolean(end.nodeId && targets.has(end.nodeId));
  const edges: ElkExtendedEdge[] = [];
  for (const edge of diagram.edges) {
    if (!laidOut(edge.source) || !laidOut(edge.target)) continue;
    const from = endId(edge.source, byId);
    const to = endId(edge.target, byId);
    if (!from || !to || from === to) continue;
    edges.push({ id: edge.id, sources: [from], targets: [to] });
  }

  return { id: "root", layoutOptions: elkOptions(options.direction), children, edges };
}

/** Every node the engine placed, by id, in absolute coordinates. */
function absolutePositions(graph: LaidOutNode): Map<string, { x: number; y: number; w: number; h: number }> {
  const out = new Map<string, { x: number; y: number; w: number; h: number }>();
  const walk = (node: LaidOutNode, offsetX: number, offsetY: number) => {
    for (const child of node.children ?? []) {
      const x = offsetX + (child.x ?? 0);
      const y = offsetY + (child.y ?? 0);
      if (child.id) out.set(child.id, { x, y, w: child.width ?? 0, h: child.height ?? 0 });
      walk(child, x, y);
    }
  };
  walk(graph, 0, 0);
  return out;
}

/**
 * Writes a finished layout back into the document. The result is moved so that its top-left
 * corner lands where the laid-out shapes' own top-left corner was: tidying up rearranges a
 * diagram, it doesn't carry it off to somewhere else on the canvas.
 */
export function applyLayoutGraph(
  doc: DiagramDocument,
  diagramId: string,
  result: LaidOutNode,
  options: LayoutOptions,
): DiagramDocument {
  const diagram = doc.diagrams[diagramId];
  if (!diagram) return doc;
  const placed = absolutePositions(result);
  const moved = diagram.nodes.filter((n) => placed.has(n.id));
  if (moved.length === 0) return doc;

  const anchorX = Math.min(...moved.map((n) => n.position.x));
  const anchorY = Math.min(...moved.map((n) => n.position.y));
  const resultX = Math.min(...moved.map((n) => (placed.get(n.id) as { x: number }).x));
  const resultY = Math.min(...moved.map((n) => (placed.get(n.id) as { y: number }).y));
  const grid = options.snap && options.snap > 0 ? options.snap : 0;
  const round = (value: number) => (grid ? Math.round(value / grid) * grid : value);
  const shiftX = anchorX - resultX;
  const shiftY = anchorY - resultY;

  const nodes = diagram.nodes.map((node) => {
    const at = placed.get(node.id);
    if (!at) return node;
    const position = { x: round(at.x + shiftX), y: round(at.y + shiftY) };
    // A group's box is whatever its members became; everything else keeps the size it had.
    if (node.type === "group") {
      return { ...node, position, size: { w: Math.max(at.w, 1), h: Math.max(at.h, 1) } } as GroupNode;
    }
    return { ...node, position } as DNode;
  });

  const edges = options.relayoutLines
    ? diagram.edges.map((edge) => {
        if (!edge.waypoints?.length) return edge;
        const touched = (end: DEdge["source"]) => Boolean(end.nodeId && placed.has(end.nodeId));
        if (!touched(edge.source) && !touched(edge.target)) return edge;
        const next = { ...edge };
        delete next.waypoints;
        return next;
      })
    : diagram.edges;

  return {
    ...doc,
    meta: { ...doc.meta, modified: new Date().toISOString() },
    diagrams: { ...doc.diagrams, [diagramId]: { ...diagram, nodes, edges } },
  };
}

/** Lays out one level. */
export async function autoLayout(
  doc: DiagramDocument,
  diagramId: string,
  options: LayoutOptions,
  engine: LayoutEngine,
): Promise<DiagramDocument> {
  const diagram = doc.diagrams[diagramId];
  if (!diagram) return doc;
  const graph = buildLayoutGraph(diagram, options);
  if ((graph.children ?? []).length === 0) return doc;
  return applyLayoutGraph(doc, diagramId, await engine.layout(graph), options);
}

/**
 * Every level reachable from `diagramId` through Nested Blocks, parents first. Bounded by the same
 * depth limit the file format enforces, and a diagram is visited once however many blocks point at
 * it, so a document that cheated its way past validation still cannot spin here.
 */
export function levelsBelow(doc: DiagramDocument, diagramId: string): string[] {
  const order: string[] = [];
  const seen = new Set<string>();
  const walk = (id: string, depth: number) => {
    if (depth > MAX_NESTING_DEPTH || seen.has(id) || !doc.diagrams[id]) return;
    seen.add(id);
    order.push(id);
    for (const node of doc.diagrams[id].nodes) {
      if (node.type === "nested") walk(node.childDiagramId, depth + 1);
    }
  };
  walk(diagramId, 0);
  return order;
}

/**
 * Lays out this level and every level below it, in one document update. The thing nesting makes
 * tedious by hand: the same tidy-up, once per level, as deep as the document goes.
 */
export async function autoLayoutAllLevels(
  doc: DiagramDocument,
  diagramId: string,
  options: LayoutOptions,
  engine: LayoutEngine,
): Promise<DiagramDocument> {
  // A selection only means something on the level it was made on; levels below are laid out whole.
  let next = await autoLayout(doc, diagramId, options, engine);
  for (const id of levelsBelow(next, diagramId).slice(1)) {
    next = await autoLayout(next, id, { ...options, nodeIds: undefined }, engine);
  }
  return next;
}
