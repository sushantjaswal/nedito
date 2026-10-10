// Shared pieces for the Data templates.
//
// The crow's-foot edge styles are the point, and the same rule applies as in umlKit: the marks
// went into the Style panel first (canvas/arrowheads.ts), so every relationship drawn below is
// one a user can draw by hand. Chen notation needs no special line ends at all — its cardinality
// is a text label on the line — which is why only the crow's-foot dialect has styles here.
import { createDefaultLayers } from "../../model/layers";
import type { DEdge, Diagram, ShapeNode, StyleMap } from "../../model/types";
import { tid } from "../starters/basicFlowchart";

const INK = "#1E2733";
const MUTED = "#66707D";

const BASE: StyleMap = { edgeStyle: "straight", stroke: INK, strokeWidth: 1.25, startArrow: "none", endArrow: "none" };

/** Chen: a plain line. The cardinality is the label, not the line end. */
export const CHEN_LINK: StyleMap = { ...BASE };

/** Chen: the double line of a total-participation constraint. */
export const CHEN_TOTAL: StyleMap = { ...BASE, strokeWidth: 3 };

/**
 * Crow's foot, read source-to-target: "one <source> has many <target>s" is ER_ONE_TO_MANY.
 * Both ends carry a mark, because in this notation an unmarked end means nothing was said.
 */
export const ER_ONE_TO_MANY: StyleMap = { ...BASE, startArrow: "er-one", endArrow: "er-zero-or-many" };
export const ER_ONE_TO_MANY_REQUIRED: StyleMap = { ...BASE, startArrow: "er-one", endArrow: "er-one-or-many" };
export const ER_ONE_TO_ONE: StyleMap = { ...BASE, startArrow: "er-one", endArrow: "er-zero-or-one" };
export const ER_MANY_TO_MANY: StyleMap = { ...BASE, startArrow: "crows-foot", endArrow: "crows-foot" };

/** A DFD data flow: directed, labelled with the data that moves. */
export const FLOW: StyleMap = { ...BASE, edgeStyle: "orthogonal", endArrow: "classic" };
/** A flow drawn straight, for the context diagram's long runs to external entities. */
export const FLOW_STRAIGHT: StyleMap = { ...BASE, endArrow: "classic" };

/** A pipeline hop. Curved, matching the app's own default edge style. */
export const PIPE: StyleMap = { ...BASE, edgeStyle: "curved", endArrow: "classic", stroke: MUTED, strokeWidth: 1.5 };

export const PLAIN: StyleMap = { fill: "#FFFFFF", stroke: INK, strokeWidth: 1 };
export const ACCENT: StyleMap = { fill: "#EEEBFC", stroke: "#6D5AE6", strokeWidth: 1.25 };
export const MUTED_FILL: StyleMap = { fill: "#F4F5F7", stroke: MUTED, strokeWidth: 1 };

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

export type Side = "top" | "right" | "bottom" | "left";

/**
 * An edge between two shapes.
 *
 * `sides` names which border each end leaves from. It matters more here than in most templates:
 * left unset, every edge anchors at the node's *top* — React Flow falls back to the first
 * declared handle (see canvas/edgeRouting.ts) — so a row of tables ends up lassoed together
 * over their own heads instead of joined side to side. Diagrams of this kind are read along
 * their lines, so the lines have to leave from the right places.
 */
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
