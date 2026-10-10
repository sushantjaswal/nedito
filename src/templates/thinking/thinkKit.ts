// Shared pieces for the Thinking & Planning templates.
//
// These are the templates people reach for before they know what they think, so the styling is
// quiet: one accent for the thing at the centre, muted everything else, and no notation to learn.
import { createDefaultLayers } from "../../model/layers";
import type { DEdge, Diagram, ShapeNode, StyleMap } from "../../model/types";
import { tid } from "../starters/basicFlowchart";

const INK = "#1E2733";
const MUTED = "#66707D";

const BASE: StyleMap = { stroke: MUTED, strokeWidth: 1.5, startArrow: "none", endArrow: "none" };

/** A hierarchy line. No arrowhead: a tree's direction is its layout. */
export const BRANCH: StyleMap = { ...BASE, edgeStyle: "orthogonal" };
/** A concept-map link, which carries a verb and therefore a direction. */
export const RELATES: StyleMap = { ...BASE, edgeStyle: "curved", endArrow: "open" };
/** A decision-tree branch, labelled with the choice or the outcome. */
export const CHOICE: StyleMap = { ...BASE, edgeStyle: "orthogonal", endArrow: "classic" };

export const PLAIN: StyleMap = { fill: "#FFFFFF", stroke: INK, strokeWidth: 1 };
export const ACCENT: StyleMap = { fill: "#EEEBFC", stroke: "#6D5AE6", strokeWidth: 1.5 };
export const SOFT: StyleMap = { fill: "#F4F5F7", stroke: MUTED, strokeWidth: 1 };

/**
 * A Venn set: a translucent fill so the overlaps read as their own regions, with a solid border
 * and a solid label. `fillOpacity` — not `opacity` — is what makes that possible; the whole-node
 * opacity the Style panel already had would have faded the outline and the text with it.
 */
export function set(fill: string, stroke: string): StyleMap {
  return { fill, stroke, strokeWidth: 2, fillOpacity: 0.4 };
}

export const SET_COLOURS = {
  violet: set("#6D5AE6", "#4B3BC4"),
  green: set("#1E8E5A", "#146B44"),
  amber: set("#C9820A", "#8A5A06"),
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
): ShapeNode {
  return {
    id: tid(slug),
    type: "shape",
    shapeRef,
    position: { x, y },
    size: { w, h },
    z,
    style,
    label: text ? { text, align: "center", fontSize: 11 } : undefined,
  };
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
 * A parent's children listed beneath it, indented, each joined by a line that drops from the
 * parent's left side and turns into the child's: the work-breakdown and sitemap convention. A
 * straight drop from the parent's middle to each child — the first version — ran the line to the
 * third child straight through the first two.
 */
export function indent(slug: string, parent: string, child: string): DEdge {
  const e = link(slug, parent, child, BRANCH, undefined, ["bottom", "left"]);
  return { ...e, source: { nodeId: e.source.nodeId, anchor: { x: 0.1, y: 1 } } };
}
