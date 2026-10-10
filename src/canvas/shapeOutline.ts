// Where an edge actually meets a shape: on its outline, not on its bounding box (D81).
//
// User-reported: arrows stopped short of the shapes they connect. Two causes. Every edge ended at
// its *handle* — the hover arrow drawn 7px outside the box — rather than at the shape; and a
// triangle, diamond or ellipse was met at its bounding box, so the arrow stopped in mid-air
// beside a slanted or curved side. A connector now ends on the shape's own perimeter.
//
// Each authored stencil is drawn in a 0..100 box, and its first element is its outer outline (a
// rect, circle, ellipse, polygon, or path). That is read once into a polygon. An edge end then
// starts at its handle's place on the bounding box and travels toward the shape's centre until it
// meets that polygon. For a rectangle the two coincide, so it ends exactly on the border.
//
// Pictogram icons and vendor icons have no such outline (a transformed group, or a whole SVG of
// their own) and keep the bounding box — which, without the old 7px gap, is right for an icon.
import type { StencilDef } from "../library/stencils/types";
import type { Point } from "./edgeGeometry";

/** A closed outline in the stencil's own 0..100 space. */
export type Outline = Point[];

const CURVE_SAMPLES = 12;
const ELLIPSE_SAMPLES = 64;

function num(attrs: string, name: string): number | null {
  const m = new RegExp(`(?:^|\\s)${name}\\s*=\\s*["']\\s*(-?[\\d.]+(?:e-?\\d+)?)`, "i").exec(attrs);
  return m ? parseFloat(m[1]) : null;
}

function ellipse(cx: number, cy: number, rx: number, ry: number): Outline {
  return Array.from({ length: ELLIPSE_SAMPLES }, (_, i) => {
    const a = (i / ELLIPSE_SAMPLES) * Math.PI * 2;
    return { x: cx + rx * Math.cos(a), y: cy + ry * Math.sin(a) };
  });
}

/** Points along an SVG elliptical arc, endpoint parameterisation (SVG 1.1 implementation notes, F.6.5). */
function arcPoints(
  p0: Point,
  rxIn: number,
  ryIn: number,
  angleDeg: number,
  largeArc: boolean,
  sweep: boolean,
  p1: Point,
): Point[] {
  let rx = Math.abs(rxIn);
  let ry = Math.abs(ryIn);
  if (rx === 0 || ry === 0) return [p1];
  const phi = (angleDeg * Math.PI) / 180;
  const cos = Math.cos(phi);
  const sin = Math.sin(phi);
  const dx = (p0.x - p1.x) / 2;
  const dy = (p0.y - p1.y) / 2;
  const x1 = cos * dx + sin * dy;
  const y1 = -sin * dx + cos * dy;
  const lambda = (x1 * x1) / (rx * rx) + (y1 * y1) / (ry * ry);
  if (lambda > 1) {
    rx *= Math.sqrt(lambda);
    ry *= Math.sqrt(lambda);
  }
  const sign = largeArc === sweep ? -1 : 1;
  const num_ = rx * rx * ry * ry - rx * rx * y1 * y1 - ry * ry * x1 * x1;
  const den = rx * rx * y1 * y1 + ry * ry * x1 * x1;
  const co = sign * Math.sqrt(Math.max(0, num_ / den));
  const cx1 = (co * rx * y1) / ry;
  const cy1 = (-co * ry * x1) / rx;
  const cx = cos * cx1 - sin * cy1 + (p0.x + p1.x) / 2;
  const cy = sin * cx1 + cos * cy1 + (p0.y + p1.y) / 2;
  const angle = (ux: number, uy: number, vx: number, vy: number) => {
    const a = Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
    return a;
  };
  const theta1 = angle(1, 0, (x1 - cx1) / rx, (y1 - cy1) / ry);
  let delta = angle((x1 - cx1) / rx, (y1 - cy1) / ry, (-x1 - cx1) / rx, (-y1 - cy1) / ry);
  if (!sweep && delta > 0) delta -= Math.PI * 2;
  if (sweep && delta < 0) delta += Math.PI * 2;
  const steps = Math.max(2, Math.ceil((Math.abs(delta) / (Math.PI * 2)) * ELLIPSE_SAMPLES));
  const out: Point[] = [];
  for (let i = 1; i <= steps; i++) {
    const t = theta1 + (delta * i) / steps;
    out.push({ x: cx + rx * Math.cos(t) * cos - ry * Math.sin(t) * sin, y: cy + rx * Math.cos(t) * sin + ry * Math.sin(t) * cos });
  }
  return out;
}

/** The first subpath of an SVG path as a polygon, sampling curves and arcs. Null if unreadable. */
export function pathOutline(d: string): Outline | null {
  const tokens = d.match(/[a-zA-Z]|-?(?:\d*\.\d+|\d+\.?)(?:e-?\d+)?/g);
  if (!tokens) return null;
  const pts: Point[] = [];
  let i = 0;
  let cmd = "";
  let cur: Point = { x: 0, y: 0 };
  let start: Point = { x: 0, y: 0 };
  const take = () => parseFloat(tokens[i++]);
  const isNum = () => i < tokens.length && !/^[a-zA-Z]$/.test(tokens[i]);

  while (i < tokens.length) {
    if (/^[a-zA-Z]$/.test(tokens[i])) cmd = tokens[i++];
    const rel = cmd === cmd.toLowerCase();
    const at = (x: number, y: number): Point => (rel ? { x: cur.x + x, y: cur.y + y } : { x, y });
    switch (cmd.toUpperCase()) {
      case "M": {
        if (pts.length > 0) return pts.length >= 3 ? pts : null; // only the outer, first subpath
        cur = at(take(), take());
        start = cur;
        pts.push(cur);
        cmd = rel ? "l" : "L"; // further pairs after M are implicit lines
        break;
      }
      case "L":
        cur = at(take(), take());
        pts.push(cur);
        break;
      case "H":
        cur = { x: rel ? cur.x + take() : take(), y: cur.y };
        pts.push(cur);
        break;
      case "V":
        cur = { x: cur.x, y: rel ? cur.y + take() : take() };
        pts.push(cur);
        break;
      case "C": {
        const c1 = at(take(), take());
        const c2 = at(take(), take());
        const end = at(take(), take());
        for (let s = 1; s <= CURVE_SAMPLES; s++) {
          const t = s / CURVE_SAMPLES;
          const u = 1 - t;
          pts.push({
            x: u * u * u * cur.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t * t * t * end.x,
            y: u * u * u * cur.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t * t * t * end.y,
          });
        }
        cur = end;
        break;
      }
      case "Q": {
        const c = at(take(), take());
        const end = at(take(), take());
        for (let s = 1; s <= CURVE_SAMPLES; s++) {
          const t = s / CURVE_SAMPLES;
          const u = 1 - t;
          pts.push({ x: u * u * cur.x + 2 * u * t * c.x + t * t * end.x, y: u * u * cur.y + 2 * u * t * c.y + t * t * end.y });
        }
        cur = end;
        break;
      }
      case "A": {
        const rx = take();
        const ry = take();
        const rot = take();
        const large = take() !== 0;
        const sweep = take() !== 0;
        const end = at(take(), take());
        pts.push(...arcPoints(cur, rx, ry, rot, large, sweep, end));
        cur = end;
        break;
      }
      case "Z":
        cur = start;
        return pts.length >= 3 ? pts : null; // the outer contour is closed: done
      default:
        return null; // S, T and anything else: not worth guessing at
    }
    if (i < tokens.length && !isNum() && !/^[a-zA-Z]$/.test(tokens[i])) return null;
  }
  return pts.length >= 3 ? pts : null;
}

/**
 * The outer outline of an authored stencil, or null when it has none worth using (pictograms,
 * vendor icons, anything whose first element is not a plain shape).
 */
export function outlineFromSvgBody(svgBody: string): Outline | null {
  const m = /^\s*<(rect|ellipse|circle|polygon|path)\b([^>]*)>/i.exec(svgBody);
  if (!m) return null;
  const [, tag, attrs] = m;
  switch (tag.toLowerCase()) {
    case "rect": {
      const x = num(attrs, "x") ?? 0;
      const y = num(attrs, "y") ?? 0;
      const w = num(attrs, "width");
      const h = num(attrs, "height");
      if (w === null || h === null) return null;
      return [
        { x, y },
        { x: x + w, y },
        { x: x + w, y: y + h },
        { x, y: y + h },
      ];
    }
    case "circle": {
      const r = num(attrs, "r");
      return r === null ? null : ellipse(num(attrs, "cx") ?? 0, num(attrs, "cy") ?? 0, r, r);
    }
    case "ellipse": {
      const rx = num(attrs, "rx");
      const ry = num(attrs, "ry");
      return rx === null || ry === null ? null : ellipse(num(attrs, "cx") ?? 0, num(attrs, "cy") ?? 0, rx, ry);
    }
    case "polygon": {
      const pm = /points\s*=\s*["']([^"']+)["']/i.exec(attrs);
      const n = pm?.[1].match(/-?[\d.]+/g)?.map(Number) ?? [];
      if (n.length < 6) return null;
      const out: Point[] = [];
      for (let k = 0; k + 1 < n.length; k += 2) out.push({ x: n[k], y: n[k + 1] });
      return out;
    }
    case "path": {
      const dm = /\sd\s*=\s*["']([^"']+)["']/i.exec(` ${attrs}`);
      return dm ? pathOutline(dm[1]) : null;
    }
  }
  return null;
}

const cache = new WeakMap<StencilDef, Outline | null>();

/** A stencil's outline, read once. Null for icons and anything without a usable outline. */
export function stencilOutline(stencil: StencilDef, isIcon: boolean): Outline | null {
  if (stencil.raw || isIcon) return null;
  if (!cache.has(stencil)) cache.set(stencil, outlineFromSvgBody(stencil.svgBody));
  return cache.get(stencil)!;
}

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Where a ray from `from` toward the box's centre first meets the outline — the point an edge end
 * should touch. `outline` is in 0..100 space and is scaled onto the box and turned by `rotation`
 * (degrees, about the centre); null means the box itself. Falls back to `from` if, somehow, the
 * ray meets nothing.
 */
export function pointOnOutline(box: Box, outline: Outline | null, rotation: number, from: Point): Point {
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  const unit: Outline = outline ?? [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 100, y: 100 },
    { x: 0, y: 100 },
  ];
  const rad = (rotation * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const poly = unit.map((p) => {
    const x = box.x + (p.x / 100) * box.w - cx;
    const y = box.y + (p.y / 100) * box.h - cy;
    return { x: cx + x * cos - y * sin, y: cy + x * sin + y * cos };
  });

  // A ray from the centre out through `from`, unbounded; the outermost crossing is the outline as
  // seen from outside in that direction. Casting outward rather than inward from `from` matters
  // when the outline pokes past the box — a rotated square's corner does — because then `from`
  // lies inside the shape and an inward ray would never meet its edge.
  const dx = from.x - cx;
  const dy = from.y - cy;
  if (Math.abs(dx) < 1e-12 && Math.abs(dy) < 1e-12) return from;
  let best = -Infinity;
  for (let k = 0; k < poly.length; k++) {
    const a = poly[k];
    const b = poly[(k + 1) % poly.length];
    const ex = b.x - a.x;
    const ey = b.y - a.y;
    const denom = dx * ey - dy * ex;
    if (Math.abs(denom) < 1e-12) continue;
    const t = ((a.x - cx) * ey - (a.y - cy) * ex) / denom;
    const u = ((a.x - cx) * dy - (a.y - cy) * dx) / denom;
    if (t >= 0 && u >= -1e-9 && u <= 1 + 1e-9 && t > best) best = t;
  }
  if (!Number.isFinite(best)) return from;
  return { x: cx + dx * best, y: cy + dy * best };
}
