// SWOT.
//
// The 2x2 is the whole notation, and the axes carry meaning people forget: the top row is
// internal (things you control), the bottom external (things you do not); the left column is
// helpful, the right harmful. The axis labels are part of the template because a SWOT filled in
// without them tends to collect external threats in the Weaknesses box.
//
// Laid out as SWOT grids are usually printed: each quadrant a card with a coloured header and a
// bulleted list reading from its top-left, the column headings across the top and the row
// headings reading up their own narrow bands on the left.
import type { ShapeNode, StyleMap } from "../../model/types";
import { TINTS, card, node, page } from "./bizKit";
import { templateDoc } from "../starters/basicFlowchart";

const W = 400;
const H = 250;
const GAP = 16;
const X0 = 110;
const Y0 = 110;
const AXIS: StyleMap = { fill: "#F4F5F7", stroke: "#C4CAD3", strokeWidth: 1 };

function axis(slug: string, text: string, x: number, y: number, w: number, h: number, vertical: boolean): ShapeNode {
  const n = node(slug, "general/rect", text, x, y, w, h, 1, vertical ? { ...AXIS, horizontal: false } : AXIS);
  n.label = { text, align: "center", fontSize: 12, bold: true, color: "#3C4A5C" };
  return n;
}

const diagram = page(
  "dSwot",
  "SWOT",
  [
    { ...node("swotTitle", "general/text", "SWOT analysis — regional distributor", X0, 20, 2 * W + GAP, 30, 1, { fill: "none", stroke: "none" }), label: { text: "SWOT analysis — regional distributor", align: "left", fontSize: 16, bold: true } },

    axis("wHelp", "Helpful", X0, Y0 - 44, W, 32, false),
    axis("wHarm", "Harmful", X0 + W + GAP, Y0 - 44, W, 32, false),
    axis("wIntern", "Internal — what we control", X0 - 48, Y0, 36, H, true),
    axis("wExtern", "External — the market", X0 - 48, Y0 + H + GAP, 36, H, true),

    ...card("wS", "S   Strengths", ["Long-standing customer relationships", "In-house delivery fleet", "Strong margins on the core range"], X0, Y0, W, H, 3, TINTS.good),
    ...card("wW", "W   Weaknesses", ["Orders keyed in by hand", "A single distribution centre", "Limited online presence"], X0 + W + GAP, Y0, W, H, 6, TINTS.bad),
    ...card("wO", "O   Opportunities", ["Expand into neighbouring regions", "A subscription offer for repeat buyers", "Trade customers are underserved"], X0, Y0 + H + GAP, W, H, 9, TINTS.cool),
    ...card("wT", "T   Threats", ["A discount entrant undercutting prices", "Carrier costs rising", "Suppliers consolidating"], X0 + W + GAP, Y0 + H + GAP, W, H, 12, TINTS.warm),
  ],
  [],
);

export default templateDoc("SWOT", [diagram]);
