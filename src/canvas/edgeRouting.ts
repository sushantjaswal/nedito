// The single source of truth for where an edge starts, where it ends, and what shape it takes
// between them. The canvas and every exporter call the *same* functions here.
//
// This module exists because they did not, and the divergence shipped: the canvas branched on
// waypoint count and used React Flow's getBezierPath/getSmoothStepPath when there were none,
// while the exporter always used the polyline builders — and buildSmoothPolyline falls back to
// a straight line for fewer than three points. Since almost no edge has waypoints, almost every
// curved edge exported as a straight one.
//
// The rule for anything added here: if the canvas and an export can disagree about it, it
// belongs in this file, not in either of them.
import { getBezierPath, getSmoothStepPath, getStraightPath, Position } from "@xyflow/react";
import {
  buildOrthogonalPolyline,
  buildSmoothPolyline,
  buildStraightPolyline,
  centroid,
  pathMidpoint,
  pathPointAt,
  type Point,
} from "./edgeGeometry";
import { getStencil } from "../library/stencils";
import { isIconStyleStencil } from "../library/stencils/defaultStyle";
import { IMAGE_SHAPE_REF } from "../model/assets";
import type { DNode, EdgeLabelPosition, NestedNode } from "../model/types";
import { pointOnOutline, stencilOutline, type Outline } from "./shapeOutline";

// Edge ends sit ON the shape, not at its handle (D81). They used to sit where React Flow anchors an
// edge — the outer centre of the handle element, 7px outside a side, 3.5px above a corner, 4.5px
// outside a port — and the export copied that faithfully, so on screen and in every export an
// arrow stopped short of the shape it pointed at. Now both start from the handle's place on the
// bounding box and meet the shape's real outline (canvas/shapeOutline.ts): the border of a
// rectangle, the slanted side of a triangle, the curve of an ellipse.

/**
 * The handle an edge end uses when the model does not name one.
 *
 * React Flow falls back to a node's first declared handle, and ConnectionHandles declares them
 * top, right, bottom, left — so "top" it is. This is why a freshly applied mind map arcs its
 * edges over the top of every box instead of connecting side to side; it is the real canvas
 * behaviour, and an export that did anything else would be the one that was wrong.
 */
export const DEFAULT_HANDLE = "top";

export interface NodeBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface HandleAnchor {
  point: Point;
  position: Position;
}

const SIDE_POSITION = {
  top: Position.Top,
  right: Position.Right,
  bottom: Position.Bottom,
  left: Position.Left,
} as const;

function directionalAnchor(box: NodeBox, side: keyof typeof SIDE_POSITION): HandleAnchor {
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  switch (side) {
    case "top":
      return { point: { x: cx, y: box.y }, position: Position.Top };
    case "bottom":
      return { point: { x: cx, y: box.y + box.h }, position: Position.Bottom };
    case "left":
      return { point: { x: box.x, y: cy }, position: Position.Left };
    case "right":
      return { point: { x: box.x + box.w, y: cy }, position: Position.Right };
  }
}

/**
 * The outline an edge end should meet for this node: an authored stencil's own outline, or null
 * (the bounding box) for icons, pictures, nested blocks and groups.
 */
function nodeOutline(node: DNode): Outline | null {
  if (node.type !== "shape" || node.shapeRef === IMAGE_SHAPE_REF) return null;
  const stencil = getStencil(node.shapeRef);
  return stencil ? stencilOutline(stencil, isIconStyleStencil(stencil)) : null;
}

/** Moves a handle's point on the bounding box onto the shape's real outline (D81). */
function onOutline(node: DNode, box: NodeBox, anchor: HandleAnchor): HandleAnchor {
  return { ...anchor, point: pointOnOutline(box, nodeOutline(node), node.rotation ?? 0, anchor.point) };
}

/**
 * Where a named handle sits on a node, and which way an edge leaves it.
 *
 * `handleId` is what the model stores in `style.sourceHandle` / `style.targetHandle`: one of the
 * four sides, one of the four corners, or `port:<portId>` for a nested node's port. An id that
 * does not resolve falls back to DEFAULT_HANDLE rather than throwing — an edge pointing at a
 * port that was since deleted should still draw somewhere sensible, on screen and in an export
 * alike.
 */
export function resolveHandleAnchor(
  node: DNode,
  box: NodeBox,
  handleId?: string | null,
  fixed?: { x: number; y: number },
): HandleAnchor {
  if (fixed) return fixedAnchor(box, fixed);
  return onOutline(node, box, boxAnchor(node, box, handleId));
}

/**
 * A fixed connection point (`EdgeEnd.anchor`, 0..1 across the node's box), like draw.io's
 * exitX/exitY: the end is exactly there, not moved to the outline — a sequence message meets a
 * lifeline's stem at its own height, which the outline (the head box) would never give. It leaves
 * through the nearest side.
 */
function fixedAnchor(box: NodeBox, fixed: { x: number; y: number }): HandleAnchor {
  const fx = Math.min(1, Math.max(0, fixed.x));
  const fy = Math.min(1, Math.max(0, fixed.y));
  const point = { x: box.x + box.w * fx, y: box.y + box.h * fy };
  const gaps: [number, Position][] = [
    [fx * box.w, Position.Left],
    [(1 - fx) * box.w, Position.Right],
    [fy * box.h, Position.Top],
    [(1 - fy) * box.h, Position.Bottom],
  ];
  gaps.sort((a, b) => a[0] - b[0]);
  return { point, position: gaps[0][1] };
}

/** Where a named handle sits on the node's bounding box, and which way an edge leaves it. */
function boxAnchor(node: DNode, box: NodeBox, handleId?: string | null): HandleAnchor {
  const id = handleId ?? DEFAULT_HANDLE;

  if (id.startsWith("port:") && node.type === "nested") {
    const port = (node as NestedNode).ports.find((p) => p.id === id.slice("port:".length));
    if (port) {
      const along = Math.min(1, Math.max(0, port.offset));
      if (port.side === "top") return { point: { x: box.x + box.w * along, y: box.y }, position: Position.Top };
      if (port.side === "bottom") return { point: { x: box.x + box.w * along, y: box.y + box.h }, position: Position.Bottom };
      if (port.side === "left") return { point: { x: box.x, y: box.y + box.h * along }, position: Position.Left };
      return { point: { x: box.x + box.w, y: box.y + box.h * along }, position: Position.Right };
    }
    return directionalAnchor(box, DEFAULT_HANDLE);
  }

  if (id in SIDE_POSITION) return directionalAnchor(box, id as keyof typeof SIDE_POSITION);

  // The four corner dots. All four are declared position={Position.Top} in ConnectionHandles, so
  // an edge leaves every one of them upward — kept, because the curve's direction is what the
  // canvas has always drawn. The point itself is the corner; onOutline then moves it in to the
  // shape, so a corner edge to an ellipse meets the curve rather than empty space.
  switch (id) {
    case "top-left":
      return { point: { x: box.x, y: box.y }, position: Position.Top };
    case "top-right":
      return { point: { x: box.x + box.w, y: box.y }, position: Position.Top };
    case "bottom-left":
      return { point: { x: box.x, y: box.y + box.h }, position: Position.Top };
    case "bottom-right":
      return { point: { x: box.x + box.w, y: box.y + box.h }, position: Position.Top };
    default:
      return directionalAnchor(box, DEFAULT_HANDLE);
  }
}

/**
 * The handle an edge end attaches to, derived rather than read.
 *
 * A port attachment used to be stored twice: once as `end.portId`, once as a `"port:<id>"` string
 * in `style.sourceHandle` / `style.targetHandle`. Different code paths updated different copies,
 * and React Flow silently drops an edge whose handle string names a port that is not there:
 *
 * - `applyTemplate` re-issued `portId` but not the string, so a template's port edge vanished;
 * - `removePort` cleared `portId` but not the string, so the edge vanished from the canvas while
 *   staying in the file and in every export;
 * - `connect` and `reconnectEdge` set `portId` to the port they auto-created while leaving the
 *   string as the side the user dropped on, so the line ended at the side's midpoint, away from
 *   its own port dot.
 *
 * So `portId` is the single source of truth: an end that has one attaches to that port. A stale
 * `"port:"` string with no `portId` behind it is ignored rather than trusted. Both renderers call
 * this, which is the only way to keep them agreeing.
 */
export function endHandle(end: { portId?: string }, styleHandle: unknown): string | null {
  if (end.portId) return `port:${end.portId}`;
  if (typeof styleHandle === "string" && styleHandle && !styleHandle.startsWith("port:")) return styleHandle;
  return null;
}

/**
 * Which way a free end (a line's end left on open canvas) leaves: toward the other end, along
 * whichever axis it mostly lies on. A curved or elbowed line then bends the way it was drawn,
 * the way a draw.io dangling edge does, instead of always leaving upward like an unnamed handle.
 */
export function freeEndPosition(at: Point, toward: Point): Position {
  const dx = toward.x - at.x;
  const dy = toward.y - at.y;
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? Position.Right : Position.Left;
  return dy >= 0 ? Position.Bottom : Position.Top;
}

/**
 * How wide a line is drawn when its style says nothing: 1pt, as draw.io's are. It was 1.75, which
 * read heavy next to shapes' 1px outlines (D88). Canvas, panels and exports all read this.
 */
export const DEFAULT_EDGE_WIDTH = 1;

export type EdgeStyleKind = "straight" | "orthogonal" | "curved";

/** What the model means when `style.edgeStyle` is missing or unrecognised. */
export function normalizeEdgeStyle(value: unknown): EdgeStyleKind {
  return value === "straight" || value === "curved" ? value : "orthogonal";
}

export interface EdgePathInput {
  sourceX: number;
  sourceY: number;
  sourcePosition: Position;
  targetX: number;
  targetY: number;
  targetPosition: Position;
  waypoints: Point[];
  kind: EdgeStyleKind;
  /** Where a dragged label sits (D97); omitted, the middle of the line. */
  label?: EdgeLabelPosition;
}

export interface EdgePathResult {
  path: string;
  /** Where the label is drawn: its dragged spot, or the middle of the line. */
  labelPos: Point;
  /** The middle of the line itself, wherever the label is — for the bend dot and the toolbar. */
  midPos: Point;
}

/** Where the label goes on a line whose middle is `mid`. */
function placeLabel(path: string, mid: Point, label: EdgeLabelPosition | undefined): Point {
  if (!label) return mid;
  const on = pathPointAt(path, label.t) ?? mid;
  return { x: on.x + label.dx, y: on.y + label.dy };
}

/**
 * The edge's `d` attribute and where its label sits.
 *
 * With no waypoints this defers to React Flow's own path functions, which are pure and import
 * cleanly outside a React tree — so an export gets byte-identical geometry rather than an
 * approximation of it. With waypoints it uses the polyline builders, because React Flow has no
 * multi-point routing.
 */
export function buildEdgePath(input: EdgePathInput): EdgePathResult {
  const { sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition, waypoints, kind } = input;

  if (waypoints.length === 0) {
    let path: string;
    if (kind === "straight") {
      [path] = getStraightPath({ sourceX, sourceY, targetX, targetY });
    } else if (kind === "curved") {
      [path] = getBezierPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition });
    } else {
      [path] = getSmoothStepPath({
        sourceX,
        sourceY,
        sourcePosition,
        targetX,
        targetY,
        targetPosition,
        borderRadius: 0,
      });
    }
    const midPos = pathMidpoint(path) ?? centroid([{ x: sourceX, y: sourceY }, { x: targetX, y: targetY }]);
    return { path, midPos, labelPos: placeLabel(path, midPos, input.label) };
  }

  const points: Point[] = [{ x: sourceX, y: sourceY }, ...waypoints, { x: targetX, y: targetY }];
  const path =
    kind === "straight"
      ? buildStraightPolyline(points)
      : kind === "curved"
        ? buildSmoothPolyline(points)
        : buildOrthogonalPolyline(points);
  const midPos = pathMidpoint(path) ?? centroid(points);
  return { path, midPos, labelPos: placeLabel(path, midPos, input.label) };
}

/** Every point the path is guaranteed to pass through — enough to bound it for an export. */
export function edgeExtentPoints(input: EdgePathInput): Point[] {
  return [
    { x: input.sourceX, y: input.sourceY },
    ...input.waypoints,
    { x: input.targetX, y: input.targetY },
  ];
}
