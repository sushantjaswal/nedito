// Where a dragged edge label is kept: the nearest point on its line, how
// far along the line that is, and the label's offset from it — draw.io's model for an edge label,
// so the label keeps its place relative to the line as the shapes it joins move.
import type { EdgeLabelPosition } from "../model/types";
import { nearestOnPath, type Point } from "./edgeGeometry";

/** Within this distance of the line, a label dropped there sits on the line itself. */
export const SNAP_TO_LINE = 6;

const round = (n: number, places: number) => {
  const f = 10 ** places;
  return Math.round(n * f) / f;
};

/** The position of a label centred at `centre`, for the line drawn by path `d`. */
export function labelPositionAt(d: string, centre: Point): EdgeLabelPosition {
  const near = nearestOnPath(d, centre);
  if (!near) return { t: 0.5, dx: 0, dy: 0 };
  const dx = centre.x - near.point.x;
  const dy = centre.y - near.point.y;
  // Rounded so a file stays readable and diffs cleanly: a hundredth of a pixel is invisible.
  const t = round(near.t, 4);
  return Math.hypot(dx, dy) < SNAP_TO_LINE ? { t, dx: 0, dy: 0 } : { t, dx: round(dx, 1), dy: round(dy, 1) };
}
