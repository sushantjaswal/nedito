export interface Point {
  x: number;
  y: number;
}

export function centroid(points: Point[]): Point {
  const x = points.reduce((sum, p) => sum + p.x, 0) / points.length;
  const y = points.reduce((sum, p) => sum + p.y, 0) / points.length;
  return { x, y };
}

export function buildStraightPolyline(points: Point[]): string {
  return points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x},${p.y}`).join(" ");
}

// Axis-aligned polyline through every point: a horizontal-then-vertical elbow between each
// consecutive pair. Keeps every segment orthogonal even when user-placed waypoints aren't
// axis-aligned with their neighbors.
export function buildOrthogonalPolyline(points: Point[]): string {
  let d = `M ${points[0].x},${points[0].y}`;
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const cur = points[i];
    if (prev.x !== cur.x && prev.y !== cur.y) {
      d += ` L ${cur.x},${prev.y}`;
    }
    d += ` L ${cur.x},${cur.y}`;
  }
  return d;
}

// Cheap smoothed polyline through arbitrary points: quadratic curves using each interior
// point as a control point, meeting at segment midpoints (a standard Catmull-Rom-ish trick).
export function buildSmoothPolyline(points: Point[]): string {
  if (points.length < 3) return buildStraightPolyline(points);
  let d = `M ${points[0].x},${points[0].y}`;
  for (let i = 1; i < points.length - 1; i++) {
    const cur = points[i];
    const next = points[i + 1];
    const mx = (cur.x + next.x) / 2;
    const my = (cur.y + next.y) / 2;
    d += ` Q ${cur.x},${cur.y} ${mx},${my}`;
  }
  const last = points[points.length - 1];
  d += ` L ${last.x},${last.y}`;
  return d;
}

function distanceToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const projX = a.x + t * dx;
  const projY = a.y + t * dy;
  return Math.hypot(p.x - projX, p.y - projY);
}

// Finds which segment (0..points.length-2) a point is closest to, treating each consecutive
// pair as a straight line — a reasonable approximation even for curved/orthogonal rendering,
// used to decide where a drag-created waypoint should be inserted.
export function nearestSegmentIndex(points: Point[], target: Point): number {
  let best = 0;
  let bestDist = Infinity;
  for (let i = 0; i < points.length - 1; i++) {
    const d = distanceToSegment(target, points[i], points[i + 1]);
    if (d < bestDist) {
      bestDist = d;
      best = i;
    }
  }
  return best;
}

/**
 * A path as the points it is drawn through. Reads the M/L/Q/C commands the edge builders and
 * React Flow's own path functions emit; curves are sampled finely enough that the error is well
 * under a pixel.
 */
export function pathPoints(d: string): Point[] {
  const tokens = d.match(/[MLQC]|-?\d*\.?\d+(?:e[-+]?\d+)?/gi) ?? [];
  const pts: Point[] = [];
  let cmd = "";
  let at: Point | null = null;
  const nums: number[] = [];
  const flush = () => {
    const take = cmd === "Q" ? 4 : cmd === "C" ? 6 : 2;
    while (nums.length >= take) {
      const n = nums.splice(0, take);
      if (cmd === "M" || cmd === "L" || !at) {
        at = { x: n[take - 2], y: n[take - 1] };
        pts.push(at);
        continue;
      }
      const p0: Point = at;
      for (let i = 1; i <= 16; i++) {
        const t = i / 16;
        const u = 1 - t;
        const p =
          cmd === "Q"
            ? { x: u * u * p0.x + 2 * u * t * n[0] + t * t * n[2], y: u * u * p0.y + 2 * u * t * n[1] + t * t * n[3] }
            : {
                x: u * u * u * p0.x + 3 * u * u * t * n[0] + 3 * u * t * t * n[2] + t * t * t * n[4],
                y: u * u * u * p0.y + 3 * u * u * t * n[1] + 3 * u * t * t * n[3] + t * t * t * n[5],
              };
        pts.push(p);
      }
      at = pts[pts.length - 1];
    }
    nums.length = 0;
  };
  for (const tok of tokens) {
    if (/^[MLQC]$/i.test(tok)) {
      flush();
      cmd = tok.toUpperCase();
    } else {
      nums.push(Number(tok));
    }
  }
  flush();
  return pts;
}

/** The point halfway along a path's drawn length — where draw.io puts an edge label, on the line. */
/** The point `t` of the way along the path by length (0 at its start, 1 at its end). */
export function pathPointAt(d: string, t: number): Point | null {
  if (t === 0.5) return pathMidpoint(d);
  const pts = pathPoints(d);
  if (pts.length === 0) return null;
  let total = 0;
  for (let i = 1; i < pts.length; i++) total += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  let left = total * Math.min(1, Math.max(0, t));
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len >= left && len > 0) {
      const f = left / len;
      return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f };
    }
    left -= len;
  }
  return pts[pts.length - 1];
}

/** The point on the path nearest to `p`, and how far along the path it is (0..1 by length). */
export function nearestOnPath(d: string, p: Point): { t: number; point: Point } | null {
  const pts = pathPoints(d);
  if (pts.length === 0) return null;
  if (pts.length === 1) return { t: 0, point: pts[0] };
  let total = 0;
  let best = { dist: Infinity, along: 0, point: pts[0] };
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const vx = b.x - a.x;
    const vy = b.y - a.y;
    const len2 = vx * vx + vy * vy;
    const f = len2 > 0 ? Math.min(1, Math.max(0, ((p.x - a.x) * vx + (p.y - a.y) * vy) / len2)) : 0;
    const q = { x: a.x + vx * f, y: a.y + vy * f };
    const dist = Math.hypot(p.x - q.x, p.y - q.y);
    const len = Math.sqrt(len2);
    if (dist < best.dist) best = { dist, along: total + len * f, point: q };
    total += len;
  }
  return { t: total > 0 ? best.along / total : 0, point: best.point };
}

export function pathMidpoint(d: string): Point | null {
  const pts = pathPoints(d);
  if (pts.length === 0) return null;
  let total = 0;
  for (let i = 1; i < pts.length; i++) total += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  let left = total / 2;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len >= left && len > 0) {
      const t = left / len;
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
    }
    left -= len;
  }
  return pts[pts.length - 1];
}
