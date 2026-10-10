// Shared pieces for the Architecture & Cloud templates.
//
// Cloud icons are `raw` vendor SVGs: they carry their own brand colours and are never themed
// (see StencilDef and NOTICE). So a cloud template's job is layout, labelling and the boundary
// boxes the icon packs deliberately do not provide — a VNet, a VPC, a subnet, a namespace.
import { createDefaultLayers } from "../../model/layers";
import type { DEdge, Diagram, ShapeNode, StyleMap } from "../../model/types";
import { tid } from "../starters/basicFlowchart";

const INK = "#1E2733";
const MUTED = "#66707D";

const BASE: StyleMap = { edgeStyle: "orthogonal", stroke: MUTED, strokeWidth: 1.5, startArrow: "none", endArrow: "classic" };

/** A network link: traffic flows one way, and it is worth saying which. */
export const LINK: StyleMap = { ...BASE };
/** Peering and trunk links are two-way. */
export const PEERING: StyleMap = { ...BASE, startArrow: "classic" };
/** A management or telemetry path, drawn back so it does not compete with the data path. */
export const MANAGEMENT: StyleMap = { ...BASE, dash: "dashed", endArrow: "open", strokeWidth: 1.25 };
/** Straight runs, for long hops across a diagram where an elbow would only add noise. */
export const DIRECT: StyleMap = { ...BASE, edgeStyle: "straight" };

/**
 * A boundary box — VNet, VPC, subnet, availability zone, cluster.
 *
 * **Unfilled, and that is not a style choice.** React Flow draws every node above the edge
 * layer, so a filled container painted over the links running through it: the Azure hub's
 * icons appeared connected to nothing. An outline is also how AWS, Azure and Google all draw
 * these in their own reference architectures, and it leaves the box unclickable in the middle,
 * which is right for something that is background rather than content.
 */
export const BOUNDARY: StyleMap = { fill: "none", stroke: "#98A1AD", strokeWidth: 1.25, dash: "dashed" };
export const ZONE: StyleMap = { fill: "none", stroke: MUTED, strokeWidth: 1 };
export const ACCENT: StyleMap = { fill: "#EEEBFC", stroke: "#6D5AE6", strokeWidth: 1.25 };
export const PLAIN: StyleMap = { fill: "#FFFFFF", stroke: INK, strokeWidth: 1 };

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

/**
 * A labelled icon: the vendor glyph, its name hung beneath it.
 *
 * The name is the icon's own label, which the canvas and every export draw under an icon rather
 * than across it (canvas/labelLayout.ts) — so it moves, copies and deletes with the icon. It
 * used to be a separate text node, which a user could drag away from its icon, and which any
 * line leaving the icon downward ran straight through. Lines in these templates join icons at
 * their sides for that reason: the space below an icon belongs to its name.
 */
export function icon(slug: string, shapeRef: string, caption: string, x: number, y: number, z: number, size = 56): ShapeNode[] {
  return [node(slug, shapeRef, caption, x, y, size, size, z, {})];
}

/** A boundary box with its name at its top-left, the way every cloud vendor draws one. */
export function boundary(slug: string, title: string, x: number, y: number, w: number, h: number, style = BOUNDARY): ShapeNode[] {
  const box = node(slug, "general/rect", title, x, y, w, h, 0, { ...style, verticalAlign: "top" });
  box.label = { text: title, align: "left", fontSize: 11, bold: true, color: (style.stroke as string) ?? MUTED };
  return [box];
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
    // Left unset, every edge anchors at its node's top (React Flow's first-handle
    // fallback) — which in a topology drawing means every link loops overhead.
    style: sides ? { ...style, sourceHandle: sides[0], targetHandle: sides[1] } : style,
  };
  if (text) edge.label = { text, fontSize: 10, color: MUTED };
  return edge;
}

export function page(slug: string, title: string, nodes: Diagram["nodes"], edges: DEdge[]): Diagram {
  return { id: tid(slug), title, layers: createDefaultLayers(), nodes, edges };
}
