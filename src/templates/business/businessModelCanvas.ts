// Business Model Canvas (Osterwalder).
//
// The nine blocks in their published arrangement, which is load-bearing rather than decorative:
// the left half is how value is made, the right half how it reaches customers, and the two
// blocks along the bottom are the money. Laid out any other way it stops being a canvas people
// recognise.
//
// Each block is a card — the block's name in a coloured band, its points as a list reading from
// the top-left — coloured by the canvas's four areas: infrastructure, the offer, customers and
// finance. The first version centred every block's text in the middle of its box, which reads as
// a label rather than as notes to be added to.
import { TINTS, card, node, page } from "./bizKit";
import { templateDoc } from "../starters/basicFlowchart";

const COL = 250;
const GAP = 10;
const TOP = 80;
const TALL = 380;
const HALF = (TALL - GAP) / 2;
const BOTTOM_H = 160;
const x = (i: number) => 60 + i * (COL + GAP);
const FULL = 5 * COL + 4 * GAP;
const HALF_W = (FULL - GAP) / 2;

const INFRA = TINTS.cool;
const OFFER = { fill: "#F3F1FD", stroke: "#6D5AE6", strokeWidth: 1 };
const CUSTOMERS = TINTS.good;
const COSTS = TINTS.warm;
const REVENUE = TINTS.bad;

const diagram = page(
  "dBmc",
  "Business Model Canvas",
  [
    { ...node("mTitle", "general/text", "Business Model Canvas — regional distributor", 60, 28, 700, 30, 1, { fill: "none", stroke: "none" }), label: { text: "Business Model Canvas — regional distributor", align: "left", fontSize: 16, bold: true } },

    ...card("mPartners", "Key Partners", ["Regional carriers", "Packaging supplier", "Payments provider"], x(0), TOP, COL, TALL, 2, INFRA),
    ...card("mActivities", "Key Activities", ["Sourcing", "Fulfilment", "Customer support"], x(1), TOP, COL, HALF, 5, INFRA),
    ...card("mResources", "Key Resources", ["Distribution centre", "Supplier contracts", "Brand"], x(1), TOP + HALF + GAP, COL, HALF, 8, INFRA),
    ...card("mValue", "Value Propositions", ["Next-day delivery", "A curated range", "No subscription needed"], x(2), TOP, COL, TALL, 11, OFFER),
    ...card("mRelations", "Customer Relationships", ["Self-serve online", "A named rep for trade"], x(3), TOP, COL, HALF, 14, CUSTOMERS),
    ...card("mChannels", "Channels", ["Web store", "Trade counter", "Marketplaces"], x(3), TOP + HALF + GAP, COL, HALF, 17, CUSTOMERS),
    ...card("mSegments", "Customer Segments", ["Households", "Small trade", "Office managers"], x(4), TOP, COL, TALL, 20, CUSTOMERS),

    ...card("mCosts", "Cost Structure", ["Stock and warehousing", "Carriage", "Payroll", "Payment fees"], 60, TOP + TALL + GAP, HALF_W, BOTTOM_H, 23, COSTS),
    ...card("mRevenue", "Revenue Streams", ["Product sales", "Delivery fees", "Trade accounts"], 60 + HALF_W + GAP, TOP + TALL + GAP, HALF_W, BOTTOM_H, 26, REVENUE),
  ],
  [],
);

export default templateDoc("Business Model Canvas", [diagram]);
