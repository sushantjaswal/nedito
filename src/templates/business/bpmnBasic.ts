// BPMN, the descriptive subset: a collapsed participant pool, one process pool with two lanes,
// events, tasks, an exclusive gateway, message flows and an annotation.
//
// Kept to the shapes a non-technical reader can be expected to know, which is what BPMN's own
// "descriptive" conformance class is for. The one deliberate inclusion beyond a plain happy path
// is the exclusive gateway with both branches labelled: an unlabelled gateway is the single most
// common way a BPMN diagram becomes unreadable, because the reader cannot tell which way is
// which.
//
// Drawn as BPMN modellers draw it: the customer is a collapsed ("black box") pool above the
// process, exchanging dashed message flows with it; the process pool and each lane carry their
// names in a narrow band on the left, reading bottom to top; events and the gateway are named
// outside their symbols (the gateway above it, because its "no" branch leaves downward); and the
// backorder path rejoins the main flow through an intermediate event rather than dead-ending.
import type { DEdge, ShapeNode, StyleMap } from "../../model/types";
import { tid } from "../starters/basicFlowchart";
import { FLOW, MESSAGE, PLAIN, link, node, page } from "./bizKit";
import { templateDoc } from "../starters/basicFlowchart";

const B = "bpmn";
const INK = "#1E2733";
const POOL: StyleMap = { fill: "none", stroke: INK, strokeWidth: 1.25 };
const BAND: StyleMap = { fill: "#F4F5F7", stroke: INK, strokeWidth: 1, horizontal: false };
const LANE: StyleMap = { fill: "none", stroke: INK, strokeWidth: 1 };
const TASK: StyleMap = { fill: "#FFFFFF", stroke: INK, strokeWidth: 1 };
const ASSOCIATION: StyleMap = { edgeStyle: "orthogonal", stroke: "#66707D", strokeWidth: 1, dash: "dotted", startArrow: "none", endArrow: "none" };

/** A name band: a narrow header reading bottom to top, as a pool's or a lane's name does. */
function band(slug: string, text: string, x: number, y: number, w: number, h: number): ShapeNode {
  const n = node(slug, "general/rect", text, x, y, w, h, 1, BAND);
  n.label = { text, align: "left", fontSize: 12, bold: true };
  return n;
}

const LEFT = 60;
const RIGHT = 1500;
const HEAD = 36;

const diagram = page(
  "dBpmnBasic",
  "BPMN — order handling",
  [
    // The customer, collapsed: what they do inside is not this diagram's business.
    { ...node("pCustomer", "general/rect", "Customer", LEFT, 40, RIGHT - LEFT, 64, 0, POOL), label: { text: "Customer", align: "center", fontSize: 12, bold: true } },

    // The process pool and its two lanes.
    node("pPool", "general/rect", "", LEFT, 150, RIGHT - LEFT, 440, 0, POOL),
    band("pPoolBand", "Order handling", LEFT, 150, HEAD, 440),
    band("pLane1Band", "Sales", LEFT + HEAD, 150, HEAD, 220),
    node("pLane1", "general/rect", "", LEFT + HEAD * 2, 150, RIGHT - LEFT - HEAD * 2, 220, 0, LANE),
    band("pLane2Band", "Warehouse", LEFT + HEAD, 370, HEAD, 220),
    node("pLane2", "general/rect", "", LEFT + HEAD * 2, 370, RIGHT - LEFT - HEAD * 2, 220, 0, LANE),

    // Sales.
    node("pStart", `${B}/start-event`, "Order received", 180, 238, 44, 44, 2, PLAIN),
    node("pCheck", `${B}/task`, "Check stock", 280, 225, 150, 70, 3, TASK),
    { ...node("pGate", `${B}/gateway-exclusive`, "In stock?", 500, 230, 60, 60, 4, { ...PLAIN, verticalLabelPosition: "top" }) },
    node("pReserve", `${B}/task`, "Reserve stock", 640, 225, 150, 70, 5, TASK),
    node("pInvoice", `${B}/task`, "Raise invoice", 1060, 225, 150, 70, 6, TASK),
    node("pEnd", `${B}/end-event`, "Order complete", 1290, 238, 44, 44, 7, PLAIN),

    // Warehouse.
    node("pBackorder", `${B}/task`, "Raise backorder", 455, 470, 150, 70, 8, TASK),
    node("pStock", `${B}/intermediate-event`, "Stock arrives", 693, 483, 44, 44, 9, PLAIN),
    node("pPick", `${B}/task`, "Pick and pack", 860, 470, 150, 70, 10, TASK),
    node("pDespatch", `${B}/task`, "Despatch", 1060, 470, 150, 70, 11, TASK),
    node("pNote", `${B}/annotation`, "Backorders wait here\nuntil stock arrives", 800, 540, 190, 40, 12, {}),
  ],
  [
    link("bA", "pStart", "pCheck", FLOW, undefined, ["right", "left"]),
    link("bB", "pCheck", "pGate", FLOW, undefined, ["right", "left"]),
    // Both branches labelled: an unlabelled gateway is where BPMN diagrams go wrong.
    link("bYes", "pGate", "pReserve", FLOW, "yes", ["right", "left"]),
    link("bNo", "pGate", "pBackorder", FLOW, "no", ["bottom", "top"]),
    link("bWait", "pBackorder", "pStock", FLOW, undefined, ["right", "left"]),
    link("bRejoin", "pStock", "pReserve", FLOW, undefined, ["top", "bottom"]),
    link("bPick", "pReserve", "pPick", FLOW, undefined, ["right", "left"]),
    link("bDespatch", "pPick", "pDespatch", FLOW, undefined, ["right", "left"]),
    link("bInvoice", "pDespatch", "pInvoice", FLOW, undefined, ["top", "bottom"]),
    link("bEnd", "pInvoice", "pEnd", FLOW, undefined, ["right", "left"]),
    // Message flows cross a pool boundary, which is what distinguishes them from sequence flows
    // — hence dashed, with an open head.
    link("bOrder", "pCustomer", "pStart", MESSAGE, "order", ["bottom", "top"]),
    link("bShip", "pDespatch", "pCustomer", MESSAGE, "shipment", ["right", "bottom"]),
    link("bNote", "pNote", "pStock", ASSOCIATION, undefined, ["left", "right"]),
  ],
);

// A message flow meets the collapsed pool directly over or under what it connects.
diagram.edges = diagram.edges.map((e): DEdge => {
  if (e.id.startsWith("bOrder")) return { ...e, source: { nodeId: tid("pCustomer"), anchor: { x: (202 - LEFT) / (RIGHT - LEFT), y: 1 } } };
  if (e.id.startsWith("bShip")) return { ...e, target: { nodeId: tid("pCustomer"), anchor: { x: (1420 - LEFT) / (RIGHT - LEFT), y: 1 } } };
  return e;
});

export default templateDoc("BPMN — order handling", [diagram]);
