// Line stencils: a line drawn as a shape, with arrowheads that keep their own proportions.
//
// A stencil body is stretched to its node's box, so an arrowhead authored in 0..100 units comes
// out squashed flat on a long thin line, and stretched again every time the user resizes it.
// A line stencil therefore writes `<nd-line>` instead of drawing its heads:
//
//   <nd-line points="0,50 100,50" start="none" end="classic" />
//
// `points` is the line in the usual 0..100 units: two points for a straight line, more for an
// elbow, or four with `curve="1"` for a cubic curve (start, two control points, end). `start` and
// `end` name arrowheads from canvas/arrowheads.ts — the same vocabulary, and the same drawings, as
// a connector's ends, so a hollow UML triangle on a line shape matches the one on an edge.
// `double="1"` draws a straight line as two parallel strokes.
//
// expandLines turns each one into real SVG for the size it is drawn at: the line, shortened so
// it stops inside its head as a connector's does, and each head drawn in screen pixels, pointing
// along the line, at a size that follows the stroke width.
import { escapeMarkup as q } from "../../model/escapeMarkup";
import { ARROWHEADS, type ArrowheadPaint } from "../../canvas/arrowheads";

export interface LinePaint {
  stroke: string;
  strokeWidth: number;
  /**
   * Enlarges the heads. A picker tile draws a 160px line in about 40px, where a true-size head
   * is a 4px speck and an arrow, an inheritance line and an open arrow look the same.
   */
  headScale?: number;
}

type Pt = [number, number];

const DD_LINE = /<nd-line\b([^>]*?)\/?>/gi;

function attr(attrs: string, name: string): string | undefined {
  return new RegExp(`\\b${name}="([^"]*)"`).exec(attrs)?.[1];
}

const r = (n: number) => String(Math.round(n * 1000) / 1000);

/** The size of an arrowhead in pixels, for a line this wide: a connector's proportions. */
export function headSize(strokeWidth: number): number {
  return 6 + 4 * Math.max(1, strokeWidth);
}

function partPaint(fill: ArrowheadPaint, paint: LinePaint, unitStroke: number): string {
  if (fill === "stroke") return `fill="${q(paint.stroke)}" stroke="none"`;
  // A hollow head is filled with paper, as on a connector, so the line does not show through it.
  const inside = fill === "background" ? "#ffffff" : "none";
  return `fill="${inside}" stroke="${q(paint.stroke)}" stroke-width="${r(unitStroke)}" stroke-linejoin="round"`;
}

/**
 * One arrowhead, its tip at `tip` (0..100 units), pointing along `dir` (a pixel-space unit
 * vector). The transform undoes the body's stretch, so the head is drawn at true proportions.
 */
function head(kind: string, tip: Pt, dir: Pt, sx: number, sy: number, paint: LinePaint): { svg: string; back: number } {
  const def = ARROWHEADS.find((a) => a.id === kind);
  if (!def) return { svg: "", back: 0 };
  const size = headSize(paint.strokeWidth) * (paint.headScale ?? 1);
  const deg = (Math.atan2(dir[1], dir[0]) * 180) / Math.PI;
  const unitStroke = Math.max(1.25, (paint.strokeWidth * 10) / size);
  const parts = def.parts.map((p) => `<path d="${p.d}" ${partPaint(p.fill, paint, unitStroke)} stroke-dasharray="none" />`).join("");
  const transform = `translate(${r(tip[0])} ${r(tip[1])}) scale(${r(1 / sx)} ${r(1 / sy)}) rotate(${r(deg)}) scale(${r(size / 10)}) translate(-10 -5)`;
  // The line stops where a connector's would, at the head's refX, rather than running to the tip.
  return { svg: `<g transform="${transform}">${parts}</g>`, back: ((10 - def.refX) * size) / 10 };
}

function unit(from: Pt, to: Pt, sx: number, sy: number): Pt | undefined {
  const dx = (to[0] - from[0]) * sx;
  const dy = (to[1] - from[1]) * sy;
  const len = Math.hypot(dx, dy);
  return len > 0 ? [dx / len, dy / len] : undefined;
}

/** Moves `p` back along `dir` by `px` screen pixels. */
function pullBack(p: Pt, dir: Pt, px: number, sx: number, sy: number): Pt {
  return [p[0] - (dir[0] * px) / sx, p[1] - (dir[1] * px) / sy];
}

function expandOne(attrs: string, sx: number, sy: number, paint: LinePaint): string {
  const pts: Pt[] = (attr(attrs, "points") ?? "")
    .trim()
    .split(/\s+/)
    .map((pair) => pair.split(",").map(Number) as Pt)
    .filter((p) => p.length === 2 && p.every(Number.isFinite));
  if (pts.length < 2) return "";
  const curve = attr(attrs, "curve") === "1" && pts.length === 4;
  const line = pts.map((p) => [p[0], p[1]] as Pt);
  let heads = "";

  const endKind = attr(attrs, "end");
  const endDir = endKind ? unit(pts[pts.length - 2], pts[pts.length - 1], sx, sy) : undefined;
  if (endKind && endDir) {
    const h = head(endKind, pts[pts.length - 1], endDir, sx, sy, paint);
    heads += h.svg;
    line[line.length - 1] = pullBack(pts[pts.length - 1], endDir, h.back, sx, sy);
  }
  const startKind = attr(attrs, "start");
  const startDir = startKind ? unit(pts[1], pts[0], sx, sy) : undefined;
  if (startKind && startDir) {
    const h = head(startKind, pts[0], startDir, sx, sy, paint);
    heads += h.svg;
    line[0] = pullBack(pts[0], startDir, h.back, sx, sy);
  }

  const xy = (p: Pt) => `${r(p[0])},${r(p[1])}`;
  let body: string;
  if (curve) {
    body = `<path d="M${xy(line[0])} C${xy(line[1])} ${xy(line[2])} ${xy(line[3])}" fill="none" />`;
  } else if (line.length === 2 && attr(attrs, "double") === "1") {
    // Two strokes a fixed gap apart, however long or thin the box.
    const dir = unit(line[0], line[1], sx, sy) ?? [1, 0];
    const gap = 1.5 + paint.strokeWidth;
    const n: Pt = [(-dir[1] * gap) / sx, (dir[0] * gap) / sy];
    body = [1, -1]
      .map((s) => {
        const a: Pt = [line[0][0] + s * n[0], line[0][1] + s * n[1]];
        const b: Pt = [line[1][0] + s * n[0], line[1][1] + s * n[1]];
        return `<line x1="${r(a[0])}" y1="${r(a[1])}" x2="${r(b[0])}" y2="${r(b[1])}" fill="none" />`;
      })
      .join("");
  } else if (line.length === 2) {
    body = `<line x1="${r(line[0][0])}" y1="${r(line[0][1])}" x2="${r(line[1][0])}" y2="${r(line[1][1])}" fill="none" />`;
  } else {
    body = `<polyline points="${line.map(xy).join(" ")}" fill="none" stroke-linejoin="round" />`;
  }
  return body + heads;
}

/** Replaces every `<nd-line>` in a stencil body with the SVG for a `w`×`h` box. */
export function expandLines(svgBody: string, w: number, h: number, paint: LinePaint): string {
  if (!svgBody.includes("<nd-line")) return svgBody;
  const sx = w > 0 ? w / 100 : 1;
  const sy = h > 0 ? h / 100 : 1;
  return svgBody.replace(DD_LINE, (_whole, attrs: string) => expandOne(attrs, sx, sy, paint));
}
