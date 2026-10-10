// Reading an edge end that may be attached to a node or free at a point (types.ts EdgeEnd).
import type { DEdge, EdgeEnd } from "./types";

export type Point = { x: number; y: number };

/** True for an end that sits at a point on the canvas rather than on a node. */
export function isFreeEnd(end: EdgeEnd): end is EdgeEnd & { point: Point } {
  return !end.nodeId && !!end.point;
}

/** True when the edge touches `nodeId` at either end. */
export function touchesNode(edge: DEdge, nodeId: string): boolean {
  return edge.source.nodeId === nodeId || edge.target.nodeId === nodeId;
}

/** True when neither end is attached to anything: the whole line moves as one. */
export function isFreeLine(edge: DEdge): boolean {
  return isFreeEnd(edge.source) && isFreeEnd(edge.target);
}

/** A free end moved by (dx, dy); an attached end is left where its node puts it. */
export function shiftEnd(end: EdgeEnd, dx: number, dy: number): EdgeEnd {
  return isFreeEnd(end) ? { point: { x: end.point.x + dx, y: end.point.y + dy } } : end;
}

/** The edge with its free ends and waypoints moved by (dx, dy) — how a free line is dragged or pasted. */
export function shiftEdge(edge: DEdge, dx: number, dy: number): DEdge {
  return {
    ...edge,
    source: shiftEnd(edge.source, dx, dy),
    target: shiftEnd(edge.target, dx, dy),
    ...(edge.waypoints ? { waypoints: edge.waypoints.map((p) => ({ x: p.x + dx, y: p.y + dy })) } : {}),
  };
}

/** True when the edge has any free end — the case that needs formatVersion 4 to describe. */
export function hasFreeEnd(edge: DEdge): boolean {
  return isFreeEnd(edge.source) || isFreeEnd(edge.target);
}

/**
 * The edges a copy takes with it, as draw.io's copy does: every selected line whose attached ends
 * are all among the copied shapes (free ends go anywhere), and every connection between copied
 * shapes, selected or not — copying two connected boxes without their arrow loses the diagram.
 */
export function edgesToCopy(edges: DEdge[], nodeIds: Set<string>, edgeIds: Set<string>): DEdge[] {
  const copied = (end: DEdge["source"]) => isFreeEnd(end) || (!!end.nodeId && nodeIds.has(end.nodeId));
  return edges.filter((e) => {
    if (!copied(e.source) || !copied(e.target)) return false;
    return edgeIds.has(e.id) || !isFreeLine(e);
  });
}

/** Fresh copies of `edges`, re-pointed at the copied shapes (`idMap`) and moved by (dx, dy). */
export function copyEdges(edges: DEdge[], idMap: Map<string, string>, newId: () => string, dx: number, dy: number): DEdge[] {
  const end = (e: DEdge["source"]): DEdge["source"] =>
    isFreeEnd(e) ? { point: { x: e.point.x + dx, y: e.point.y + dy } } : { ...e, nodeId: idMap.get(e.nodeId!) ?? e.nodeId };
  return edges.map((e) => ({
    ...e,
    id: newId(),
    source: end(e.source),
    target: end(e.target),
    ...(e.waypoints ? { waypoints: e.waypoints.map((p) => ({ x: p.x + dx, y: p.y + dy })) } : {}),
  }));
}
