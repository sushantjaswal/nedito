// Fishbone (Ishikawa) cause-and-effect diagram.
//
// The spine runs left to right into the effect; the bones angle back into it, which is what makes
// the shape readable as "these feed that". The six categories are the classic 6M set used in
// manufacturing and adapted everywhere since — they are a starting point to rename, not a rule.
//
// Drawn the way the method is taught: every cause is written horizontally on its own short
// sub-bone, which joins the category's bone. The first version floated cause text over the bones
// themselves, so every cause had a line struck through it. The joints are invisible points on the
// lines, so every line is a real connection the user can re-point.
import type { ShapeNode, StyleMap } from "../../model/types";
import { RIB, TINTS, link, node, page } from "./bizKit";
import { templateDoc } from "../starters/basicFlowchart";

const BOX = "general/rounded-rect";
const TEXT = "general/text";
const SPINE: StyleMap = { edgeStyle: "straight", stroke: "#3C4A5C", strokeWidth: 3, startArrow: "none", endArrow: "classic" };
const BONE: StyleMap = { ...RIB, stroke: "#3C4A5C", strokeWidth: 1.75 };
const TWIG: StyleMap = { ...RIB, strokeWidth: 1 };
const POINT: StyleMap = { fill: "none", stroke: "none" };

const SPINE_Y = 400;
const TOP_Y = 60;
const BOTTOM_Y = 696;
const BOX_W = 170;
const BOX_H = 44;
/** How far right a bone travels from its category to the spine. */
const SLANT = 170;

/** An invisible point that a line can join, for a bone meeting the spine or a twig a bone. */
function point(slug: string, x: number, y: number): ShapeNode {
  return node(slug, TEXT, "", x - 1, y - 1, 2, 2, 1, POINT);
}

/** A category: its box, its bone into the spine, and one twig per cause. */
function bone(key: string, name: string, x: number, above: boolean, causes: string[]) {
  const cx = x + BOX_W / 2;
  const boxEdge = above ? TOP_Y + BOX_H : BOTTOM_Y;
  const span = Math.abs(SPINE_Y - boxEdge);
  /** Where the bone is at height y. */
  const boneX = (y: number) => cx + (Math.abs(y - boxEdge) * SLANT) / span;
  const causeYs = above ? [180, 250, 320] : [480, 550, 620];

  const box = node(`${key}Box`, BOX, name, x, above ? TOP_Y : BOTTOM_Y, BOX_W, BOX_H, 3, TINTS.neutral);
  box.label = { text: name, align: "center", fontSize: 12, bold: true };
  const nodes: ShapeNode[] = [box, point(`${key}Join`, cx + SLANT, SPINE_Y)];
  const edges = [link(`${key}Rib`, `${key}Box`, `${key}Join`, BONE, undefined, [above ? "bottom" : "top", "left"])];

  causes.forEach((cause, i) => {
    const y = causeYs[above ? i : causeYs.length - 1 - i];
    const bx = boneX(y);
    const text = node(`${key}c${i}`, TEXT, cause, bx - 24 - 180, y - 11, 180, 22, 4, POINT);
    text.label = { text: cause, align: "right", fontSize: 11 };
    nodes.push(text, point(`${key}t${i}`, bx, y));
    edges.push(link(`${key}Twig${i}`, `${key}c${i}`, `${key}t${i}`, TWIG, undefined, ["right", "left"]));
  });
  return { nodes, edges };
}

const bones = [
  bone("fPeople", "People", 120, true, ["Training gaps", "Shift handovers", "Short-staffed peaks"]),
  bone("fProcess", "Process", 470, true, ["No despatch checklist", "Manual order re-entry"]),
  bone("fSystems", "Systems", 820, true, ["Stale stock cache", "No retry on label print"]),
  bone("fMaterials", "Materials", 120, false, ["Supplier delays", "Packaging shortages"]),
  bone("fMeasure", "Measurement", 470, false, ["Wrong SLA metric", "Late exception reports"]),
  bone("fEnviron", "Environment", 820, false, ["Peak-hour load", "Warehouse layout"]),
];

const diagram = page(
  "dFishbone",
  "Fishbone (Ishikawa)",
  [
    point("fTail", 60, SPINE_Y),
    { ...node("fEffectTag", TEXT, "EFFECT", 1160, SPINE_Y - 76, 200, 22, 5, POINT), label: { text: "EFFECT", align: "center", fontSize: 11, bold: true, color: "#C9820A" } },
    { ...node("fEffect", BOX, "Orders despatched late", 1160, SPINE_Y - 45, 200, 90, 5, TINTS.bad), label: { text: "Orders despatched late", align: "center", fontSize: 13, bold: true } },
    ...bones.flatMap((b) => b.nodes),
  ],
  [
    // One spine, tail to head; the bones meet it at invisible points along the way.
    link("fSpine", "fTail", "fEffect", SPINE, undefined, ["right", "left"]),
    ...bones.flatMap((b) => b.edges),
  ],
);

export default templateDoc("Fishbone (Ishikawa)", [diagram]);
