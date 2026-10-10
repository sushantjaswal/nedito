// Point each unnamed edge end at the node on the other end.
//
// An edge end with no handle falls back to React Flow's first declared handle, which is *top*
// (canvas/edgeRouting.ts DEFAULT_HANDLE). In a template that means every edge leaves the top of
// its node and arrives at the top of the next, so lines loop over boxes, or down through them —
// the Basic flowchart's Start → Receive edge went up out of Start and back down through it.
//
// Templates from T3 on name their sides by hand. The T1 and T2 sets did not, and fifty-odd edges
// set by hand is fifty-odd chances to get one wrong, so this derives them from the layout instead.
//
// It decides the axis from the boxes, not their centres. Two boxes that overlap horizontally are
// stacked, so the edge runs vertically, and vice versa; only boxes clear of each other on both
// axes fall back to whichever gap is larger. A centre-to-centre rule was tried first and is wrong
// for exactly the shapes that matter: a UML fork bar is wide and flat, so a box just below one end
// of it sits further away sideways than downwards, and the edge left the bar's tip and wrapped
// round the box instead of dropping straight into it.
//
// It only fills gaps. A side a template names is kept, and a port end is left alone because its
// handle is derived from `portId` (canvas/edgeRouting.ts endHandle).
import type { DEdge, DNode, Diagram } from "../model/types";

type Side = "top" | "right" | "bottom" | "left";

const centre = (n: DNode) => ({ x: n.position.x + n.size.w / 2, y: n.position.y + n.size.h / 2 });

/** How far apart two spans are along one axis; zero or less means they overlap. */
function gap(aStart: number, aLen: number, bStart: number, bLen: number): number {
  return Math.max(bStart - (aStart + aLen), aStart - (bStart + bLen));
}

/** The pair of faces an edge from `from` to `to` leaves and arrives on. */
export function facingSides(from: DNode, to: DNode): [Side, Side] {
  const gx = gap(from.position.x, from.size.w, to.position.x, to.size.w);
  const gy = gap(from.position.y, from.size.h, to.position.y, to.size.h);
  const a = centre(from);
  const b = centre(to);

  let vertical: boolean;
  if (gx <= 0 && gy > 0) vertical = true; // stacked
  else if (gy <= 0 && gx > 0) vertical = false; // side by side
  else if (gx > 0 && gy > 0) vertical = gy > gx; // clear on both axes: the larger gap wins
  else vertical = Math.abs(b.y - a.y) > Math.abs(b.x - a.x); // overlapping boxes: fall back to centres

  if (vertical) return b.y >= a.y ? ["bottom", "top"] : ["top", "bottom"];
  return b.x >= a.x ? ["right", "left"] : ["left", "right"];
}

export function faceEdges(diagram: Diagram): Diagram {
  const byId = new Map(diagram.nodes.map((n) => [n.id, n]));
  const edges = diagram.edges.map((edge): DEdge => {
    const from = edge.source.nodeId ? byId.get(edge.source.nodeId) : undefined;
    const to = edge.target.nodeId ? byId.get(edge.target.nodeId) : undefined;
    if (!from || !to) return edge;
    const [out, into] = facingSides(from, to);
    const style = { ...edge.style };
    if (!edge.source.portId && !style.sourceHandle) style.sourceHandle = out;
    if (!edge.target.portId && !style.targetHandle) style.targetHandle = into;
    return { ...edge, style };
  });
  return { ...diagram, edges };
}
