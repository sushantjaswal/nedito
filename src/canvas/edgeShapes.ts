// What a line is drawn as, besides a single stroke: a double line, and a hollow block arrow
// that follows the line's route. Picked in the line toolbar's
// Connection popup; stored as `style.edgeShape`.
//
// Both are drawn the same way, by laying a stroke of the page colour down the middle of a wider
// stroke of the line colour: the wide one's two edges are what the eye reads. The block arrow's
// head is a separate outlined triangle, sized from the body and pointing along the route's last
// stretch, with the body stopped at its base so no corner of it shows past the head. Canvas and
// exports both call this module, so they draw the same shape (see edgeRouting.ts for why that rule
// exists).
import { Position } from "@xyflow/react";
import type { Point } from "./edgeGeometry";
import { buildEdgePath, type EdgePathInput } from "./edgeRouting";

export type EdgeShape = "line" | "double" | "arrow" | "wavy";

export const EDGE_SHAPES: { id: EdgeShape; label: string }[] = [
  { id: "line", label: "Line" },
  { id: "double", label: "Double line" },
  { id: "arrow", label: "Block arrow" },
  { id: "wavy", label: "Wavy line" },
];

export function edgeShapeOf(style: Record<string, unknown>): EdgeShape {
  return style.edgeShape === "double" || style.edgeShape === "arrow" || style.edgeShape === "wavy" ? style.edgeShape : "line";
}

/**
 * A wave along the line's stretches, end to end through its bends: whole half-waves of about
 * `wavelength / 2` per stretch, so every bend and both ends sit on the line's own centre. The very
 * first and last half-waves are drawn straight, so an arrowhead points along the line rather than
 * along the last wiggle, and an end meets its shape square on.
 */
export function wavePath(points: Point[], amplitude: number, wavelength = 16): string {
  const r = (v: number) => Math.round(v * 100) / 100;
  let d = `M${r(points[0].x)},${r(points[0].y)}`;
  let sign = 1;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len === 0) continue;
    const ux = (b.x - a.x) / len;
    const uy = (b.y - a.y) / len;
    const halves = Math.max(1, Math.round(len / (wavelength / 2)));
    const step = len / halves;
    for (let h = 0; h < halves; h++) {
      const ex = a.x + ux * (h + 1) * step;
      const ey = a.y + uy * (h + 1) * step;
      const outerEnd = (i === 1 && h === 0) || (i === points.length - 1 && h === halves - 1);
      if (outerEnd && halves > 2) {
        d += ` L${r(ex)},${r(ey)}`;
        continue;
      }
      const mid = (h + 0.5) * step;
      // A quadratic's peak is half its control point's offset, so the control sits at twice the height.
      const cx = a.x + ux * mid - uy * amplitude * 2 * sign;
      const cy = a.y + uy * mid + ux * amplitude * 2 * sign;
      d += ` Q${r(cx)},${r(cy)} ${r(ex)},${r(ey)}`;
      sign = -sign;
    }
  }
  return d;
}

/** Width of the double line's or block arrow's body, edge to edge, for a stroke this wide. */
export function bodyWidth(shape: EdgeShape, strokeWidth: number): number {
  return shape === "arrow" ? 10 + strokeWidth * 2 : 3 + strokeWidth * 2;
}

const INTO: Record<Position, Point> = {
  [Position.Left]: { x: 1, y: 0 },
  [Position.Right]: { x: -1, y: 0 },
  [Position.Top]: { x: 0, y: 1 },
  [Position.Bottom]: { x: 0, y: -1 },
};

function unit(dx: number, dy: number): Point | null {
  const len = Math.hypot(dx, dy);
  return len > 0 ? { x: dx / len, y: dy / len } : null;
}

/**
 * The direction the route is travelling as it arrives at its target (or, with `atStart`, as it
 * arrives back at its source, travelling backwards). A curved or elbowed route with no bends
 * arrives square to the side it enters by; otherwise it is the last stretch's own direction.
 */
export function arrivalDirection(input: EdgePathInput, atStart = false): Point {
  const pts: Point[] = [{ x: input.sourceX, y: input.sourceY }, ...input.waypoints, { x: input.targetX, y: input.targetY }];
  if (atStart) pts.reverse();
  const end = pts[pts.length - 1];
  const before = pts[pts.length - 2];
  if (input.waypoints.length === 0 && input.kind !== "straight") {
    return INTO[atStart ? input.sourcePosition : input.targetPosition];
  }
  return unit(end.x - before.x, end.y - before.y) ?? { x: 1, y: 0 };
}

export interface ShapedEdge {
  /** The route to stroke, shortened so a block arrow's body stops inside its heads. */
  path: string;
  /** Extra outlined heads (block arrow only), in `d` syntax, drawn after the body. */
  heads: string[];
  /** The body's outer stroke width; 0 for a plain line, which strokes as it always has. */
  outer: number;
  /** The stroke of page colour laid down the middle. */
  inner: number;
}

/**
 * The geometry for `shape`. `headAtEnd` / `headAtStart` say which ends of a block arrow carry a
 * head (its arrowhead choices, read as on or off); a plain line and a double line have none here
 * and keep their ordinary markers.
 */
export function shapeEdge(
  input: EdgePathInput,
  shape: EdgeShape,
  strokeWidth: number,
  heads: { start: boolean; end: boolean },
): ShapedEdge {
  if (shape === "line") return { path: buildEdgePath(input).path, heads: [], outer: 0, inner: 0 };
  // A wavy line keeps an ordinary stroke and arrowheads; only its path changes. It runs straight
  // between its bends whatever the route.
  if (shape === "wavy") {
    const pts = [{ x: input.sourceX, y: input.sourceY }, ...input.waypoints, { x: input.targetX, y: input.targetY }];
    return { path: wavePath(pts, 3 + strokeWidth, 26), heads: [], outer: 0, inner: 0 };
  }
  const outer = bodyWidth(shape, strokeWidth);
  const inner = Math.max(1, outer - strokeWidth * 2);
  if (shape === "double") return { path: buildEdgePath(input).path, heads: [], outer, inner };

  const length = outer * 1.6;
  const half = outer * 1.15;
  const shaped = { ...input };
  const out: string[] = [];
  const head = (tip: Point, dir: Point) => {
    const base = { x: tip.x - dir.x * length, y: tip.y - dir.y * length };
    const n = { x: -dir.y * half, y: dir.x * half };
    const r = (v: number) => Math.round(v * 100) / 100;
    out.push(`M${r(tip.x)},${r(tip.y)} L${r(base.x + n.x)},${r(base.y + n.y)} L${r(base.x - n.x)},${r(base.y - n.y)} Z`);
    return base;
  };
  if (heads.end) {
    const base = head({ x: input.targetX, y: input.targetY }, arrivalDirection(input));
    shaped.targetX = base.x;
    shaped.targetY = base.y;
  }
  if (heads.start) {
    const base = head({ x: input.sourceX, y: input.sourceY }, arrivalDirection(input, true));
    shaped.sourceX = base.x;
    shaped.sourceY = base.y;
  }
  return { path: buildEdgePath(shaped).path, heads: out, outer, inner };
}
