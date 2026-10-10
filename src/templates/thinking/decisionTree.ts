// A decision tree.
//
// Unlike a plain tree this one *does* carry arrowheads and labelled branches, because the
// branches are the content: a decision tree with unlabelled edges tells you nothing about which
// way to go. Decisions are diamonds, outcomes are boxes, and the leaves say what happens rather
// than repeating the question.
import { ACCENT, CHOICE, PLAIN, SOFT, link, node, page } from "./thinkKit";
import { templateDoc } from "../starters/basicFlowchart";

const DECISION = "flowchart/decision";
const BOX = "general/rounded-rect";

const diagram = page(
  "dDecisionTree",
  "Decision tree",
  [
    node("dtStart", DECISION, "Is it reproducible?", 420, 40, 220, 110, 1, ACCENT),

    node("dtLogs", DECISION, "Do we have logs?", 140, 220, 220, 110, 2, PLAIN),
    node("dtSev", DECISION, "Customer impact?", 720, 220, 220, 110, 3, PLAIN),

    // Each outcome sits just outside the corner its branch leaves from, so every branch is one
    // clean turn; outcomes are tinted by how urgent they are.
    node("dtClose", BOX, "Close as\nnot reproducible", 9, 420, 190, 70, 4, SOFT),
    node("dtInstrument", BOX, "Add logging,\nre-open in a week", 301, 420, 190, 70, 5, { fill: "#FFF4DE", stroke: "#C98A0B", strokeWidth: 1 }),
    node("dtNow", BOX, "Fix now\n(page on-call)", 589, 420, 190, 70, 6, { fill: "#FCEBF0", stroke: "#B83E62", strokeWidth: 1 }),
    node("dtBacklog", BOX, "Add to backlog", 881, 420, 190, 70, 7, { fill: "#E8F1FB", stroke: "#3C7FC0", strokeWidth: 1 }),
  ],
  [
    link("dtNo", "dtStart", "dtLogs", CHOICE, "no", ["left", "top"]),
    link("dtYes", "dtStart", "dtSev", CHOICE, "yes", ["right", "top"]),
    link("dtNoLogs", "dtLogs", "dtClose", CHOICE, "no", ["left", "top"]),
    link("dtHasLogs", "dtLogs", "dtInstrument", CHOICE, "yes", ["right", "top"]),
    link("dtHigh", "dtSev", "dtNow", CHOICE, "high", ["left", "top"]),
    link("dtLow", "dtSev", "dtBacklog", CHOICE, "low", ["right", "top"]),
  ],
);

export default templateDoc("Decision tree", [diagram]);
