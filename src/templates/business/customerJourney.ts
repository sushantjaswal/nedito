// Customer journey map.
//
// A grid: stages across the top, and one row per lens — what the customer does, what they think,
// how they feel, where the friction is, and what to do about it. The emotion row is what makes it
// a journey map rather than a process diagram, so it is drawn as a curve through the highs and
// lows, each point coloured by mood and named underneath, rather than as another row of boxes.
//
// Laid out as journey maps are usually published: the persona and their goal above the grid,
// each row named in a band down the left, the stages as a filled header row, the customer's
// thoughts in quotes, and a closing row of opportunities so the map ends in action.
import type { DNode, StyleMap } from "../../model/types";
import { TINTS, link, node, page } from "./bizKit";
import { templateDoc } from "../starters/basicFlowchart";

const CELL = "general/rect";
const TEXT = "general/text";
const COL = 220;
const GAP = 8;
const X0 = 210;
const col = (i: number) => X0 + i * (COL + GAP);
const GRID_W = 5 * COL + 4 * GAP;

const STAGES = ["Aware", "Consider", "Buy", "Receive", "Support"];
const ACTIONS = ["Sees an ad", "Compares options", "Places an order", "Tracks the delivery", "Raises a query"];
const THOUGHTS = ["Is this for me?", "Is it worth it?", "Will it arrive in time?", "Where is it now?", "Will they fix it?"];
const PAINS = ["The ad is vague", "No clear comparison", "Too many form steps", "Tracking is out of date", "Slow first reply"];
const IDEAS = ["Show the next-day promise", "Add a comparison table", "One-page checkout", "Live tracking texts", "Reply within the hour"];

/** Mood from +2 (delighted) to -2 (upset), and the word for it. */
const MOODS: [number, string][] = [
  [1, "Curious"],
  [0, "Unsure"],
  [-1, "Frustrated"],
  [-2, "Anxious"],
  [1, "Relieved"],
];

const ROW = {
  stage: { y: 110, h: 44 },
  doing: { y: 162, h: 64 },
  thinking: { y: 234, h: 64 },
  feeling: { y: 306, h: 190 },
  friction: { y: 504, h: 64 },
  ideas: { y: 576, h: 64 },
};

const HEAD: StyleMap = { fill: "#F4F5F7", stroke: "#C4CAD3", strokeWidth: 1 };
const PLAIN_CELL: StyleMap = { fill: "#FFFFFF", stroke: "#C4CAD3", strokeWidth: 1 };
const MOOD_COLOUR = (v: number) => (v > 0 ? "#1E8E5A" : v === 0 ? "#C9820A" : "#B4426A");

function rowHead(slug: string, text: string, y: number, h: number): DNode {
  const n = node(slug, CELL, text, 60, y, 140, h, 1, HEAD);
  n.label = { text, align: "left", fontSize: 12, bold: true, color: "#3C4A5C" };
  return n;
}

function cells(prefix: string, texts: string[], y: number, h: number, style: StyleMap, italic = false): DNode[] {
  return texts.map((t, i) => {
    const n = node(`${prefix}${i}`, CELL, t, col(i), y, COL, h, 3, style);
    n.label = { text: t, align: "center", fontSize: 12, italic };
    return n;
  });
}

/** The emotion curve: one point per stage, higher is happier, named below in its mood's colour. */
const moodY = (v: number) => ROW.feeling.y + 72 - v * 30;
const moodPoints: DNode[] = MOODS.map(([v, word], i) => {
  const n = node(`jMood${i}`, "general/circle", word, col(i) + COL / 2 - 12, moodY(v), 24, 24, 5, {
    fill: MOOD_COLOUR(v),
    stroke: "#FFFFFF",
    strokeWidth: 2,
    verticalLabelPosition: "bottom",
  });
  n.label = { text: word, align: "center", fontSize: 11, bold: true, color: MOOD_COLOUR(v) };
  return n;
});

const diagram = page(
  "dJourney",
  "Customer journey map",
  [
    { ...node("jTitle", TEXT, "Customer journey — first purchase", 60, 24, 700, 30, 1, { fill: "none", stroke: "none" }), label: { text: "Customer journey — first purchase", align: "left", fontSize: 16, bold: true } },
    { ...node("jPersona", TEXT, "Persona: Sam, office manager at a small firm   ·   Goal: restock supplies by tomorrow", 60, 58, 900, 24, 1, { fill: "none", stroke: "none" }), label: { text: "Persona: Sam, office manager at a small firm   ·   Goal: restock supplies by tomorrow", align: "left", fontSize: 12, color: "#66707D" } },

    rowHead("jLab0", "Stage", ROW.stage.y, ROW.stage.h),
    rowHead("jLab1", "Doing", ROW.doing.y, ROW.doing.h),
    rowHead("jLab2", "Thinking", ROW.thinking.y, ROW.thinking.h),
    rowHead("jLab3", "Feeling", ROW.feeling.y, ROW.feeling.h),
    rowHead("jLab4", "Friction", ROW.friction.y, ROW.friction.h),
    rowHead("jLab5", "Opportunities", ROW.ideas.y, ROW.ideas.h),

    ...STAGES.map((s, i) => {
      const n = node(`jStage${i}`, CELL, s, col(i), ROW.stage.y, COL, ROW.stage.h, 2, { fill: "#4B63C4", stroke: "#4B63C4", strokeWidth: 1 });
      n.label = { text: s, align: "center", fontSize: 13, bold: true, color: "#FFFFFF" };
      return n;
    }),
    ...cells("jAct", ACTIONS, ROW.doing.y, ROW.doing.h, PLAIN_CELL),
    ...cells("jThink", THOUGHTS.map((t) => `“${t}”`), ROW.thinking.y, ROW.thinking.h, PLAIN_CELL, true),
    // The feeling row is one open band the curve runs across, not five boxes.
    node("jFeelBand", CELL, "", X0, ROW.feeling.y, GRID_W, ROW.feeling.h, 1, { fill: "none", stroke: "#C4CAD3", strokeWidth: 1 }),
    ...moodPoints,
    ...cells("jPain", PAINS, ROW.friction.y, ROW.friction.h, TINTS.warm),
    ...cells("jIdea", IDEAS, ROW.ideas.y, ROW.ideas.h, TINTS.good),
  ],
  [
    // The emotion curve: the one thing in a journey map that is read as a shape, not as text.
    ...MOODS.slice(0, -1).map((_, i) =>
      link(`jMoodLine${i}`, `jMood${i}`, `jMood${i + 1}`, { edgeStyle: "straight", stroke: "#6D5AE6", strokeWidth: 2.5, startArrow: "none", endArrow: "none" }, undefined, ["right", "left"]),
    ),
  ],
);

export default templateDoc("Customer journey map", [diagram]);
