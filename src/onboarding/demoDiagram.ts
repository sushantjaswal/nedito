// The first-visit sample document. Built through the same pure model actions a user's own
// edits go through — never hand-written JSON — so it is structurally indistinguishable from a
// real document and passes the identical validation (demoDiagram.test.ts asserts exactly that).
//
// Its job is to show the one thing a blank canvas cannot: that a box can hold a whole diagram,
// and that those can nest again. Hence two real levels of depth and a parent connection mapped
// through a port, so the ghost link renders on the child canvas rather than the boundary edge
// silently vanishing.
import { addEdge, addNode } from "../model/actions";
import { addNestedNode, addPort, setNestedCollapsed } from "../model/nesting";
import { createEmptyDoc } from "../model/store";
import type { DiagramDocument, ShapeNode } from "../model/types";

function shape(id: string, label: string, shapeRef: string, x: number, y: number, w = 150, h = 70): Omit<ShapeNode, "z"> {
  return {
    id,
    type: "shape",
    shapeRef,
    position: { x, y },
    size: { w, h },
    style: {},
    label: { text: label },
  };
}

// Every demo edge leaves a right edge and arrives at a left one. Without explicit handles
// React Flow picks its own, and a curved edge between mismatched sides swings out in a wide
// arc that crosses other shapes — which is exactly what made the first cut of this diagram
// look like a tangle rather than a considered example.
const FLOW = {
  edgeStyle: "curved",
  startArrow: "none",
  endArrow: "classic",
  sourceHandle: "right",
  targetHandle: "left",
};

export function buildDemoDoc(): DiagramDocument {
  let doc = createEmptyDoc();
  const root = doc.rootDiagramIds[0];
  doc = { ...doc, diagrams: { ...doc.diagrams, [root]: { ...doc.diagrams[root], title: "Main" } } };

  // ---- Level 0: the main page -------------------------------------------------------------
  doc = addNode(doc, root, shape("demo-gateway", "API Gateway", "general/rounded-rect", 60, 260, 170, 70));

  // Vertically centred on the gateway so the entry edge runs dead straight.
  const service = addNestedNode(doc, root, { x: 400, y: 220 }, { w: 260, h: 150 }, "Payment Service");
  doc = service.doc;
  doc = setNestedCollapsed(doc, root, service.nestedNodeId, { summary: "cards · fraud · ledger" });

  doc = addNode(doc, root, shape("demo-notify", "Notifications", "general/rounded-rect", 820, 150, 170, 70));
  doc = addNode(doc, root, shape("demo-orders", "Orders DB", "general/cylinder", 820, 400, 170, 90));

  // ---- Level 1: inside Payment Service -----------------------------------------------------
  const child = service.childDiagramId;
  doc = addNode(doc, child, shape("demo-payment-api", "Payment API", "general/rounded-rect", 60, 220, 180, 70));
  doc = addNode(doc, child, shape("demo-ledger", "Ledger DB", "general/cylinder", 350, 360, 160, 90));

  const fraud = addNestedNode(doc, child, { x: 350, y: 130 }, { w: 230, h: 130 }, "Fraud Engine");
  doc = fraud.doc;
  doc = setNestedCollapsed(doc, child, fraud.nestedNodeId, { summary: "rules · ML score" });

  doc = addEdge(doc, child, {
    id: "demo-e-api-fraud",
    source: { nodeId: "demo-payment-api" },
    target: { nodeId: fraud.nestedNodeId },
    style: { ...FLOW },
  });
  doc = addEdge(doc, child, {
    id: "demo-e-api-ledger",
    source: { nodeId: "demo-payment-api" },
    target: { nodeId: "demo-ledger" },
    style: { ...FLOW },
  });

  // ---- Level 2: inside Fraud Engine --------------------------------------------------------
  const grandchild = fraud.childDiagramId;
  doc = addNode(doc, grandchild, shape("demo-rules", "Rules Engine", "general/rounded-rect", 80, 80, 170, 70));
  doc = addNode(doc, grandchild, shape("demo-model", "Risk Model", "general/rounded-rect", 80, 240, 170, 70));
  doc = addNode(doc, grandchild, shape("demo-decision", "Decision", "general/diamond", 400, 145, 170, 100));
  doc = addEdge(doc, grandchild, {
    id: "demo-e-rules-decision",
    source: { nodeId: "demo-rules" },
    target: { nodeId: "demo-decision" },
    style: { ...FLOW },
  });
  doc = addEdge(doc, grandchild, {
    id: "demo-e-model-decision",
    source: { nodeId: "demo-model" },
    target: { nodeId: "demo-decision" },
    style: { ...FLOW },
  });

  // ---- The boundary-crossing connection ----------------------------------------------------
  // Mapped through a real port to Payment API, which is what makes the ghost link appear once
  // the user drills in. A plain edge to the nested node's body would look identical out here
  // and show nothing in there — the exact failure this app was fixing in D42.
  doc = addPort(doc, root, service.nestedNodeId, {
    side: "left",
    offset: 0.5,
    innerNodeId: "demo-payment-api",
    label: "in-1",
  });
  const inPort = (doc.diagrams[root].nodes.find((n) => n.id === service.nestedNodeId) as { ports: { id: string }[] })
    .ports[0];

  doc = addEdge(doc, root, {
    id: "demo-e-gateway-service",
    source: { nodeId: "demo-gateway" },
    target: { nodeId: service.nestedNodeId, portId: inPort.id },
    // Targets the port's own handle rather than the node's generic left one. They sit in the
    // same place today, but only this version follows the port if it is ever moved to another
    // side — and it matches what connect() records when a user drops an edge on a port.
    style: { ...FLOW, targetHandle: `port:${inPort.id}` },
  });
  doc = addEdge(doc, root, {
    id: "demo-e-service-notify",
    source: { nodeId: service.nestedNodeId },
    target: { nodeId: "demo-notify" },
    style: { ...FLOW },
    label: { text: "events" },
  });
  doc = addEdge(doc, root, {
    id: "demo-e-service-orders",
    source: { nodeId: service.nestedNodeId },
    target: { nodeId: "demo-orders" },
    style: { ...FLOW },
  });

  return {
    ...doc,
    meta: { ...doc.meta, title: "Sample diagram" },
  };
}
