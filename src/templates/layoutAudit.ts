// A template's layout, checked rather than eyeballed.
//
// A template is the user's starting point, so every flaw in it is copied into every diagram made
// from it. These are the flaws that made the first set look amateur, each one found by rendering
// all of them: a line running through a box it does not connect, a line's label sitting on a
// shape, two shapes overlapping, text spilling out of its shape, and two unrelated lines sharing a
// track so the reader cannot tell which goes where. The audit uses the renderers' own geometry
// (the same edge paths, label positions and label areas), so it sees exactly what a user sees.
import { captionAbove, labelArea, labelHangsBelow } from "../canvas/labelLayout";
import { imageLabelBox } from "../canvas/imageGeometry";
import { buildEdgePath } from "../canvas/edgeRouting";
import { pathPoints, type Point } from "../canvas/edgeGeometry";
import { edgePathInput, labelHalfWidth } from "../file/svgExport";
import { getStencil } from "../library/stencils";
import type { DNode, Diagram } from "../model/types";

export interface LayoutIssue {
  kind: "edge-through-shape" | "label-on-shape" | "shapes-overlap" | "text-overflow" | "shared-track";
  detail: string;
}

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Average glyph width as a share of the font size — the exporter's own estimate. */
const GLYPH = 0.58;

const boxOf = (n: DNode): Box => ({ x: n.position.x, y: n.position.y, w: n.size.w, h: n.size.h });
const contains = (a: Box, b: Box, tol = 1) =>
  b.x >= a.x - tol && b.y >= a.y - tol && b.x + b.w <= a.x + a.w + tol && b.y + b.h <= a.y + a.h + tol;
const overlap = (a: Box, b: Box) =>
  Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) *
  Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
const inside = (p: Point, b: Box, inset: number) =>
  p.x > b.x + inset && p.x < b.x + b.w - inset && p.y > b.y + inset && p.y < b.y + b.h - inset;

function name(n: DNode): string {
  return (n.label?.text.split("\n")[0] || n.id).trim();
}

/** The caption hung below a picture or an icon, as a box. */
function captionBox(n: DNode): Box | null {
  if (n.type !== "shape" || !n.label?.text) return null;
  if (!labelHangsBelow(n.shapeRef, getStencil(n.shapeRef), n.style)) {
    // A label area reaching outside the shape, like a UML interface's name above its ball.
    const a = labelArea(getStencil(n.shapeRef), n.size.w, n.size.h, n.style);
    if (a.x >= 0 && a.y >= 0 && a.x + a.w <= n.size.w && a.y + a.h <= n.size.h) return null;
    const half = Math.min(a.w / 2, labelHalfWidth(n.label));
    const lines = n.label.text.split("\n").length * (n.label.fontSize ?? 12) * 1.25;
    return { x: n.position.x + a.x + a.w / 2 - half, y: n.position.y + a.y + (a.h - lines) / 2, w: half * 2, h: lines };
  }
  const size = n.label.fontSize ?? 12;
  const lines = n.label.text.split("\n");
  const b = imageLabelBox(n.size.h, lines.length, size, captionAbove(n.style));
  const half = labelHalfWidth(n.label);
  return { x: n.position.x + n.size.w / 2 - half, y: n.position.y + b.top, w: half * 2, h: b.bottom - b.top };
}

/** Points along a sampled path, every `step` px. */
function densify(points: Point[], step = 2): Point[] {
  const out: Point[] = [];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / step));
    for (let k = 0; k < n; k++) out.push({ x: a.x + ((b.x - a.x) * k) / n, y: a.y + ((b.y - a.y) * k) / n });
  }
  if (points.length) out.push(points[points.length - 1]);
  return out;
}

export function auditDiagram(diagram: Diagram): LayoutIssue[] {
  const issues: LayoutIssue[] = [];
  const nodes = diagram.nodes.filter((n) => n.type !== "group");
  const byId = new Map(diagram.nodes.map((n) => [n.id, n]));

  // A container is anything another node sits wholly inside: a boundary, a lane, a VPC.
  const isContainer = new Set<string>();
  for (const a of nodes) for (const b of nodes) if (a !== b && contains(boxOf(a), boxOf(b))) isContainer.add(a.id);
  const ancestorsOf = (n: DNode) => nodes.filter((c) => c !== n && isContainer.has(c.id) && contains(boxOf(c), boxOf(n)));

  const solids = nodes.filter((n) => !isContainer.has(n.id));
  const captions = new Map<string, Box>();
  for (const n of nodes) {
    const c = captionBox(n);
    if (c) captions.set(n.id, c);
  }

  // ---------------------------------------------------------------- shapes
  for (let i = 0; i < solids.length; i++) {
    for (let j = i + 1; j < solids.length; j++) {
      const a = solids[i];
      const b = solids[j];
      if (overlap(boxOf(a), boxOf(b)) > 4) issues.push({ kind: "shapes-overlap", detail: `${name(a)} / ${name(b)}` });
    }
  }
  for (const [id, cap] of captions) {
    for (const n of solids) {
      if (n.id === id) continue;
      if (overlap(cap, boxOf(n)) > 4) issues.push({ kind: "shapes-overlap", detail: `caption of ${name(byId.get(id)!)} / ${name(n)}` });
    }
  }

  for (const n of nodes) {
    if (n.type !== "shape" || !n.label?.text || captions.has(n.id)) continue;
    const area = labelArea(getStencil(n.shapeRef), n.size.w, n.size.h, n.style);
    const size = n.label.fontSize ?? 12;
    const lines = n.label.text.split("\n");
    const [across, along] = area.vertical ? [area.h, area.w] : [area.w, area.h];
    const widest = Math.max(...lines.map((l) => l.length)) * size * GLYPH * (n.label.bold ? 1.06 : 1);
    if (widest > across - 12) issues.push({ kind: "text-overflow", detail: `${name(n)}: ${Math.round(widest)}px of text in ${Math.round(across)}px` });
    else if (lines.length * size * 1.25 > along - 4)
      issues.push({ kind: "text-overflow", detail: `${name(n)}: ${lines.length} lines in ${Math.round(along)}px` });
  }

  // ---------------------------------------------------------------- edges
  const tracks: { id: string; ends: Set<string>; cells: Set<string> }[] = [];
  for (const edge of diagram.edges) {
    const input = edgePathInput(edge, byId);
    // A free-standing line (no shape at an end) is a drawing, not a connection to audit.
    if (!input || !edge.source.nodeId || !edge.target.nodeId) continue;
    const { path, labelPos } = buildEdgePath(input);
    const pts = densify(pathPoints(path));
    const ends = new Set([edge.source.nodeId, edge.target.nodeId]);
    const src = byId.get(edge.source.nodeId)!;
    const tgt = byId.get(edge.target.nodeId)!;
    const related = new Set([...ends, ...ancestorsOf(src).map((n) => n.id), ...ancestorsOf(tgt).map((n) => n.id)]);
    const what = `${name(src)} → ${name(tgt)}`;

    const start = pts[0];
    const end = pts[pts.length - 1];
    const body = pts.filter((p) => Math.hypot(p.x - start.x, p.y - start.y) > 4 && Math.hypot(p.x - end.x, p.y - end.y) > 4);
    for (const n of solids) {
      if (related.has(n.id)) continue;
      if (body.some((p) => inside(p, boxOf(n), 2))) issues.push({ kind: "edge-through-shape", detail: `${what} crosses ${name(n)}` });
    }
    for (const [id, cap] of captions) {
      if (body.some((p) => inside(p, cap, 1))) issues.push({ kind: "edge-through-shape", detail: `${what} crosses the caption of ${name(byId.get(id)!)}` });
    }

    if (edge.label?.text) {
      const half = labelHalfWidth(edge.label);
      const size = edge.label.fontSize ?? 11;
      const lb: Box = { x: labelPos.x - half - 3, y: labelPos.y - size * 0.8, w: half * 2 + 6, h: size * 1.6 };
      for (const n of solids) if (overlap(lb, boxOf(n)) > 2) issues.push({ kind: "label-on-shape", detail: `"${edge.label.text}" on ${name(n)}` });
      for (const [id, cap] of captions) if (overlap(lb, cap) > 2) issues.push({ kind: "label-on-shape", detail: `"${edge.label.text}" on the caption of ${name(byId.get(id)!)}` });
    }

    tracks.push({ id: what, ends, cells: new Set(body.map((p) => `${Math.round(p.x / 3)},${Math.round(p.y / 3)}`)) });
  }

  // Two lines with no end in common running along the same track for more than a short stretch.
  for (let i = 0; i < tracks.length; i++) {
    for (let j = i + 1; j < tracks.length; j++) {
      const a = tracks[i];
      const b = tracks[j];
      if ([...a.ends].some((e) => b.ends.has(e))) continue;
      let shared = 0;
      for (const c of a.cells) if (b.cells.has(c)) shared++;
      if (shared > 8) issues.push({ kind: "shared-track", detail: `${a.id} / ${b.id}` });
    }
  }

  return issues;
}
