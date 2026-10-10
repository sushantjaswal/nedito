// The remaining Software & UML templates: sequence, use case, activity, state machine,
// component and deployment. One module per template is the registry's contract, so each is
// exported and re-exported from its own thin file alongside this one.
import { createDefaultLayers } from "../../model/layers";
import type { DEdge, Diagram, ShapeNode, StyleMap } from "../../model/types";
import { templateDoc, tid } from "../starters/basicFlowchart";
import { faceEdges } from "../faceEdges";
import {
  ASSOCIATION,
  ASYNC_MESSAGE,
  CLASS_STYLE,
  DEPENDENCY,
  DIRECTED,
  FLOW,
  RETURN_MESSAGE,
  SYNC_MESSAGE,
} from "./umlKit";

const INK = "#1E2733";
/** UML's solid marks — initial node, final node's dot, fork bar — take the stencil's own ink fill. */
const SOLID: StyleMap = { stroke: INK, strokeWidth: 1 };
const ACTION: StyleMap = { fill: "#F4F2FD", stroke: INK, strokeWidth: 1 };
/** A see-through frame whose name sits at its head. */
const FRAME: StyleMap = { fill: "none", stroke: INK, strokeWidth: 1.25, verticalAlign: "top" };

function n(
  slug: string,
  shapeRef: string,
  text: string,
  x: number,
  y: number,
  w: number,
  h: number,
  z: number,
  style: StyleMap = CLASS_STYLE,
): ShapeNode {
  return {
    id: tid(slug),
    type: "shape",
    shapeRef,
    position: { x, y },
    size: { w, h },
    z,
    style,
    label: text ? { text, align: "center", fontSize: 11 } : undefined,
  };
}

function e(slug: string, from: string, to: string, style: StyleMap, text?: string, sides?: [string, string]): DEdge {
  const edge: DEdge = {
    id: tid(slug),
    source: { nodeId: tid(from) },
    target: { nodeId: tid(to) },
    style: sides ? { ...style, sourceHandle: sides[0], targetHandle: sides[1] } : style,
  };
  if (text) edge.label = { text, fontSize: 10, color: "#4B5563" };
  return edge;
}

// ---------------------------------------------------------------- Sequence
//
// Every message is a horizontal line at its own height: each end is pinned (EdgeEnd.anchor) to
// the side of the activation bar it leaves or reaches, at that message's y. The first version let
// every message find its own handle, so all six converged on the middle of their bars.
const TOP = 40;
const LIFE_H = 500;
const COLS = [120, 350, 580, 810, 1040];
const BARS: Record<string, [number, number, number]> = {
  // slug: [column, top y, bottom y]
  qCustBar: [0, 130, 470],
  qUiBar: [1, 150, 450],
  qApiBar: [2, 190, 410],
  qPayBar: [3, 230, 300],
  qFulfilBar: [4, 340, 380],
};

function lifeline(slug: string, text: string, col: number, z: number): ShapeNode {
  return n(slug, "uml/lifeline", text, COLS[col] - 80, TOP, 160, LIFE_H, z);
}

function bar(slug: string, z: number): ShapeNode {
  const [col, top, bottom] = BARS[slug];
  return n(slug, "uml/activation", "", COLS[col] - 7, top, 14, bottom - top, z);
}

/** A message at height `y` from one bar to another, leaving and arriving on the facing sides. */
function message(slug: string, from: string, to: string, y: number, style: StyleMap, text: string): DEdge {
  const [fc, ft, fb] = BARS[from];
  const [tc, tt, tb] = BARS[to];
  const rightward = COLS[tc] > COLS[fc];
  return {
    id: tid(slug),
    source: { nodeId: tid(from), anchor: { x: rightward ? 1 : 0, y: (y - ft) / (fb - ft) } },
    target: { nodeId: tid(to), anchor: { x: rightward ? 0 : 1, y: (y - tt) / (tb - tt) } },
    style: { ...style, edgeStyle: "straight", sourceHandle: rightward ? "right" : "left", targetHandle: rightward ? "left" : "right" },
    label: { text, fontSize: 10, color: "#4B5563" },
  };
}

const sequencePage: Diagram = {
  id: tid("dUmlSeq"),
  title: "Sequence diagram",
  layers: createDefaultLayers(),
  nodes: [
    lifeline("qCust", "Customer", 0, 1),
    lifeline("qUi", "Checkout UI", 1, 2),
    lifeline("qApi", "Order Service", 2, 3),
    lifeline("qPay", "Payment Gateway", 3, 4),
    lifeline("qFulfil", "Fulfilment Service", 4, 5),
    // Activation bars: the participant is busy for the span each one covers.
    bar("qCustBar", 6),
    bar("qUiBar", 7),
    bar("qApiBar", 8),
    bar("qPayBar", 9),
    bar("qFulfilBar", 10),
  ],
  edges: [
    message("qe1", "qCustBar", "qUiBar", 160, SYNC_MESSAGE, "1: placeOrder()"),
    message("qe2", "qUiBar", "qApiBar", 200, SYNC_MESSAGE, "2: submitOrder(cart)"),
    message("qe3", "qApiBar", "qPayBar", 240, SYNC_MESSAGE, "3: charge(card, total)"),
    message("qe4", "qPayBar", "qApiBar", 290, RETURN_MESSAGE, "4: receipt"),
    // Asynchronous: the order service publishes and moves on rather than waiting for a reply.
    message("qe5", "qApiBar", "qFulfilBar", 350, ASYNC_MESSAGE, "5: OrderPlaced"),
    message("qe6", "qApiBar", "qUiBar", 400, RETURN_MESSAGE, "6: orderId"),
    message("qe7", "qUiBar", "qCustBar", 440, RETURN_MESSAGE, "7: confirmation"),
  ],
};

export const sequenceTemplate = templateDoc("Sequence diagram", [sequencePage]);

// ---------------------------------------------------------------- Use case
const ASSOC: StyleMap = { ...ASSOCIATION, edgeStyle: "straight" };
const STEREO: StyleMap = { ...DEPENDENCY, edgeStyle: "straight" };

const useCasePage: Diagram = {
  id: tid("dUmlUseCase"),
  title: "Use case diagram",
  layers: createDefaultLayers(),
  nodes: [
    n("uBoundary", "uml/system-boundary", "Online Store", 260, 40, 480, 470, 0, { ...FRAME, fill: "none" }),
    n("uCustomer", "uml/actor", "Customer", 80, 210, 60, 100, 1),
    n("uProvider", "uml/actor", "Payment Provider", 860, 150, 60, 100, 2),
    n("uStaff", "uml/actor", "Warehouse Staff", 860, 360, 60, 100, 3),
    n("uBrowse", "uml/use-case", "Browse catalogue", 290, 110, 180, 70, 4),
    n("uOrder", "uml/use-case", "Place order", 290, 225, 180, 70, 5),
    n("uTrack", "uml/use-case", "Track order", 290, 340, 180, 70, 6),
    n("uVoucher", "uml/use-case", "Apply voucher", 530, 110, 180, 70, 7),
    n("uPay", "uml/use-case", "Pay for order", 530, 225, 180, 70, 8),
    n("uShip", "uml/use-case", "Ship order", 530, 375, 180, 70, 9),
  ],
  edges: [
    e("ueBrowse", "uCustomer", "uBrowse", ASSOC, undefined, ["right", "left"]),
    e("ueOrder", "uCustomer", "uOrder", ASSOC, undefined, ["right", "left"]),
    e("ueTrack", "uCustomer", "uTrack", ASSOC, undefined, ["right", "left"]),
    e("uePay", "uOrder", "uPay", STEREO, "«include»", ["right", "left"]),
    e("ueVoucher", "uVoucher", "uOrder", STEREO, "«extend»", ["left", "right"]),
    e("ueProvider", "uProvider", "uPay", ASSOC, undefined, ["left", "right"]),
    e("ueShip", "uStaff", "uShip", ASSOC, undefined, ["left", "right"]),
  ],
};

export const useCaseTemplate = templateDoc("Use case diagram", [useCasePage]);

// ---------------------------------------------------------------- Activity
const activityPage: Diagram = {
  id: tid("dUmlActivity"),
  title: "Activity diagram",
  layers: createDefaultLayers(),
  nodes: [
    n("aStart", "uml/initial-node", "", 351, 30, 28, 28, 1, SOLID),
    n("aReceive", "general/rounded-rect", "Receive order", 280, 100, 170, 56, 2, ACTION),
    n("aCheck", "general/diamond", "In stock?", 300, 200, 130, 80, 3),
    n("aFork", "uml/fork-join", "", 215, 330, 300, 8, 4, SOLID),
    n("aPack", "general/rounded-rect", "Pack items", 190, 390, 150, 56, 5, ACTION),
    n("aInvoice", "general/rounded-rect", "Raise invoice", 390, 390, 150, 56, 6, ACTION),
    n("aJoin", "uml/fork-join", "", 215, 500, 300, 8, 7, SOLID),
    n("aShip", "general/rounded-rect", "Ship order", 280, 560, 170, 56, 8, ACTION),
    n("aEnd", "uml/final-node", "", 351, 670, 28, 28, 9, SOLID),
    n("aBackorder", "general/rounded-rect", "Backorder item", 580, 212, 170, 56, 10, ACTION),
    n("aNotify", "general/rounded-rect", "Notify customer", 580, 330, 170, 56, 11, ACTION),
    n("aEnd2", "uml/final-node", "", 651, 440, 28, 28, 12, SOLID),
  ],
  edges: [
    e("aeStart", "aStart", "aReceive", FLOW),
    e("aeCheck", "aReceive", "aCheck", FLOW),
    e("aeYes", "aCheck", "aFork", FLOW, "[yes]"),
    e("aeNo", "aCheck", "aBackorder", FLOW, "[no]"),
    e("aePack", "aFork", "aPack", FLOW, undefined, ["bottom", "top"]),
    e("aeInvoice", "aFork", "aInvoice", FLOW, undefined, ["bottom", "top"]),
    e("aeJoinP", "aPack", "aJoin", FLOW, undefined, ["bottom", "top"]),
    e("aeJoinI", "aInvoice", "aJoin", FLOW, undefined, ["bottom", "top"]),
    e("aeShip", "aJoin", "aShip", FLOW),
    e("aeEnd", "aShip", "aEnd", FLOW),
    e("aeNotify", "aBackorder", "aNotify", FLOW),
    e("aeEnd2", "aNotify", "aEnd2", FLOW),
  ],
};
// The fork's and join's two lines leave and arrive at their own points along the bar, not the
// bar's middle, so the parallel branches read as parallel.
function pin(edge: DEdge, end: "source" | "target", x: number): DEdge {
  return { ...edge, [end]: { ...edge[end], anchor: { x, y: end === "source" ? 1 : 0 } } };
}
const PINS: Record<string, ["source" | "target", number]> = {
  aePack: ["source", 0.25],
  aeInvoice: ["source", 0.75],
  aeJoinP: ["target", 0.25],
  aeJoinI: ["target", 0.75],
};
activityPage.edges = activityPage.edges.map((edge) => {
  const p = PINS[edge.id.replace(/_+$/, "")];
  return p ? pin(edge, p[0], p[1]) : edge;
});

export const activityTemplate = templateDoc("Activity diagram", [faceEdges(activityPage)]);

// ---------------------------------------------------------------- State machine
const statePage: Diagram = {
  id: tid("dUmlState"),
  title: "State machine",
  layers: createDefaultLayers(),
  nodes: [
    n("sStart", "uml/initial-node", "", 106, 40, 28, 28, 1, SOLID),
    n("sDraft", "uml/state", "Draft", 40, 120, 160, 64, 2),
    n("sSubmitted", "uml/state", "In review", 320, 120, 160, 64, 3),
    n("sApproved", "uml/state", "Approved", 600, 120, 160, 64, 4),
    n("sPublished", "uml/state", "Published", 880, 120, 160, 64, 5),
    n("sRejected", "uml/state", "Changes requested", 320, 300, 160, 64, 6),
    n("sEnd", "uml/final-node", "", 946, 280, 28, 28, 7, SOLID),
  ],
  edges: [
    e("seStart", "sStart", "sDraft", FLOW),
    e("seSubmit", "sDraft", "sSubmitted", FLOW, "submit"),
    e("seApprove", "sSubmitted", "sApproved", FLOW, "approve [complete]"),
    e("seReject", "sSubmitted", "sRejected", FLOW, "reject"),
    e("seRework", "sRejected", "sDraft", FLOW, "revise", ["left", "bottom"]),
    e("sePublish", "sApproved", "sPublished", FLOW, "publish"),
    e("seEnd", "sPublished", "sEnd", FLOW, "archive"),
  ],
};

export const stateMachineTemplate = templateDoc("State machine", [faceEdges(statePage)]);

// ---------------------------------------------------------------- Component
//
// Ball-and-socket wiring: a component *provides* an interface (the lollipop on a solid line) and
// another *requires* it (a dashed «use» dependency onto the ball).
const USE: StyleMap = { ...DEPENDENCY, edgeStyle: "orthogonal" };

const componentPage: Diagram = {
  id: tid("dUmlComponent"),
  title: "Component diagram",
  layers: createDefaultLayers(),
  nodes: [
    n("pStore", "uml/component", "«component»\nStorefront", 60, 260, 200, 110, 1),
    n("pOrders", "uml/component", "«component»\nOrder Service", 400, 260, 200, 110, 2),
    n("pPayments", "uml/component", "«component»\nPayment Service", 740, 260, 200, 110, 3),
    n("pCatalogue", "uml/component", "«component»\nCatalogue Service", 260, 610, 200, 110, 4),
    n("pOrderApi", "uml/interface", "OrderAPI", 470, 130, 60, 60, 5),
    n("pPayApi", "uml/interface", "PaymentAPI", 810, 130, 60, 60, 6),
    n("pCatApi", "uml/interface", "CatalogueAPI", 330, 470, 60, 60, 7),
  ],
  edges: [
    e("peOrders", "pOrderApi", "pOrders", ASSOCIATION, undefined, ["bottom", "top"]),
    e("peStore", "pStore", "pOrderApi", USE, "«use»", ["top", "left"]),
    e("pePayments", "pPayApi", "pPayments", ASSOCIATION, undefined, ["bottom", "top"]),
    e("peOrdersPay", "pOrders", "pPayApi", USE, "«use»", ["right", "left"]),
    e("peCatalogue", "pCatApi", "pCatalogue", ASSOCIATION, undefined, ["bottom", "top"]),
    e("peStoreCat", "pStore", "pCatApi", USE, "«use»", ["bottom", "left"]),
  ],
};
export const componentTemplate = templateDoc("Component diagram", [faceEdges(componentPage)]);

// ---------------------------------------------------------------- Deployment
const deploymentPage: Diagram = {
  id: tid("dUmlDeploy"),
  title: "Deployment diagram",
  layers: createDefaultLayers(),
  nodes: [
    n("dBrowser", "uml/node", "«device»\nCustomer Browser", 60, 60, 190, 140, 1),
    n("dWeb", "uml/node", "«device»\nWeb Server", 350, 60, 190, 140, 2),
    n("dDb", "uml/node", "«device»\nDatabase Server", 640, 60, 190, 140, 3),
    n("dSpa", "uml/artifact", "storefront.js", 90, 250, 130, 120, 4),
    n("dWar", "uml/artifact", "orders.war", 385, 250, 130, 120, 5),
    n("dSchema", "uml/artifact", "orders.sql", 675, 250, 130, 120, 6),
  ],
  edges: [
    e("deHttp", "dBrowser", "dWeb", DIRECTED, "«HTTPS»"),
    e("deJdbc", "dWeb", "dDb", DIRECTED, "«JDBC»"),
    e("deSpa", "dSpa", "dBrowser", DEPENDENCY, "«deploy»"),
    e("deWar", "dWar", "dWeb", DEPENDENCY, "«deploy»"),
    e("deSchema", "dSchema", "dDb", DEPENDENCY, "«deploy»"),
  ],
};

export const deploymentTemplate = templateDoc("Deployment diagram", [faceEdges(deploymentPage)]);
