// Cross-functional (swimlane) process.
//
// The whole value of a swimlane diagram is the vertical position: which role owns each step.
// So the lanes are real containers laid out on a grid, and every step sits squarely inside one.
//
// Each lane is a fixed-width name band — the role, reading bottom to top — beside an unfilled
// body, the way swimlane tools draw them. (The lane stencil's band is a share of its width, so on
// a lane this long it became a 100px column of empty space.) Steps sit in evenly spaced columns,
// one per step in time order, so the flow only ever moves to the right; it starts and ends with
// events, so the reader knows where the process begins and that it finishes.
import type { ShapeNode, StyleMap } from "../../model/types";
import { ACCENT, FLOW, PLAIN, link, node, page } from "./bizKit";
import { templateDoc } from "../starters/basicFlowchart";

const STEP = "general/rounded-rect";
const INK = "#1E2733";
const BODY: StyleMap = { fill: "none", stroke: "#98A1AD", strokeWidth: 1.25 };
const BAND: StyleMap = { fill: "#F4F5F7", stroke: "#98A1AD", strokeWidth: 1.25, horizontal: false };
const EVENT: StyleMap = { fill: "#FFFFFF", stroke: INK, strokeWidth: 1 };

const LEFT = 40;
const BAND_W = 40;
const WIDTH = 1700;
const LANE_H = 140;
const laneY = (i: number) => 40 + i * LANE_H;
/** Steps sit on the lane's centre line, so the eye reads a row as one role's work. */
const stepY = (i: number) => laneY(i) + (LANE_H - 64) / 2;
/** One column per step, in the order the work happens. */
const col = (i: number) => 175 + i * 175;

function lane(i: number, name: string): ShapeNode[] {
  const band = node(`slb${i}`, "general/rect", name, LEFT, laneY(i), BAND_W, LANE_H, 1, BAND);
  band.label = { text: name, align: "left", fontSize: 12, bold: true };
  return [node(`sl${i}`, "general/rect", "", LEFT + BAND_W, laneY(i), WIDTH - BAND_W, LANE_H, 0, BODY), band];
}

// A line between lanes leaves a step's top or bottom and turns once, into the next step's side: an
// L, never a step whose middle leg runs along a lane border.
const diagram = page(
  "dSwimlane",
  "Cross-functional process",
  [
    ...["Customer", "Sales", "Fulfilment", "Finance"].flatMap((name, i) => lane(i, name)),

    node("qStart", "bpmn/start-event", "Needs a quote", 120, laneY(0) + 48, 44, 44, 2, EVENT),
    node("qRequest", STEP, "Request a quote", col(0) + 20, stepY(0), 150, 64, 2, PLAIN),
    node("qPrice", STEP, "Prepare quote", col(1) + 20, stepY(1), 150, 64, 3, PLAIN),
    node("qAccept", STEP, "Accept quote", col(2) + 20, stepY(0), 150, 64, 4, PLAIN),
    node("qOrder", STEP, "Raise order", col(3) + 20, stepY(1), 150, 64, 5, ACCENT),
    node("qPick", STEP, "Pick and pack", col(4) + 20, stepY(2), 150, 64, 6, PLAIN),
    node("qShip", STEP, "Despatch", col(5) + 20, stepY(2), 150, 64, 7, PLAIN),
    node("qReceive", STEP, "Receive goods", col(6) + 20, stepY(0), 150, 64, 8, PLAIN),
    node("qInvoice", STEP, "Raise invoice", col(6) + 20, stepY(3), 150, 64, 9, PLAIN),
    node("qPayment", STEP, "Reconcile payment", col(7) + 20, stepY(3), 150, 64, 10, PLAIN),
    node("qEnd", "bpmn/end-event", "Goods received", col(7) + 20, laneY(0) + 48, 44, 44, 11, EVENT),
    node("qPaid", "bpmn/end-event", "Order closed", col(8) + 20, laneY(3) + 48, 44, 44, 12, EVENT),
  ],
  [
    link("sqStart", "qStart", "qRequest", FLOW, undefined, ["right", "left"]),
    link("sqA", "qRequest", "qPrice", FLOW, undefined, ["bottom", "left"]),
    link("sqB", "qPrice", "qAccept", FLOW, undefined, ["top", "left"]),
    link("sqC", "qAccept", "qOrder", FLOW, undefined, ["bottom", "left"]),
    link("sqD", "qOrder", "qPick", FLOW, undefined, ["bottom", "left"]),
    link("sqE", "qPick", "qShip", FLOW, undefined, ["right", "left"]),
    link("sqF", "qShip", "qReceive", FLOW, undefined, ["top", "left"]),
    link("sqG", "qShip", "qInvoice", FLOW, undefined, ["bottom", "left"]),
    link("sqH", "qInvoice", "qPayment", FLOW, undefined, ["right", "left"]),
    link("sqEnd", "qReceive", "qEnd", FLOW, undefined, ["right", "left"]),
    link("sqPaid", "qPayment", "qPaid", FLOW, undefined, ["right", "left"]),
  ],
);

export default templateDoc("Cross-functional process", [diagram]);
