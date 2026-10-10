// Starter template: a mind map.
//
// Curved edges and no arrowheads on purpose — a mind map shows association, not flow, and an
// arrowhead would assert a direction the notation does not have.
import { createDefaultLayers } from "../../model/layers";
import type { DEdge, Diagram, StyleMap } from "../../model/types";
import { node, templateDoc, tid } from "./basicFlowchart";

const BRANCH_EDGE: StyleMap = {
  edgeStyle: "curved",
  stroke: "#66707D",
  strokeWidth: 1.5,
  startArrow: "none",
  endArrow: "none",
};

type Side = "top" | "right" | "bottom" | "left";

/**
 * A branch, leaving and arriving on the named sides.
 *
 * Unnamed, both ends fell back to React Flow's first handle, *top*, so every branch arced up and
 * over its own box — the first screenshot in the D67 bug report was this template.
 */
function branchEdge(slug: string, from: string, to: string, sides: [Side, Side]): DEdge {
  return {
    id: tid(slug),
    source: { nodeId: tid(from) },
    target: { nodeId: tid(to) },
    style: { ...BRANCH_EDGE, sourceHandle: sides[0], targetHandle: sides[1] },
  };
}

const CENTRE: StyleMap = { fill: "#6D5AE6", stroke: "#4B3BC4", strokeWidth: 1.5 };

/** One hue per branch, carried by the theme, its leaves and every line between them. */
const HUES = [
  { fill: "#E8F1FB", stroke: "#3C7FC0" },
  { fill: "#E7F6EE", stroke: "#1F8A5B" },
  { fill: "#FFF4DE", stroke: "#C98A0B" },
  { fill: "#FCEBF0", stroke: "#B83E62" },
];

const THEME_W = 170;
const LEAF_W = 150;

/**
 * A theme and its two leaves, spreading outward on one side of the centre. Branches read
 * left and right of the centre, leaves further out still, the layout mind-mapping tools default to.
 */
function branch(i: number, side: "left" | "right", title: string, leaves: [string, string], themeY: number) {
  const hue = HUES[i];
  const themeX = side === "left" ? 240 : 960;
  const leafX = side === "left" ? 40 : 1180;
  const theme = { ...node(`mTheme${i}`, "general/rounded-rect", title, themeX, themeY, THEME_W, 56, i + 1), style: { ...hue, strokeWidth: 1.5 } };
  theme.label = { text: title, align: "center", bold: true };
  const leafNodes = leaves.map((text, k) => ({
    ...node(`mLeaf${i}${k}`, "general/rounded-rect", text, leafX, themeY - 42 + k * 84, LEAF_W, 40, 10 + i * 2 + k),
    style: { fill: "#FFFFFF", stroke: hue.stroke, strokeWidth: 1 },
  }));
  const out: Side = side === "left" ? "left" : "right";
  const into: Side = side === "left" ? "right" : "left";
  const line = { ...BRANCH_EDGE, stroke: hue.stroke };
  const edges: DEdge[] = [
    { ...branchEdge(`meTheme${i}`, "mCentre", `mTheme${i}`, [out, into]), style: { ...line, strokeWidth: 2.5, sourceHandle: out, targetHandle: into } },
    ...leafNodes.map((_, k) => ({
      ...branchEdge(`meLeaf${i}${k}`, `mTheme${i}`, `mLeaf${i}${k}`, [out, into]),
      style: { ...line, sourceHandle: out, targetHandle: into },
    })),
  ];
  return { nodes: [theme, ...leafNodes], edges };
}

const branches = [
  branch(0, "left", "Goals", ["Grow sign-ups", "Enter a new region"], 170),
  branch(1, "right", "Audience", ["Small teams", "Agencies"], 170),
  branch(2, "left", "Risks", ["Tight timeline", "Fixed budget"], 470),
  branch(3, "right", "Channels", ["Webinar", "Partner e-mail"], 470),
];

const page: Diagram = {
  id: tid("dMindMap"),
  title: "Mind map",
  layers: createDefaultLayers(),
  nodes: [
    {
      ...node("mCentre", "general/ellipse", "Product launch", 560, 300, 220, 110, 20),
      style: CENTRE,
      label: { text: "Product launch", align: "center", bold: true, fontSize: 15 },
    },
    ...branches.flatMap((b) => b.nodes),
  ],
  edges: branches.flatMap((b) => b.edges),
};

export default templateDoc("Mind map", [page]);
