// Builds examples/online-store-domain.nedito.
//
// A domain model for a small online store, told twice: once as UML inside its bounded contexts,
// once as the database schema those classes become. It exercises what the other examples do not:
//
//   - edges with **both** ends on ports — a relationship between two Nested Blocks that is mapped
//     to a specific class inside each, so opening either context shows it as a ghost link on the
//     class it actually concerns;
//   - UML's line ends (generalisation, composition, aggregation) and crow's-foot cardinality in
//     one document;
//   - multi-line labels that stand in for class compartments and table columns.
//
// Rebuild with: npx vite-node examples/build.ts
import type { DEdge, DiagramDocument, Diagram, NestedNode, ShapeNode, StyleMap } from "../src/model/types";
import { EXAMPLE_DATE, id, layers } from "./lib";

const INK = "#1E2733";
const MUTED = "#66707D";

const CLASS: StyleMap = { fill: "#FFFFFF", stroke: INK, strokeWidth: 1 };
const LINE: StyleMap = { edgeStyle: "orthogonal", stroke: INK, strokeWidth: 1.25, startArrow: "none", endArrow: "none" };

type Side = "top" | "right" | "bottom" | "left";

/** A class box: name, a blank line, attributes, a blank line, operations. */
function cls(slug: string, name: string, attrs: string[], ops: string[], x: number, y: number, h = 130): ShapeNode {
  return {
    id: id(slug),
    type: "shape",
    shapeRef: "uml/class",
    position: { x, y },
    size: { w: 200, h },
    z: 1,
    style: CLASS,
    label: { text: [name, "", ...attrs, "", ...ops].join("\n"), align: "center", fontSize: 11 },
  };
}

function rel(slug: string, from: string, to: string, style: StyleMap, sides: [Side, Side], text?: string): DEdge {
  const edge: DEdge = {
    id: id(slug),
    source: { nodeId: id(from) },
    target: { nodeId: id(to) },
    style: { ...LINE, ...style, sourceHandle: sides[0], targetHandle: sides[1] },
  };
  if (text) edge.label = { text, fontSize: 10, color: MUTED };
  return edge;
}

// ---------------------------------------------------------------- the three contexts
const catalogue: Diagram = {
  id: id("dCatalogue"),
  title: "Catalogue",
  layers: layers("Catalogue"),
  nodes: [
    cls("cProduct", "Product", ["sku: Sku", "name: string", "price: Money"], ["reprice(amount)"], 60, 40),
    cls("cDigital", "DigitalProduct", ["downloadUrl: Url"], [], 20, 250, 100),
    cls("cPhysical", "PhysicalProduct", ["weightKg: number"], ["shippingClass()"], 250, 250, 100),
    cls("cCategory", "Category", ["name: string"], [], 360, 40, 100),
  ],
  edges: [
    // Generalisation: a hollow triangle at the parent.
    rel("ceDigital", "cDigital", "cProduct", { endArrow: "triangle" }, ["top", "bottom"]),
    rel("cePhysical", "cPhysical", "cProduct", { endArrow: "triangle" }, ["top", "bottom"]),
    // Aggregation: a category refers to products it does not own.
    rel("ceCategory", "cCategory", "cProduct", { startArrow: "diamond-open" }, ["left", "right"], "0..*"),
  ],
};

const ordering: Diagram = {
  id: id("dOrdering"),
  title: "Ordering",
  layers: layers("Ordering"),
  nodes: [
    cls("oOrder", "Order", ["orderNo: OrderNo", "placedAt: Instant", "status: Status"], ["place()", "cancel()"], 60, 40, 150),
    cls("oLine", "OrderLine", ["sku: Sku", "quantity: number"], ["subtotal()"], 60, 260, 120),
    cls("oCustomer", "Customer", ["name: string", "email: Email"], [], 360, 40, 110),
  ],
  edges: [
    // Composition: an order owns its lines; they do not outlive it.
    rel("oeLines", "oOrder", "oLine", { startArrow: "diamond" }, ["bottom", "top"], "1..*"),
    rel("oeCustomer", "oCustomer", "oOrder", { endArrow: "open" }, ["left", "right"], "places"),
  ],
};

const payments: Diagram = {
  id: id("dPayments"),
  title: "Payments",
  layers: layers("Payments"),
  nodes: [
    cls("pPayment", "Payment", ["amount: Money", "status: Status"], ["capture()", "refund()"], 60, 40, 140),
    cls("pCard", "CardPayment", ["last4: string"], [], 20, 250, 100),
    cls("pWallet", "WalletPayment", ["provider: string"], [], 250, 250, 100),
  ],
  edges: [
    rel("peCard", "pCard", "pPayment", { endArrow: "triangle" }, ["top", "bottom"]),
    rel("peWallet", "pWallet", "pPayment", { endArrow: "triangle" }, ["top", "bottom"]),
  ],
};

/** A context's Nested Block. Its ports are mapped to the class each cross-context link concerns. */
function context(
  slug: string,
  child: Diagram,
  x: number,
  y: number,
  summary: string,
  ports: NestedNode["ports"],
): NestedNode {
  return {
    id: id(slug),
    type: "nested",
    childDiagramId: child.id,
    position: { x, y },
    size: { w: 260, h: 160 },
    z: 1,
    style: {},
    label: { text: child.title, align: "center" },
    collapsed: { icons: [], summary },
    ports,
  };
}

const catalogueBlock = context("bCatalogue", catalogue, 40, 60, "products · categories", [
  { id: id("pcProduct"), side: "right", offset: 0.5, innerNodeId: id("cProduct"), label: "Product" },
]);
const orderingBlock = context("bOrdering", ordering, 440, 60, "orders · lines · customers", [
  { id: id("poLine"), side: "left", offset: 0.5, innerNodeId: id("oLine"), label: "OrderLine" },
  { id: id("poOrder"), side: "bottom", offset: 0.5, innerNodeId: id("oOrder"), label: "Order" },
]);
const paymentsBlock = context("bPayments", payments, 440, 360, "payments · methods", [
  { id: id("ppPayment"), side: "top", offset: 0.5, innerNodeId: id("pPayment"), label: "Payment" },
]);

/** An edge from one context's port to another's: mapped at both ends. */
function between(slug: string, from: NestedNode, fromPort: string, to: NestedNode, toPort: string, text: string): DEdge {
  return {
    id: id(slug),
    source: { nodeId: from.id, portId: id(fromPort) },
    target: { nodeId: to.id, portId: id(toPort) },
    style: { ...LINE, endArrow: "open", dash: "dashed" },
    label: { text, fontSize: 10, color: MUTED },
  };
}

const contexts: Diagram = {
  id: id("dContexts"),
  title: "Bounded contexts",
  layers: layers("Contexts"),
  nodes: [catalogueBlock, orderingBlock, paymentsBlock],
  edges: [
    between("xLineProduct", orderingBlock, "poLine", catalogueBlock, "pcProduct", "references by sku"),
    between("xOrderPayment", orderingBlock, "poOrder", paymentsBlock, "ppPayment", "requests payment"),
  ],
};

// ---------------------------------------------------------------- page 2: the schema
const ER_ONE_TO_MANY: StyleMap = { startArrow: "er-one", endArrow: "er-zero-or-many" };
const ER_ONE_TO_MANY_REQUIRED: StyleMap = { startArrow: "er-one", endArrow: "er-one-or-many" };
const ER_ONE_TO_ONE: StyleMap = { startArrow: "er-one", endArrow: "er-zero-or-one" };

function table(slug: string, name: string, columns: string[], x: number, y: number): ShapeNode {
  return {
    id: id(slug),
    type: "shape",
    shapeRef: "entity-relation/table",
    position: { x, y },
    size: { w: 210, h: 40 + columns.length * 20 },
    z: 1,
    style: CLASS,
    label: { text: [name, "", ...columns].join("\n"), align: "center", fontSize: 11 },
  };
}

const schema: Diagram = {
  id: id("dSchema"),
  title: "Schema",
  layers: layers("Schema"),
  nodes: [
    table("sCustomer", "CUSTOMER", ["PK customer_id", "name", "email"], 40, 40),
    table("sOrder", "ORDER", ["PK order_no", "FK customer_id", "placed_at", "status"], 360, 40),
    table("sLine", "ORDER_LINE", ["PK line_id", "FK order_no", "FK sku", "quantity"], 360, 300),
    table("sProduct", "PRODUCT", ["PK sku", "name", "price"], 680, 300),
    table("sPayment", "PAYMENT", ["PK payment_id", "FK order_no", "amount", "status"], 680, 40),
  ],
  edges: [
    rel("sOrders", "sCustomer", "sOrder", ER_ONE_TO_MANY, ["right", "left"], "places"),
    rel("sLines", "sOrder", "sLine", ER_ONE_TO_MANY_REQUIRED, ["bottom", "top"], "contains"),
    rel("sProducts", "sProduct", "sLine", ER_ONE_TO_MANY, ["left", "right"], "appears in"),
    rel("sPayments", "sOrder", "sPayment", ER_ONE_TO_ONE, ["right", "left"], "paid by"),
  ],
};

const doc: DiagramDocument = {
  formatVersion: 2,
  meta: { title: "Online store domain", created: EXAMPLE_DATE, modified: EXAMPLE_DATE, appVersion: "0.0.1" },
  rootDiagramIds: [contexts.id, schema.id],
  diagrams: {
    [contexts.id]: contexts,
    [schema.id]: schema,
    [catalogue.id]: catalogue,
    [ordering.id]: ordering,
    [payments.id]: payments,
  },
};

export default doc;
