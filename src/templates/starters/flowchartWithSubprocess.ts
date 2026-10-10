// Starter template: a flowchart whose predefined-process step is a Nested Block.
//
// This is the one that earns its place. A predefined process in ISO 5807 means "defined
// elsewhere" — and in every other tool, elsewhere is another page you have to go and find.
// Here it is the box itself, so the template teaches the differentiator while being a perfectly
// ordinary flowchart.
import { createDefaultLayers } from "../../model/layers";
import type { DEdge, Diagram, NestedNode } from "../../model/types";
import { EDGE_STYLE, edge, node, templateDoc, tid } from "./basicFlowchart";

/** The subprocess: what "Validate payment" actually does. Both outcomes return a result. */
const child: Diagram = {
  id: tid("dValidate"),
  title: "Validate payment",
  layers: createDefaultLayers(),
  nodes: [
    node("vStart", "flowchart/terminator", "Start", 240, 30, 150, 52, 1),
    node("vCard", "flowchart/process", "Check card details", 230, 130, 170, 60, 2),
    node("vFunds", "flowchart/decision", "Funds available?", 220, 240, 190, 96, 3),
    node("vAuth", "flowchart/process", "Authorise payment", 230, 390, 170, 60, 4),
    node("vDecline", "flowchart/process", "Decline payment", 480, 258, 170, 60, 5),
    node("vReturn", "flowchart/terminator", "Return result", 240, 500, 150, 52, 6),
  ],
  edges: [
    edge("veStart", "vStart", "vCard"),
    edge("veFunds", "vCard", "vFunds"),
    edge("veYes", "vFunds", "vAuth", "Yes"),
    edge("veNo", "vFunds", "vDecline", "No", ["right", "left"]),
    edge("veAuth", "vAuth", "vReturn"),
    edge("veDecline", "vDecline", "vReturn", undefined, ["bottom", "right"]),
  ],
};

const validateBlock: NestedNode = {
  id: tid("fValidate"),
  type: "nested",
  childDiagramId: child.id,
  position: { x: 280, y: 250 },
  size: { w: 200, h: 120 },
  z: 3,
  style: {},
  label: { text: "Validate payment", align: "center" },
  collapsed: { icons: [], summary: "card · funds · authorise" },
  // Mapped, not merely present: the spec requires a nested template to show a real ghost link
  // inside its child, and an unmapped port would render as an amber "waiting to be linked"
  // warning on a brand-new document — a template should never open looking unfinished.
  ports: [
    { id: tid("pValidateIn"), side: "top", offset: 0.5, innerNodeId: tid("vStart"), label: "Start" },
    { id: tid("pValidateOut"), side: "bottom", offset: 0.5, innerNodeId: tid("vReturn"), label: "Result" },
  ],
};

const crossingIn: DEdge = {
  id: tid("feToValidate"),
  source: { nodeId: tid("fTake") },
  target: { nodeId: validateBlock.id, portId: tid("pValidateIn") },
  // The port end is derived from portId (canvas/edgeRouting.ts endHandle); the shape end is not.
  style: { ...EDGE_STYLE, sourceHandle: "bottom" },
};

const crossingOut: DEdge = {
  id: tid("feFromValidate"),
  source: { nodeId: validateBlock.id, portId: tid("pValidateOut") },
  target: { nodeId: tid("fPaid") },
  style: { ...EDGE_STYLE, targetHandle: "top" },
};

const page: Diagram = {
  id: tid("dOrder"),
  title: "Order handling",
  layers: createDefaultLayers(),
  nodes: [
    node("fOrderStart", "flowchart/terminator", "Order placed", 280, 40, 200, 56, 1),
    node("fTake", "flowchart/data", "Take order details", 280, 145, 200, 60, 2),
    validateBlock,
    node("fPaid", "flowchart/decision", "Payment authorised?", 270, 420, 220, 100, 4),
    node("fShip", "flowchart/process", "Arrange shipping", 290, 570, 180, 60, 5),
    node("fOrderEnd", "flowchart/terminator", "Order confirmed", 280, 680, 200, 56, 6),
    node("fNotify", "flowchart/document", "Tell the customer", 570, 435, 180, 70, 7),
    node("fCancelled", "flowchart/terminator", "Order cancelled", 560, 680, 200, 56, 8),
  ],
  edges: [
    edge("feOrderStart", "fOrderStart", "fTake"),
    crossingIn,
    crossingOut,
    edge("fePaidYes", "fPaid", "fShip", "Yes"),
    edge("fePaidNo", "fPaid", "fNotify", "No", ["right", "left"]),
    edge("feOrderEnd", "fShip", "fOrderEnd"),
    edge("feCancel", "fNotify", "fCancelled"),
  ],
};

export default templateDoc("Order handling", [page, child]);
