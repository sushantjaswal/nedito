// ER diagram, Chen notation.
//
// Chen is the notation that draws relationships as their own diamond-shaped objects and hangs
// attributes off everything as ovals. It is verbose, which is exactly why it is still taught:
// the structure is visible rather than implied. Cardinality is written on the line (1, N, M),
// not drawn into the line's end — that is the crow's-foot dialect, and it has its own template.
import { CHEN_LINK, CHEN_TOTAL, link, node, page } from "./dataKit";
import { templateDoc } from "../starters/basicFlowchart";

const ER = "entity-relation";

const diagram = page(
  "dErChen",
  "ER diagram (Chen)",
  [
    // Entities.
    node("hCustomer", `${ER}/entity`, "Customer", 60, 250, 140, 70, 3),
    node("hOrder", `${ER}/entity`, "Order", 430, 250, 140, 70, 4),
    node("hLineItem", `${ER}/weak-entity`, "Line Item", 800, 250, 150, 75, 5),

    // Relationships.
    node("hPlaces", `${ER}/relationship`, "places", 250, 245, 130, 80, 6),
    node("hContains", `${ER}/weak-relationship`, "contains", 620, 245, 140, 85, 7),

    // Customer attributes.
    node("hCustId", `${ER}/key-attribute`, "customer_id", 20, 90, 130, 55, 8),
    node("hCustName", `${ER}/attribute`, "name", 170, 90, 110, 50, 9),
    node("hCustEmail", `${ER}/multivalued-attribute`, "email", 20, 400, 130, 55, 10),

    // Order attributes.
    node("hOrderNo", `${ER}/key-attribute`, "order_no", 360, 90, 120, 55, 11),
    node("hPlacedAt", `${ER}/attribute`, "placed_at", 500, 90, 120, 50, 12),
    node("hTotal", `${ER}/derived-attribute`, "total", 430, 400, 120, 50, 13),

    // Line item attributes.
    node("hQty", `${ER}/attribute`, "quantity", 830, 90, 120, 50, 14),
  ],
  [
    // A double line is total participation: every order is placed by some customer.
    link("hlPlacesC", "hCustomer", "hPlaces", CHEN_LINK, "1", ["right", "left"]),
    link("hlPlacesO", "hPlaces", "hOrder", CHEN_TOTAL, "N", ["right", "left"]),
    link("hlContainsO", "hOrder", "hContains", CHEN_TOTAL, "1", ["right", "left"]),
    link("hlContainsL", "hContains", "hLineItem", CHEN_TOTAL, "N", ["right", "left"]),

    link("hlCustId", "hCustId", "hCustomer", CHEN_LINK, undefined, ["bottom", "top"]),
    link("hlCustName", "hCustName", "hCustomer", CHEN_LINK, undefined, ["bottom", "top"]),
    link("hlCustEmail", "hCustEmail", "hCustomer", CHEN_LINK, undefined, ["top", "bottom"]),
    link("hlOrderNo", "hOrderNo", "hOrder", CHEN_LINK, undefined, ["bottom", "top"]),
    link("hlPlacedAt", "hPlacedAt", "hOrder", CHEN_LINK, undefined, ["bottom", "top"]),
    link("hlTotal", "hTotal", "hOrder", CHEN_LINK, undefined, ["top", "bottom"]),
    link("hlQty", "hQty", "hLineItem", CHEN_LINK, undefined, ["bottom", "top"]),
  ],
);

// An attribute's line meets its entity under (or over) the attribute itself, so an entity's
// attributes fan out along its edge instead of all converging on one point.
const byId = new Map(diagram.nodes.map((n) => [n.id, n]));
diagram.edges = diagram.edges.map((e) => {
  const attr = byId.get(e.source.nodeId!)!;
  const entity = byId.get(e.target.nodeId!)!;
  if (!attr.type || attr.type !== "shape" || !attr.shapeRef.includes("attribute")) return e;
  const cx = attr.position.x + attr.size.w / 2;
  const x = Math.min(0.85, Math.max(0.15, (cx - entity.position.x) / entity.size.w));
  const below = attr.position.y > entity.position.y;
  return { ...e, target: { ...e.target, anchor: { x, y: below ? 1 : 0 } } };
});

export default templateDoc("ER diagram (Chen)", [diagram]);
