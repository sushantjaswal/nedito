// Venn diagram, two sets.
//
// The regions are the content, so each gets its own text: what is only in A, what is only in B,
// and what is in both. Labels sit outside the circles for the set names and inside for the
// regions, which is what keeps the middle readable.
//
// The translucent fills use `fillOpacity`, added to the Style panel for this batch — whole-node
// opacity would have faded the outlines and the text along with the fill.
import { ACCENT, SET_COLOURS, node, page } from "./thinkKit";
import { templateDoc } from "../starters/basicFlowchart";

const ELLIPSE = "general/ellipse";
const TEXT = "general/text";
const NONE = { fill: "none", stroke: "none" };

const diagram = page(
  "dVenn2",
  "Venn — two sets",
  [
    { ...node("v2Title", TEXT, "What to build next", 120, 30, 400, 30, 1, NONE), label: { text: "What to build next", align: "left", fontSize: 16, bold: true } },

    node("v2A", ELLIPSE, "", 120, 130, 340, 300, 2, SET_COLOURS.violet),
    node("v2B", ELLIPSE, "", 340, 130, 340, 300, 3, SET_COLOURS.green),

    // Each set named just outside its circle, in its colour.
    { ...node("v2ALabel", TEXT, "Customers ask for it", 140, 92, 240, 26, 4, NONE), label: { text: "Customers ask for it", align: "center", fontSize: 14, bold: true, color: String(SET_COLOURS.violet.stroke) } },
    { ...node("v2BLabel", TEXT, "We can build it well", 420, 92, 240, 26, 4, NONE), label: { text: "We can build it well", align: "center", fontSize: 14, bold: true, color: String(SET_COLOURS.green.stroke) } },

    node("v2Only", TEXT, "Wishlist\n(park it)", 170, 250, 150, 60, 5, {}),
    { ...node("v2Both", TEXT, "Build this", 350, 250, 120, 60, 6, ACCENT), label: { text: "Build this", align: "center", fontSize: 13, bold: true } },
    node("v2OnlyB", TEXT, "Pet projects\n(say no)", 490, 250, 150, 60, 5, {}),
  ],
  [],
);

export default templateDoc("Venn — two sets", [diagram]);
