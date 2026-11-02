// A microservices platform, drawn without picking a cloud — each service a Nested Block.
//
// Every other architecture template here is somebody's cloud: Azure's landing zone, AWS's three
// tiers, GCP's web app. This one is the shape teams actually argue about before they choose a
// vendor — a gateway, a handful of services that own their own data, and an event bus between
// them — so it is drawn with generic shapes and vendor-neutral labels on purpose.
//
// A service is the natural Nested Block: "a thing with an API, some logic and its own database"
// is exactly one box on the platform view and a whole diagram one level down. Drawn flat, three
// services put twenty shapes on one canvas and the gateway's lines disappear into them. The two
// ports are the two things a service shows the outside world — the requests it answers and the
// events it publishes — so both survive the drill-in as ghosts.
import type { Diagram, NestedNode } from "../../model/types";
import { templateDoc, tid } from "../starters/basicFlowchart";
import { ACCENT, BOUNDARY, LINK, MANAGEMENT, PLAIN, ZONE, boundary, link, node, page } from "./archKit";

const ROUND = "general/rounded-rect";

interface Service {
  /** Id prefix, so three services can coexist in one document. */
  key: string;
  title: string;
  /** The route the gateway sends to, short enough to read inside the API box. */
  route: string;
  /** What the service is, in its own words. */
  role: string;
  store: string;
  /** The topic it publishes, named the way a real event is. */
  topic: string;
}

/** One service's child diagram: its API, its logic, its own store, its publisher. */
function service(s: Service): Diagram {
  const k = (suffix: string) => `${s.key}${suffix}`;
  return page(
    k("d"),
    s.title,
    [
      node(k("api"), ROUND, `HTTP API\n${s.route}`, 60, 150, 170, 70, 2, ACCENT),
      node(k("logic"), ROUND, s.role, 290, 150, 190, 70, 3, PLAIN),
      node(k("db"), "general/cylinder", s.store, 560, 60, 160, 80, 4, PLAIN),
      node(k("cache"), ROUND, "Read cache", 560, 190, 160, 60, 5, ZONE),
      node(k("pub"), ROUND, "Event publisher\n(outbox)", 290, 300, 190, 70, 6, ACCENT),
    ],
    [
      link(k("eApi"), k("api"), k("logic"), LINK, undefined, ["right", "left"]),
      link(k("eDb"), k("logic"), k("db"), LINK, undefined, ["right", "left"]),
      link(k("eCache"), k("logic"), k("cache"), MANAGEMENT, undefined, ["right", "left"]),
      link(k("ePub"), k("logic"), k("pub"), LINK, "domain events", ["bottom", "top"]),
    ],
  );
}

const ORDERS: Service = {
  key: "sOrd",
  title: "Orders service",
  route: "/orders",
  role: "Order domain\n(logic and rules)",
  store: "Orders store",
  topic: "order.created",
};

const CATALOGUE: Service = {
  key: "sCat",
  title: "Catalogue service",
  route: "/catalogue",
  role: "Catalogue domain\n(logic and rules)",
  store: "Catalogue store",
  topic: "stock.reserved",
};

const PAYMENTS: Service = {
  key: "sPay",
  title: "Payments service",
  route: "/payments",
  role: "Payment domain\n(logic and rules)",
  store: "Payments store",
  topic: "payment.captured",
};

const orders = service(ORDERS);
const catalogue = service(CATALOGUE);
const payments = service(PAYMENTS);

/**
 * A service as it appears on the platform view: requests in at the top, events out at the
 * bottom. Both ports are mapped, so opening the block shows a ghost for each.
 */
function serviceBlock(slug: string, s: Service, child: Diagram, x: number, z: number): NestedNode {
  return {
    id: tid(slug),
    type: "nested",
    childDiagramId: child.id,
    position: { x, y: 320 },
    size: { w: 260, h: 150 },
    z,
    style: {},
    label: { text: s.title, align: "center" },
    collapsed: { icons: [], summary: "api · logic · its own store" },
    ports: [
      { id: tid(`${slug}In`), side: "top", offset: 0.5, innerNodeId: tid(`${s.key}api`), label: s.route },
      { id: tid(`${slug}Out`), side: "bottom", offset: 0.5, innerNodeId: tid(`${s.key}pub`), label: s.topic },
    ],
  };
}

const ordersBlock = serviceBlock("mOrders", ORDERS, orders, 120, 6);
const catalogueBlock = serviceBlock("mCatalogue", CATALOGUE, catalogue, 420, 7);
const paymentsBlock = serviceBlock("mPayments", PAYMENTS, payments, 720, 8);
const blocks = [ordersBlock, catalogueBlock, paymentsBlock];

// Clients above the platform, the gateway as the one way in, the services in a row, the bus
// along the bottom where every service drops its events. Identity and observability sit beside
// the gateway rather than touching each service, which is both the truth and the only way the
// drawing stays readable.
const platform: Diagram = page(
  "dPlatform",
  "Platform",
  [
    node("mClients", ROUND, "Web and mobile clients", 420, 30, 190, 64, 12, PLAIN),

    ...boundary("mPlat", "Platform", 60, 140, 960, 560, BOUNDARY),

    node("mAuth", ROUND, "Identity provider\n(OIDC / JWT)", 90, 170, 190, 64, 2, ZONE),
    node("mGw", ROUND, "API gateway", 415, 170, 200, 64, 3, ACCENT),
    node("mObs", ROUND, "Metrics, logs\nand traces", 760, 170, 220, 64, 4, ZONE),

    ...blocks,

    // Named plainly, because this is what a child's ghost pill says when it points back up
    // here. The topics live on the lines instead, which is where a reader looks for them.
    node("mBus", ROUND, "Event bus", 120, 580, 860, 80, 5, ACCENT),
  ],
  [
    link("mClientsGw", "mClients", "mGw", LINK, undefined, ["bottom", "top"]),
    link("mGwAuth", "mGw", "mAuth", MANAGEMENT, "verifies JWT", ["left", "right"]),
    link("mGwObs", "mGw", "mObs", MANAGEMENT, "traces", ["right", "left"]),

    // Into each service's requests port, so the route survives one level down as a ghost.
    ...blocks.map((b, i) => ({
      id: tid(`mRoute${i}`),
      source: { nodeId: tid("mGw") },
      target: { nodeId: b.id, portId: b.ports[0].id },
      style: { ...LINK, sourceHandle: "bottom", targetHandle: "top" },
    })),

    // Out of each events port, straight down onto the bus beneath it: the anchors line the
    // three arrivals up under their own service rather than piling onto the bar's midpoint.
    ...blocks.map((b, i) => ({
      id: tid(`mEvent${i}`),
      source: { nodeId: b.id, portId: b.ports[1].id },
      target: { nodeId: tid("mBus"), anchor: { x: [0.15, 0.5, 0.85][i], y: 0 } },
      style: { ...LINK, sourceHandle: "bottom", targetHandle: "top" },
      label: { text: [ORDERS, CATALOGUE, PAYMENTS][i].topic, fontSize: 10, color: "#66707D" },
    })),
  ],
);

export default templateDoc("Platform", [platform, orders, catalogue, payments]);
