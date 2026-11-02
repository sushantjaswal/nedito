// A user story map, with each activity a Nested Block holding its tasks and stories.
//
// A story map is two things at once: a backbone of what the user does, in order, and under
// every part of it a stack of stories sliced into releases. On one canvas the backbone is the
// first thing to go — a wall of eighty cards with the narrative buried in it, which is exactly
// the complaint people have about the whiteboard versions.
//
// So the backbone is the top level, left to right in the order the user does things, and each
// activity opens into its own tasks and release bands. The releases are drawn inside each
// activity rather than as one slice across the whole map: opening "Buy" then answers the
// question somebody actually has — what are we building for this part, and when — and the
// backbone upstairs stays readable, which is the whole point of the technique.
import type { Diagram, NestedNode, ShapeNode, StyleMap } from "../../model/types";
import { templateDoc, tid } from "../starters/basicFlowchart";
import { ACCENT, BRANCH, PLAIN, SOFT, link, node, page } from "./thinkKit";

const ROUND = "general/rounded-rect";
const MUTED = "#66707D";

/** A task in the backbone: the step a user takes, not a thing to build. */
const TASK: StyleMap = { fill: "#EEEBFC", stroke: "#6D5AE6", strokeWidth: 1.25 };
/** A story card. Plain, because the band it sits in already says when it ships. */
const CARD: StyleMap = { fill: "#FFFFFF", stroke: "#1E2733", strokeWidth: 1 };

/** A story card: smaller type than the backbone, because there are many more of them. */
function card(slug: string, text: string, x: number, y: number, z: number): ShapeNode {
  const n = node(slug, ROUND, text, x, y, 200, 65, z, CARD);
  n.label = { text, align: "center", fontSize: 10 };
  return n;
}

/**
 * A release band: an unfilled box with its name at the top left, the story cards sitting inside
 * it. Unfilled for the usual reason — a filled container is drawn over the lines crossing it —
 * and because a band is background, so it should not be clickable in the middle.
 */
function band(slug: string, title: string, y: number, h: number, z: number): ShapeNode {
  const n = node(slug, "general/rect", title, 40, y, 720, h, z, {
    fill: "none",
    stroke: MUTED,
    strokeWidth: 1,
    verticalAlign: "top",
  });
  n.label = { text: title, align: "left", fontSize: 11, bold: true, color: MUTED };
  return n;
}

interface Activity {
  /** Id prefix, so four activities coexist in one document. */
  key: string;
  title: string;
  /** The three steps the user takes within this activity, in order. */
  tasks: [string, string, string];
  /** What ships first: one story per task column. */
  first: [string, string, string];
  /** What ships next: the first two columns. */
  next: [string, string];
  /** What is parked: one card, under the column it belongs to. */
  later: string;
}

/** The columns a task and its cards line up in. A card belongs to the task above it. */
const COLUMNS = [60, 300, 540];

/** One activity's child diagram: its tasks across the top, its stories in release bands. */
function activity(a: Activity): Diagram {
  const k = (suffix: string) => `${a.key}${suffix}`;
  return page(
    k("d"),
    a.title,
    [
      band(k("b1"), "Release 1 — the walking skeleton", 180, 130, 1),
      band(k("b2"), "Release 2", 330, 130, 2),
      band(k("b3"), "Later", 480, 130, 3),

      ...a.tasks.map((t, i) => node(k(`t${i}`), ROUND, t, COLUMNS[i], 90, 200, 60, 4 + i, TASK)),

      ...a.first.map((s, i) => card(k(`f${i}`), s, COLUMNS[i], 225, 8 + i)),
      ...a.next.map((s, i) => card(k(`n${i}`), s, COLUMNS[i], 375, 12 + i)),
      card(k("l0"), a.later, COLUMNS[2], 525, 15),
    ],
    [
      link(k("e0"), k("t0"), k("t1"), BRANCH, undefined, ["right", "left"]),
      link(k("e1"), k("t1"), k("t2"), BRANCH, undefined, ["right", "left"]),
    ],
  );
}

const ACTIVITIES: Activity[] = [
  {
    key: "ud",
    title: "Discover",
    tasks: ["Search the catalogue", "Filter and sort", "Browse by category"],
    first: ["Search by keyword", "Filter by price", "Browse top categories"],
    next: ["Spelling suggestions", "Filter by rating"],
    later: "Category landing pages",
  },
  {
    key: "uc",
    title: "Choose",
    tasks: ["Compare options", "Read reviews", "Check availability"],
    first: ["Side-by-side compare", "Read recent reviews", "See stock at a glance"],
    next: ["Save a comparison", "Sort reviews by helpful"],
    later: "Notify me when in stock",
  },
  {
    key: "ub",
    title: "Buy",
    tasks: ["Add to basket", "Pay", "Confirm the order"],
    first: ["Add and remove items", "Pay by card", "Confirmation email"],
    next: ["Save the basket", "Pay with a saved card"],
    later: "Buy now, in one tap",
  },
  {
    key: "ur",
    title: "Receive and support",
    tasks: ["Track delivery", "Get help", "Return an item"],
    first: ["Tracking link", "Contact form", "Start a return"],
    next: ["Delivery notifications", "Help centre search"],
    later: "Live chat with an agent",
  },
];

const children = ACTIVITIES.map(activity);

/**
 * An activity on the backbone. The journey enters at its first task and leaves from its last,
 * so the two ports are the two ends of the user's walk through it — and inside the activity
 * each one rides on the task it stands for.
 */
function activityBlock(a: Activity, child: Diagram, x: number, z: number, entrySide: "top" | "left"): NestedNode {
  return {
    id: tid(`${a.key}Block`),
    type: "nested",
    childDiagramId: child.id,
    position: { x, y: 250 },
    size: { w: 240, h: 150 },
    z,
    style: {},
    label: { text: a.title, align: "center" },
    collapsed: { icons: [], summary: "three tasks · six stories in three releases" },
    ports: [
      { id: tid(`${a.key}In`), side: entrySide, offset: 0.5, innerNodeId: tid(`${a.key}t0`), label: "starts" },
      { id: tid(`${a.key}Out`), side: "right", offset: 0.5, innerNodeId: tid(`${a.key}t2`), label: "then" },
    ],
  };
}

const blocks = ACTIVITIES.map((a, i) => activityBlock(a, children[i], [60, 340, 620, 900][i], 4 + i, i === 0 ? "top" : "left"));

// The last activity is where the journey pays off, so it carries one extra port for the outcome.
blocks[3].ports.push({ id: tid("urDone"), side: "bottom", offset: 0.5, innerNodeId: tid("urt2"), label: "outcome" });

const backbone: Diagram = page(
  "dStoryMap",
  "Story map",
  [
    node("uPersona", ROUND, "Persona: a returning\nshopper buying a gift", 60, 50, 220, 90, 1, ACCENT),
    node("uGoal", ROUND, "Goal: find it, buy it,\nknow when it arrives", 330, 50, 240, 90, 2, PLAIN),
    node("uNote", "general/note", "The backbone reads left\nto right. Open an activity\nfor its tasks and stories.", 640, 45, 300, 100, 3, SOFT),
    ...blocks,
    node("uOutcome", ROUND, "Outcome: a shopper\nwho comes back", 900, 480, 240, 80, 9, ACCENT),
  ],
  [
    link("ume0", "uPersona", "uGoal", BRANCH, undefined, ["right", "left"]),
    {
      id: tid("ume1"),
      source: { nodeId: tid("uPersona") },
      target: { nodeId: blocks[0].id, portId: blocks[0].ports[0].id },
      style: { ...BRANCH, sourceHandle: "bottom" },
    },
    // Each activity hands the journey to the next: out of its last task, into the next one's first.
    ...blocks.slice(0, 3).map((b, i) => ({
      id: tid(`ume${i + 2}`),
      source: { nodeId: b.id, portId: b.ports[1].id },
      target: { nodeId: blocks[i + 1].id, portId: blocks[i + 1].ports[0].id },
      style: { ...BRANCH, endArrow: "classic" },
    })),
    {
      id: tid("ume5"),
      source: { nodeId: blocks[3].id, portId: blocks[3].ports[2].id },
      target: { nodeId: tid("uOutcome") },
      style: { ...BRANCH, targetHandle: "top" },
    },
  ],
);

export default templateDoc("Story map", [backbone, ...children]);
