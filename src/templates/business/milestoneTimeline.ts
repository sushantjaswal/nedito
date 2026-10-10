// Milestone timeline — evenly spaced, deliberately not time-scaled.
//
// The spec is explicit about this, and it is worth restating: the gaps between these milestones
// carry no meaning. A time-scaled axis needs a model that knows about dates, which Nedito does
// not have, and a diagram whose spacing *looks* proportional while being arbitrary is worse than
// one that plainly is not. Milestones alternate above and below the line so long labels have
// room without colliding.
//
// Drawn as roadmap timelines are: an arrowed axis running through a marker per milestone, each
// marker coloured by status (done, under way, planned) and its date hung on the side away from
// its card, so the stem from card to marker never crosses the date. A key explains the colours.
// The axis is a chain of lines between the markers, so it stays joined when a marker is moved.
import type { DEdge, DNode, StyleMap } from "../../model/types";
import { node, page } from "./bizKit";
import { templateDoc, tid } from "../starters/basicFlowchart";

const TEXT = "general/text";
const AXIS_Y = 290;
const X0 = 150;
const STEP = 220;
const NONE: StyleMap = { fill: "none", stroke: "none" };

type Status = "done" | "doing" | "planned";
const STATUS: Record<Status, { colour: string; tint: string; word: string }> = {
  done: { colour: "#1E8E5A", tint: "#F1FAF5", word: "Done" },
  doing: { colour: "#6D5AE6", tint: "#F3F1FD", word: "Under way" },
  planned: { colour: "#8C95A1", tint: "#F4F5F7", word: "Planned" },
};

const MILESTONES: [string, string, string, Status][] = [
  ["Q1 2027", "Discovery complete", "Research signed off", "done"],
  ["Q2 2027", "Pilot launched", "Three customers live", "done"],
  ["Q3 2027", "General availability", "Open to everyone", "doing"],
  ["Q4 2027", "Second region live", "EU data centre", "planned"],
  ["Q1 2028", "Partner programme", "First ten partners", "planned"],
  ["Q2 2028", "Break even", "Monthly costs covered", "planned"],
];

const AXIS: StyleMap = { edgeStyle: "straight", stroke: "#3C4A5C", strokeWidth: 3, startArrow: "none", endArrow: "none" };
const STEM: StyleMap = { edgeStyle: "straight", stroke: "#98A1AD", strokeWidth: 1.25, startArrow: "none", endArrow: "none" };

function edge(slug: string, from: string, to: string, style: StyleMap, sides: [string, string]): DEdge {
  return { id: tid(slug), source: { nodeId: tid(from) }, target: { nodeId: tid(to) }, style: { ...style, sourceHandle: sides[0], targetHandle: sides[1] } };
}

const milestoneNodes: DNode[] = MILESTONES.flatMap(([when, what, detail, status], i) => {
  const x = X0 + i * STEP;
  const above = i % 2 === 0;
  const s = STATUS[status];
  const dot = node(`tDot${i}`, "general/circle", when, x - 11, AXIS_Y - 11, 22, 22, 4 + i, {
    fill: s.colour,
    stroke: "#FFFFFF",
    strokeWidth: 2,
    // The date hangs on the side away from the card.
    verticalLabelPosition: above ? "bottom" : "top",
  });
  dot.label = { text: when, align: "center", fontSize: 11, bold: true, color: s.colour };
  const box = node(`tBox${i}`, "general/rounded-rect", `${what}\n${detail}`, x - 95, above ? AXIS_Y - 160 : AXIS_Y + 86, 190, 74, 4 + i, {
    fill: s.tint,
    stroke: s.colour,
    strokeWidth: 1.25,
  });
  box.label = { text: `${what}\n${detail}`, align: "center", fontSize: 12 };
  return [dot, box];
});

const end = X0 + (MILESTONES.length - 1) * STEP + 120;

const diagram = page(
  "dTimeline",
  "Milestone timeline",
  [
    { ...node("tTitle", TEXT, "Product roadmap", 60, 24, 500, 30, 1, NONE), label: { text: "Product roadmap", align: "left", fontSize: 16, bold: true } },
    { ...node("tNote", TEXT, "Evenly spaced — the gaps are not to scale", 60, 56, 500, 22, 1, NONE), label: { text: "Evenly spaced — the gaps are not to scale", align: "left", fontSize: 12, color: "#66707D" } },
    // The axis runs from here, through every marker, to the arrowhead.
    node("tAxis", TEXT, "", X0 - 90, AXIS_Y - 1, 2, 2, 1, NONE),
    node("tAxisEnd", TEXT, "", end, AXIS_Y - 1, 2, 2, 1, NONE),
    ...milestoneNodes,
    ...(Object.keys(STATUS) as Status[]).map((k, i) => {
      const s = STATUS[k];
      const n = node(`tKey${i}`, "general/circle", s.word, end - 300 + i * 110, 30, 14, 14, 20, {
        fill: s.colour,
        stroke: "none",
        verticalLabelPosition: "bottom",
      });
      n.label = { text: s.word, align: "center", fontSize: 11, color: "#3C4A5C" };
      return n;
    }),
  ],
  [
    edge("tAxisIn", "tAxis", "tDot0", AXIS, ["right", "left"]),
    ...MILESTONES.slice(1).map((_, i) => edge(`tAxis${i}`, `tDot${i}`, `tDot${i + 1}`, AXIS, ["right", "left"])),
    { ...edge("tAxisOut", `tDot${MILESTONES.length - 1}`, "tAxisEnd", AXIS, ["right", "left"]), style: { ...AXIS, endArrow: "classic", sourceHandle: "right", targetHandle: "left" } },
    // The stems are drawn as edges so a milestone stays joined to its marker when it is moved.
    ...MILESTONES.map((_, i) => {
      const above = i % 2 === 0;
      return edge(`tStem${i}`, `tBox${i}`, `tDot${i}`, STEM, above ? ["bottom", "top"] : ["top", "bottom"]);
    }),
  ],
);

export default templateDoc("Milestone timeline", [diagram]);
