// Venn diagram, three sets.
//
// The classic arrangement: two circles above, one below, centred so all seven regions exist and
// are large enough to write in. The centre region is the one people are usually after, so it is
// the one that carries the accent.
//
// The circles sit on an equilateral triangle, and every region's text is placed at that region's
// own centre, computed from the geometry — the first version placed them by eye, and two landed
// across circle outlines. Each set is named just outside its circle, in its colour.
import type { ShapeNode, StyleMap } from "../../model/types";
import { ACCENT, SET_COLOURS, node, page } from "./thinkKit";
import { templateDoc } from "../starters/basicFlowchart";

const ELLIPSE = "general/ellipse";
const TEXT = "general/text";
const NONE: StyleMap = { fill: "none", stroke: "none" };

const R = 160; // radius
const D = 180; // distance between centres
const CX = 420;
const CY = 360;
// Centres on an equilateral triangle around (CX, CY).
const A = { x: CX - D / 2, y: CY - D / (2 * Math.sqrt(3)) };
const B = { x: CX + D / 2, y: CY - D / (2 * Math.sqrt(3)) };
const C = { x: CX, y: CY + D / Math.sqrt(3) };

function circle(slug: string, c: { x: number; y: number }, style: StyleMap): ShapeNode {
  return node(slug, ELLIPSE, "", c.x - R, c.y - R, 2 * R, 2 * R, 2, style);
}

/** Region text centred on a point. */
function region(slug: string, text: string, x: number, y: number, w: number, z = 6, style: StyleMap = NONE): ShapeNode {
  const lines = text.split("\n").length;
  const h = lines * 16 + 12;
  const n = node(slug, TEXT, text, Math.round(x - w / 2), Math.round(y - h / 2), w, h, z, style);
  n.label = { text, align: "center", fontSize: 12 };
  return n;
}

function setName(slug: string, text: string, x: number, y: number, colour: string): ShapeNode {
  const n = node(slug, TEXT, text, x - 80, y - 13, 160, 26, 5, NONE);
  n.label = { text, align: "center", fontSize: 14, bold: true, color: colour };
  return n;
}

/** A point `k` radii from a centre, away from the middle of the figure. */
const away = (c: { x: number; y: number }, k: number) => {
  const dx = c.x - CX;
  const dy = c.y - CY;
  const len = Math.hypot(dx, dy);
  return { x: c.x + (dx / len) * R * k, y: c.y + (dy / len) * R * k };
};
/** The middle of where two circles overlap, outside the third. */
const pair = (p: { x: number; y: number }, q: { x: number; y: number }) => {
  const m = { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 };
  const dx = m.x - CX;
  const dy = m.y - CY;
  const len = Math.hypot(dx, dy);
  return { x: m.x + (dx / len) * R * 0.38, y: m.y + (dy / len) * R * 0.38 };
};

const onlyA = away(A, 0.45);
const onlyB = away(B, 0.45);
const onlyC = away(C, 0.45);
const ab = pair(A, B);
const ac = pair(A, C);
const bc = pair(B, C);

const diagram = page(
  "dVenn3",
  "Venn — three sets",
  [
    { ...node("v3Title", TEXT, "Where the work should go", 60, 70, 500, 30, 1, NONE), label: { text: "Where the work should go", align: "left", fontSize: 16, bold: true } },

    circle("v3A", A, SET_COLOURS.violet),
    circle("v3B", B, SET_COLOURS.green),
    circle("v3C", C, SET_COLOURS.amber),

    setName("v3ALabel", "Valuable", A.x - 60, A.y - R - 18, String(SET_COLOURS.violet.stroke)),
    setName("v3BLabel", "Feasible", B.x + 60, B.y - R - 18, String(SET_COLOURS.green.stroke)),
    setName("v3CLabel", "Usable", C.x, C.y + R + 20, String(SET_COLOURS.amber.stroke)),

    region("v3OnlyA", "Wanted, but\nwe cannot\nship it", onlyA.x, onlyA.y, 110),
    region("v3OnlyB", "Easy, but\nnobody\nasked", onlyB.x, onlyB.y, 110),
    region("v3OnlyC", "Delightful,\nbut pointless", onlyC.x, onlyC.y, 120),
    region("v3AB", "Ships, but\nawkward", ab.x, ab.y, 100, 7),
    region("v3AC", "Loved,\nnot\nbuildable", ac.x, ac.y, 80, 7),
    region("v3BC", "Nice,\nnot\nneeded", bc.x, bc.y, 80, 7),
    { ...region("v3Centre", "Do this", CX, CY, 84, 8, ACCENT), label: { text: "Do this", align: "center", fontSize: 13, bold: true } },
  ],
  [],
);

export default templateDoc("Venn — three sets", [diagram]);
