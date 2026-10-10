// Shared pieces for the Business & Process templates.
//
// These diagrams are read by people who do not draw diagrams, so the palette is deliberately
// flatter than the technical batches': few line styles, and colour used to separate groups
// rather than to encode meaning nobody will look up.
import { createDefaultLayers } from "../../model/layers";
import type { DEdge, DNode, Diagram, ShapeNode, StyleMap } from "../../model/types";
import { tid } from "../starters/basicFlowchart";

const INK = "#1E2733";
const MUTED = "#66707D";

const BASE: StyleMap = { stroke: MUTED, strokeWidth: 1.5, startArrow: "none", endArrow: "classic" };

/** A process step follows another. Orthogonal, because these are read as boxes and arrows. */
export const FLOW: StyleMap = { ...BASE, edgeStyle: "orthogonal" };
/** A straight run, for long hops where an elbow only adds noise. */
export const DIRECT: StyleMap = { ...BASE, edgeStyle: "straight" };
/** Reporting lines in an org chart: a hierarchy, not a flow, so no arrowhead. */
export const REPORTS: StyleMap = { edgeStyle: "orthogonal", stroke: MUTED, strokeWidth: 1.5, startArrow: "none", endArrow: "none" };
/** BPMN message flow: dashed, crossing a pool boundary. */
export const MESSAGE: StyleMap = { ...BASE, edgeStyle: "orthogonal", dash: "dashed", endArrow: "open" };
/** A fishbone rib — plain, angled, no head; the spine's arrow carries the direction. */
export const RIB: StyleMap = { edgeStyle: "straight", stroke: MUTED, strokeWidth: 1.25, startArrow: "none", endArrow: "none" };

export const PLAIN: StyleMap = { fill: "#FFFFFF", stroke: INK, strokeWidth: 1 };
export const ACCENT: StyleMap = { fill: "#EEEBFC", stroke: "#6D5AE6", strokeWidth: 1.25 };
export const ZONE: StyleMap = { fill: "none", stroke: MUTED, strokeWidth: 1 };
/**
 * A container drawn behind its contents.
 *
 * Unfilled, for the same reason the cloud templates' boundaries are (CLAUDE_HISTORY.md D69):
 * React Flow draws every node above the edge layer, so a filled container paints over the links
 * running through it.
 */
export const CONTAINER: StyleMap = { fill: "none", stroke: "#98A1AD", strokeWidth: 1.25 };

/** The four SWOT quadrants and the canvas blocks read by group, so they are tinted by group. */
export const TINTS = {
  good: { fill: "#F1FAF5", stroke: "#1E8E5A", strokeWidth: 1 } as StyleMap,
  bad: { fill: "#FDF3DF", stroke: "#C9820A", strokeWidth: 1 } as StyleMap,
  cool: { fill: "#EEF2FB", stroke: "#4B63C4", strokeWidth: 1 } as StyleMap,
  warm: { fill: "#FBF0F3", stroke: "#B4426A", strokeWidth: 1 } as StyleMap,
  neutral: { fill: "#F4F5F7", stroke: "#66707D", strokeWidth: 1 } as StyleMap,
};

export type Side = "top" | "right" | "bottom" | "left";

export function node(
  slug: string,
  shapeRef: string,
  text: string,
  x: number,
  y: number,
  w: number,
  h: number,
  z: number,
  style: StyleMap = PLAIN,
  align: "left" | "center" | "right" = "center",
): ShapeNode {
  return {
    id: tid(slug),
    type: "shape",
    shapeRef,
    position: { x, y },
    size: { w, h },
    z,
    style,
    label: text ? { text, align, fontSize: 11 } : undefined,
  };
}

/** A titled block whose body text is left-aligned, as a canvas or journey cell wants. */
export function block(
  slug: string,
  title: string,
  body: string,
  x: number,
  y: number,
  w: number,
  h: number,
  z: number,
  style: StyleMap,
): ShapeNode {
  const n = node(slug, "general/rect", `${title}\n\n${body}`, x, y, w, h, z, style);
  n.label = { text: `${title}\n\n${body}`, align: "center", fontSize: 11 };
  return n;
}

export function link(
  slug: string,
  from: string,
  to: string,
  style: StyleMap,
  text?: string,
  sides?: [Side, Side],
): DEdge {
  const edge: DEdge = {
    id: tid(slug),
    source: { nodeId: tid(from) },
    target: { nodeId: tid(to) },
    style: sides ? { ...style, sourceHandle: sides[0], targetHandle: sides[1] } : style,
  };
  if (text) edge.label = { text, fontSize: 10, color: MUTED };
  return edge;
}

export function page(slug: string, title: string, nodes: Diagram["nodes"], edges: DEdge[]): Diagram {
  return { id: tid(slug), title, layers: createDefaultLayers(), nodes, edges };
}

/**
 * A titled card, as SWOT grids and business model canvases are printed: a coloured header band
 * with the title in bold, over a body whose points read top-left as a bulleted list. Two shapes,
 * grouped, so each part is edited on its own and the list never runs into the title.
 */
export function card(
  slug: string,
  title: string,
  points: string[],
  x: number,
  y: number,
  w: number,
  h: number,
  z: number,
  tint: StyleMap,
  headH = 36,
): DNode[] {
  const accent = (tint.stroke as string) ?? MUTED;
  const head = node(`${slug}H`, "general/rect", title, x, y, w, headH, z, { fill: accent, stroke: accent, strokeWidth: 1 });
  head.label = { text: title, align: "left", fontSize: 13, bold: true, color: "#FFFFFF" };
  const text = points.map((p) => `•  ${p}`).join("\n");
  const body = node(slug, "general/rect", text, x, y + headH, w, h - headH, z, { ...tint, verticalAlign: "top" });
  body.label = { text, align: "left", fontSize: 12 };
  const group: DNode = {
    id: tid(`${slug}G`),
    type: "group",
    position: { x, y },
    size: { w, h },
    z: z - 1,
    style: {},
    childIds: [head.id, body.id],
  };
  return [body, head, group];
}
