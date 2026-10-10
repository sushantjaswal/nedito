// Starter template: a plain flowchart.
//
// Content bar from the spec: realistic generic placeholders, never lorem ipsum, never real
// company names, laid out on the grid, readable at 100% after fit-to-content, and drawn with
// the app's own default styles so it looks like something the user drew.
import { APP_VERSION } from "../../app/version";
import type { DiagramDocument, DEdge, Diagram, ShapeNode, StyleMap } from "../../model/types";
import { createDefaultLayers } from "../../model/layers";

const INK = "#1E2733";
export const SHAPE_STYLE: StyleMap = { fill: "#FFFFFF", stroke: INK, strokeWidth: 1 };
export const EDGE_STYLE: StyleMap = {
  edgeStyle: "orthogonal",
  stroke: INK,
  strokeWidth: 1.25,
  startArrow: "none",
  endArrow: "classic",
};

/**
 * Ids inside a template are readable rather than random: the files are hand-maintained, and
 * applying re-issues every id anyway (applyTemplate.ts), so nothing here ever reaches a user's
 * document. Padded to 21 characters so they satisfy the format's id rule as written.
 */
export function tid(slug: string): string {
  if (slug.length > 21) throw new Error(`template id slug too long: ${slug}`);
  return slug.padEnd(21, "_");
}

/**
 * Each flowchart role in its own soft colour, as the better-designed flowchart libraries do it:
 * start and end, input and output, and decisions are told apart at a glance, while plain steps
 * stay white. A role keeps its colour in every starter, so they read as one family.
 */
export const ROLE_STYLE: Record<string, StyleMap> = {
  "flowchart/terminator": { fill: "#EEEBFC", stroke: "#6D5AE6", strokeWidth: 1.25 },
  "flowchart/data": { fill: "#E8F1FB", stroke: "#3C7FC0", strokeWidth: 1 },
  "flowchart/document": { fill: "#E8F1FB", stroke: "#3C7FC0", strokeWidth: 1 },
  "flowchart/decision": { fill: "#FFF4DE", stroke: "#C98A0B", strokeWidth: 1 },
};

export function node(
  slug: string,
  shapeRef: string,
  text: string,
  x: number,
  y: number,
  w: number,
  h: number,
  z: number,
): ShapeNode {
  return {
    id: tid(slug),
    type: "shape",
    shapeRef,
    position: { x, y },
    size: { w, h },
    z,
    style: ROLE_STYLE[shapeRef] ?? SHAPE_STYLE,
    label: { text, align: "center" },
  };
}

export type Side = "top" | "right" | "bottom" | "left";

/**
 * An edge between two shapes, leaving and arriving on the named sides.
 *
 * `sides` defaults to bottom-to-top, the direction a flowchart reads. It was once not set at all,
 * and an unnamed end falls back to React Flow's first handle, *top* (CLAUDE_HISTORY.md D67) — so
 * the Start → Receive edge left Start's top, looped up and came back down through Start itself.
 */
export function edge(slug: string, from: string, to: string, text?: string, sides: [Side, Side] = ["bottom", "top"]): DEdge {
  const e: DEdge = {
    id: tid(slug),
    source: { nodeId: tid(from) },
    target: { nodeId: tid(to) },
    style: { ...EDGE_STYLE, sourceHandle: sides[0], targetHandle: sides[1] },
  };
  if (text) e.label = { text, fontSize: 11, color: "#66707D" };
  return e;
}

export function templateDoc(title: string, diagrams: Diagram[]): DiagramDocument {
  const now = "2026-09-23T00:00:00.000Z";
  return {
    formatVersion: 2,
    meta: { title, created: now, modified: now, appVersion: APP_VERSION },
    rootDiagramIds: [diagrams[0].id],
    diagrams: Object.fromEntries(diagrams.map((d) => [d.id, d])),
  };
}

const page: Diagram = {
  id: tid("dFlowchart"),
  title: "Flowchart",
  layers: createDefaultLayers(),
  nodes: [
    node("fStart", "flowchart/terminator", "Start", 300, 40, 160, 56, 1),
    node("fReceive", "flowchart/data", "Receive request", 290, 150, 180, 60, 2),
    node("fCheck", "flowchart/decision", "Details complete?", 280, 260, 200, 100, 3),
    node("fProcess", "flowchart/process", "Process request", 300, 410, 160, 60, 4),
    node("fConfirm", "flowchart/document", "Send confirmation", 295, 520, 170, 70, 5),
    node("fAskMore", "flowchart/process", "Request missing details", 560, 280, 180, 60, 6),
    node("fEnd", "flowchart/terminator", "Done", 300, 640, 160, 56, 7),
  ],
  edges: [
    edge("feStart", "fStart", "fReceive"),
    edge("feCheck", "fReceive", "fCheck"),
    edge("feYes", "fCheck", "fProcess", "Yes"),
    edge("feNo", "fCheck", "fAskMore", "No", ["right", "left"]),
    // The loop back rejoins at Receive's right side rather than piling onto its top.
    edge("feBack", "fAskMore", "fReceive", undefined, ["top", "right"]),
    edge("feConfirm", "fProcess", "fConfirm"),
    edge("feEnd", "fConfirm", "fEnd"),
  ],
};

export default templateDoc("Flowchart", [page]);
