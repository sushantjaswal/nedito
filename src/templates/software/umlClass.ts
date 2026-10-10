// UML class diagram: realization, inheritance, association, composition and aggregation in one
// picture, so the line ends that carry UML's meaning are all visible at once.
//
// Each class is three stacked compartments — name, attributes, operations — grouped so it moves
// as one, the way draw.io builds a class. A single label cannot be made to sit inside three
// compartments (the first version tried, and its text ran across the divider lines); three
// shapes can, and each compartment is then edited on its own, which is how people fill these in.
// Inheritance is drawn as UML's shared-arrow tree: both subclasses join one hollow triangle.
import { createDefaultLayers } from "../../model/layers";
import type { DEdge, Diagram, DNode, StyleMap } from "../../model/types";
import { templateDoc, tid } from "../starters/basicFlowchart";
import { AGGREGATION, ASSOCIATION, COMPOSITION, INHERITS, REALIZES } from "./umlKit";

const INK = "#1E2733";
const HEAD: StyleMap = { fill: "#EEEBFC", stroke: INK, strokeWidth: 1 };
const BODY: StyleMap = { fill: "#FFFFFF", stroke: INK, strokeWidth: 1, verticalAlign: "top" };
const W = 210;
const LINE = 16;

/**
 * A class as its three compartments plus the group that holds them. Edges attach to a
 * compartment (`slug` for the name, `slug + "A"` attributes, `slug + "O"` operations).
 */
function umlClass(slug: string, name: string, attributes: string[], operations: string[], x: number, y: number, z: number): DNode[] {
  const headH = name.includes("\n") ? 44 : 32;
  // An empty compartment is left out, as UML allows (an interface usually has no attributes).
  const attrH = attributes.length ? 12 + attributes.length * LINE : 0;
  const opsH = operations.length ? 12 + operations.length * LINE : 0;
  const part = (id: string, text: string, top: number, h: number, style: StyleMap, label: object): DNode => ({
    id: tid(id),
    type: "shape",
    shapeRef: "general/rect",
    position: { x, y: top },
    size: { w: W, h },
    z,
    style,
    label: { text, fontSize: 11, ...label },
  });
  const parts = [
    part(slug, name, y, headH, HEAD, { align: "center", bold: true }),
    ...(attrH ? [part(`${slug}A`, attributes.join("\n"), y + headH, attrH, BODY, { align: "left" })] : []),
    ...(opsH ? [part(`${slug}O`, operations.join("\n"), y + headH + attrH, opsH, BODY, { align: "left" })] : []),
  ];
  const group: DNode = {
    id: tid(`${slug}G`),
    type: "group",
    position: { x, y },
    size: { w: W, h: headH + attrH + opsH },
    z: z - 1,
    style: {},
    childIds: parts.map((p) => p.id),
  };
  return [group, ...parts];
}

function link(slug: string, from: string, to: string, style: StyleMap, sides: [string, string], text?: string): DEdge {
  const e: DEdge = {
    id: tid(slug),
    source: { nodeId: tid(from) },
    target: { nodeId: tid(to) },
    style: { ...style, edgeStyle: "orthogonal", sourceHandle: sides[0], targetHandle: sides[1] },
  };
  if (text) e.label = { text, fontSize: 10, color: "#66707D" };
  return e;
}

const page: Diagram = {
  id: tid("dUmlClass"),
  title: "Class diagram",
  layers: createDefaultLayers(),
  nodes: [
    ...umlClass("cPayable", "«interface»\nPayable", [], ["+ pay(amount: Money): Receipt"], 400, 20, 2),
    ...umlClass("cAccount", "Account", ["- id: string", "- balance: Money"], ["+ deposit(amount: Money)", "+ withdraw(amount: Money)"], 400, 220, 5),
    ...umlClass("cSavings", "SavingsAccount", ["- rate: Percent"], ["+ addInterest()"], 280, 500, 8),
    ...umlClass("cCurrent", "CurrentAccount", ["- overdraft: Money"], ["+ chargeFees()"], 540, 500, 11),
    ...umlClass("cCustomer", "Customer", ["- name: string", "- email: string"], ["+ openAccount(): Account"], 20, 220, 14),
    ...umlClass("cAddress", "Address", ["- line1: string", "- city: string", "- postcode: string"], [], 20, 500, 17),
    ...umlClass("cStatement", "Statement", ["- period: DateRange", "- format: Format"], ["+ render(): Document"], 780, 220, 20),
  ],
  edges: [
    link("clPayable", "cAccount", "cPayableO", REALIZES, ["top", "bottom"], "implements"),
    // The two subclasses share one triangle: their lines meet before it.
    link("clSavings", "cSavings", "cAccountO", INHERITS, ["top", "bottom"]),
    link("clCurrent", "cCurrent", "cAccountO", INHERITS, ["top", "bottom"]),
    link("clOwns", "cCustomerA", "cAccountA", ASSOCIATION, ["right", "left"], "owns  1..*"),
    link("clAddress", "cCustomerO", "cAddress", COMPOSITION, ["bottom", "top"], "lives at  1"),
    link("clStatement", "cAccountA", "cStatementA", AGGREGATION, ["right", "left"], "produces  0..*"),
  ],
};

export default templateDoc("Class diagram", [page]);
