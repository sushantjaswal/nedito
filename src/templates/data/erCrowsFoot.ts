// ER diagram, crow's-foot (IE / Martin) notation.
//
// The dialect people actually ship schemas in: an entity is drawn as its table, and cardinality
// lives in the line's ends rather than in a label. Reading one end tells you two things at once
// — the fork means "many", and the bar or ring in front of it means "at least one" or "maybe
// none". Every mark used here is in the Style panel (canvas/arrowheads.ts), added before this
// template was written, so nothing below is notation a user could not draw by hand.
//
// Each table is built the way schema tools draw one: a filled name band, then a narrow key column
// (PK / FK) beside the column list, the two lined up row for row. They are separate shapes,
// grouped, because a single label cannot be made to sit under a band and beside a key column —
// the first version tried, and its names ran across the band's rule.
import type { DNode, StyleMap } from "../../model/types";
import { tid } from "../starters/basicFlowchart";
import { ER_ONE_TO_MANY, ER_ONE_TO_MANY_REQUIRED, ER_ONE_TO_ONE, link, node, page } from "./dataKit";
import { templateDoc } from "../starters/basicFlowchart";

const INK = "#1E2733";
const HEAD: StyleMap = { fill: "#3C4A5C", stroke: INK, strokeWidth: 1 };
const CELL: StyleMap = { fill: "#FFFFFF", stroke: INK, strokeWidth: 1, verticalAlign: "top" };
const KEYS: StyleMap = { fill: "#F4F5F7", stroke: INK, strokeWidth: 1, verticalAlign: "top" };

const W = 220;
const KEY_W = 44;
const HEAD_H = 32;
const ROW = 15;

/**
 * A table: `columns` as [key, name] pairs, key "PK", "FK" or "". Edges attach to the column list
 * (`slug`) on the right and below, to the key column (`slug + "K"`) on the left, and to the name
 * band (`slug + "H"`) from above.
 */
function table(slug: string, name: string, columns: [string, string][], x: number, y: number, z: number): DNode[] {
  const bodyH = 12 + columns.length * ROW;
  const head = node(`${slug}H`, "general/rect", name, x, y, W, HEAD_H, z, HEAD);
  head.label = { text: name, align: "center", fontSize: 12, bold: true, color: "#FFFFFF" };
  const keys = node(`${slug}K`, "general/rect", columns.map(([k]) => k).join("\n"), x, y + HEAD_H, KEY_W, bodyH, z, KEYS);
  keys.label = { text: columns.map(([k]) => k || " ").join("\n"), align: "center", fontSize: 11, bold: true };
  const cols = node(slug, "general/rect", columns.map(([, c]) => c).join("\n"), x + KEY_W, y + HEAD_H, W - KEY_W, bodyH, z, CELL);
  cols.label = { text: columns.map(([, c]) => c).join("\n"), align: "left", fontSize: 11 };
  const parts = [head, keys, cols];
  const group: DNode = {
    id: tid(`${slug}G`),
    type: "group",
    position: { x, y },
    size: { w: W, h: HEAD_H + bodyH },
    z: z - 1,
    style: {},
    childIds: parts.map((p) => p.id),
  };
  return [group, ...parts];
}

const diagram = page(
  "dErCrow",
  "ER diagram (crow's foot)",
  [
    ...table("wCustomer", "CUSTOMER", [["PK", "customer_id"], ["", "name"], ["", "email"]], 60, 60, 2),
    ...table("wOrder", "ORDER", [["PK", "order_no"], ["FK", "customer_id"], ["", "placed_at"], ["", "status"]], 460, 60, 6),
    ...table("wLineItem", "ORDER_LINE", [["PK", "line_id"], ["FK", "order_no"], ["FK", "sku"], ["", "quantity"]], 460, 340, 10),
    ...table("wProduct", "PRODUCT", [["PK", "sku"], ["", "name"], ["", "unit_price"]], 860, 340, 14),
    ...table("wAddress", "ADDRESS", [["PK", "address_id"], ["FK", "customer_id"], ["", "line1"], ["", "city"]], 60, 340, 18),
  ],
  [
    // One customer has zero or more orders; every order has exactly one customer.
    link("wlOrders", "wCustomer", "wOrderK", ER_ONE_TO_MANY, "places", ["right", "left"]),
    // An order is worth drawing only if it has at least one line, so this end is "one or many".
    link("wlLines", "wOrder", "wLineItemH", ER_ONE_TO_MANY_REQUIRED, "contains", ["bottom", "top"]),
    link("wlProduct", "wProductK", "wLineItem", ER_ONE_TO_MANY, "appears in", ["left", "right"]),
    // Optional on both sides: a customer may have no address on file yet.
    link("wlAddress", "wCustomer", "wAddressH", ER_ONE_TO_ONE, "ships to", ["bottom", "top"]),
  ],
);

// Each line meets its far table level with where it leaves the near one, so it runs straight
// rather than at a slant between parts of different heights.
const PINS: Record<string, { x: number; y: number }> = {
  wlOrders: { x: 0, y: 28 / 72 },
  wlLines: { x: 132 / W, y: 0 },
  wlProduct: { x: 1, y: 28 / 72 },
  wlAddress: { x: 132 / W, y: 0 },
};
diagram.edges = diagram.edges.map((e) => {
  const at = PINS[e.id.replace(/_+$/, "")];
  return at ? { ...e, target: { ...e.target, anchor: at } } : e;
});

export default templateDoc("ER diagram (crow's foot)", [diagram]);
