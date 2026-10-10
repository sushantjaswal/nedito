// Connecting two nodes, and the ＋ handle's "add a connected copy".
//
// Clicking a ＋ handle clones the shape on that side and connects the two (Alt+Shift+Arrow does
// the same from the keyboard), with two differences: the copy takes the shape's *default* style rather than
// the original's formatting, and its label opens for typing straight away.
//
// Both live here as pure document functions so the copy, its edge and any port the edge needs
// on a Nested Block land in one `set` — one undo step, as every edit is (D84).
import { nanoid } from "nanoid";
import { getStencil } from "../library/stencils";
import { newShapeStyle } from "../library/stencils/defaultStyle";
import { addEdge, addNode } from "./actions";
import * as nesting from "./nesting";
import type { DiagramDocument, DEdge, DNode, ShapeNode } from "./types";

export type Side = "top" | "right" | "bottom" | "left";
export const SIDES: readonly Side[] = ["top", "right", "bottom", "left"];

const OPPOSITE: Record<Side, Side> = { top: "bottom", right: "left", bottom: "top", left: "right" };
const DIRECTION: Record<Side, { x: number; y: number }> = {
  top: { x: 0, y: -1 },
  right: { x: 1, y: 0 },
  bottom: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
};

/** The space left between a shape and its connected copy: four grid cells. */
export const COPY_GAP = 64;

export interface ConnectArgs {
  sourceNodeId: string;
  sourceHandleId: string;
  targetNodeId: string;
  targetHandleId: string;
}

// NestedNode ports double as connection handles with id "port:<portId>" (see
// nesting/PortHandle.tsx) so an edge dragged onto one records which port it actually
// attached to — ghost links and the invariant cascade both key off EdgeEnd.portId.
export function parsePortId(handleId: string): string | undefined {
  return handleId.startsWith("port:") ? handleId.slice("port:".length) : undefined;
}

/** Adds an edge between two nodes, giving a Nested Block end the port it needs. */
export function connectNodes(
  doc: DiagramDocument,
  diagramId: string,
  { sourceNodeId, sourceHandleId, targetNodeId, targetHandleId }: ConnectArgs,
): { doc: DiagramDocument; edgeId: string } {
  const id = nanoid();
  // An edge touching a nested node always ends up on a real port, even when the user
  // dropped it on the node's body rather than an existing port dot — otherwise the
  // connection is invisible from inside the child diagram (see ensurePortForConnection).
  // The edge leaving the nested node is "out" of it; the edge arriving is "in".
  const src = nesting.ensurePortForConnection(doc, diagramId, sourceNodeId, parsePortId(sourceHandleId), sourceHandleId, "out");
  const tgt = nesting.ensurePortForConnection(src.doc, diagramId, targetNodeId, parsePortId(targetHandleId), targetHandleId, "in");

  const newEdge: DEdge = {
    id,
    source: { nodeId: sourceNodeId, portId: src.portId },
    target: { nodeId: targetNodeId, portId: tgt.portId },
    style: {
      // Curved by default: Nedito's default line style, chosen as a recognisable look. Straight/orthogonal remain
      // one click away in the context bar.
      edgeStyle: "curved",
      startArrow: "none",
      // Nedito's own look: an open chevron.
      endArrow: "open",
      sourceHandle: sourceHandleId,
      targetHandle: targetHandleId,
    },
  };
  return { doc: addEdge(tgt.doc, diagramId, newEdge), edgeId: id };
}

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

const overlaps = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

function rectOf(node: DNode): Rect {
  return { x: node.position.x, y: node.position.y, w: node.size.w, h: node.size.h };
}

/**
 * Where the copy goes: COPY_GAP beyond the shape on that side, centred on it, on the grid when
 * snap is on — and further out, a step at a time, while something already sits there, so
 * clicking the same ＋ again makes a chain rather than a pile.
 */
export function copyPosition(source: DNode, side: Side, others: readonly DNode[], grid: number | null): { x: number; y: number } {
  const d = DIRECTION[side];
  const step = { x: d.x * (source.size.w + COPY_GAP), y: d.y * (source.size.h + COPY_GAP) };
  // Snap moves the copy along the way it goes only: across, it stays exactly in line with the
  // shape it came from, which is the point of a connected next step even off the grid.
  const snapAlong = (p: { x: number; y: number }) =>
    grid ? { x: d.x ? Math.round(p.x / grid) * grid : p.x, y: d.y ? Math.round(p.y / grid) * grid : p.y } : p;
  const blockers = others.filter((n) => n.id !== source.id && n.type !== "group").map(rectOf);
  let at = { x: source.position.x + step.x, y: source.position.y + step.y };
  for (let i = 0; i < 50; i++) {
    const snapped = snapAlong(at);
    if (!blockers.some((b) => overlaps(b, { ...snapped, w: source.size.w, h: source.size.h }))) return snapped;
    at = { x: at.x + step.x, y: at.y + step.y };
  }
  return snapAlong(at);
}

export interface ConnectedCopyOptions {
  /** The grid to snap the copy to, or null when snap is off. */
  grid: number | null;
  layerId?: string;
}

/**
 * Adds a copy of a shape or Nested Block on one side of it — same kind and size, default style —
 * connected to it by a new edge from that side to the copy's facing side. Null for anything
 * else (a group, a missing node).
 */
export function addConnectedCopy(
  doc: DiagramDocument,
  diagramId: string,
  nodeId: string,
  side: Side,
  { grid, layerId }: ConnectedCopyOptions,
): { doc: DiagramDocument; nodeId: string; edgeId: string } | null {
  const diagram = doc.diagrams[diagramId];
  const source = diagram?.nodes.find((n) => n.id === nodeId);
  if (!source || (source.type !== "shape" && source.type !== "nested")) return null;
  const position = copyPosition(source, side, diagram.nodes, grid);
  const size = { ...source.size };

  let next: DiagramDocument;
  let copyId: string;
  if (source.type === "nested") {
    // A Nested Block's copy is a new, empty Nested Block: its own child diagram, not a second
    // reference to the original's (the model allows each child diagram one parent).
    const created = nesting.addNestedNode(doc, diagramId, position, size);
    copyId = created.nestedNodeId;
    next = layerId ? withLayer(created.doc, diagramId, copyId, layerId) : created.doc;
  } else {
    copyId = nanoid();
    const copy: Omit<ShapeNode, "z"> = {
      id: copyId,
      type: "shape",
      shapeRef: source.shapeRef,
      position,
      size,
      style: newShapeStyle(getStencil(source.shapeRef)),
      // A picture's copy shows the same picture: without it, it would be an empty frame.
      ...(source.imageId ? { imageId: source.imageId } : {}),
      ...(layerId ? { layerId } : {}),
    };
    next = addNode(doc, diagramId, copy);
  }

  const connected = connectNodes(next, diagramId, {
    sourceNodeId: nodeId,
    sourceHandleId: side,
    targetNodeId: copyId,
    targetHandleId: OPPOSITE[side],
  });
  return { doc: connected.doc, nodeId: copyId, edgeId: connected.edgeId };
}

function withLayer(doc: DiagramDocument, diagramId: string, nodeId: string, layerId: string): DiagramDocument {
  const diagram = doc.diagrams[diagramId];
  return {
    ...doc,
    diagrams: {
      ...doc.diagrams,
      [diagramId]: { ...diagram, nodes: diagram.nodes.map((n) => (n.id === nodeId ? { ...n, layerId } : n)) },
    },
  };
}
