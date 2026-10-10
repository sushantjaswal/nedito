// The C4 model as three real nesting levels: Context → Container → Component.
//
// This is the flagship software template, and the clearest case anywhere for nested blocks. C4
// is *defined* as a zoom: each level is the previous one's box opened up. Every other tool
// draws three separate diagrams and asks the reader to hold the relationship in their head.
// Here the Internet Banking system IS the container diagram, and the API Application IS the
// component diagram — one document, opened by clicking.
//
// Drawn to the notation as c4model.com publishes it: people and the system in focus in dark and
// mid blues, containers lighter, components lightest, anything outside the system grey; every
// element reads "Name / [Type: technology] / what it does"; relationships are labelled with what
// they do; the scope of each zoom is a dashed boundary; and every diagram carries a title and a
// key, which the C4 guidance asks for so a diagram can be read on its own.
//
// Each external element a level shows (the customer, the e-mail system, the mainframe) is the
// same element as the parent's, so the parent's port maps onto it: inside the child, the
// connection's ghost pill rides on the very box it stands for.
import { createDefaultLayers } from "../../model/layers";
import type { DEdge, Diagram, NestedNode, ShapeNode, StyleMap } from "../../model/types";
import { templateDoc, tid } from "../starters/basicFlowchart";
import { faceEdges } from "../faceEdges";
import { C4_REL } from "./umlKit";

// The C4 palette, as published.
const PERSON: StyleMap = { fill: "#08427B", stroke: "#052E56", strokeWidth: 1 };
const CONTAINER: StyleMap = { fill: "#438DD5", stroke: "#3C7FC0", strokeWidth: 1 };
const COMPONENT: StyleMap = { fill: "#85BBF0", stroke: "#5D82A8", strokeWidth: 1 };
const EXTERNAL: StyleMap = { fill: "#8C8C8C", stroke: "#6B6B6B", strokeWidth: 1 };
const BOUNDARY: StyleMap = { fill: "none", stroke: "#8C8C8C", strokeWidth: 1.25, verticalAlign: "bottom" };
const TEXT: StyleMap = { fill: "none", stroke: "none" };
/** How a Nested Block looks, for the key: the element in focus, which opens to the next level. */
const OPENS: StyleMap = { fill: "#EEEBFC", stroke: "#6D5AE6", strokeWidth: 1.25 };

/** C4 sets white text on its dark and mid blues and on grey; the lightest blue keeps ink. */
const WHITE_TEXT = new Set([PERSON, CONTAINER, EXTERNAL]);

function el(
  slug: string,
  shapeRef: string,
  text: string,
  x: number,
  y: number,
  w: number,
  h: number,
  z: number,
  style: StyleMap,
): ShapeNode {
  return {
    id: tid(slug),
    type: "shape",
    shapeRef,
    position: { x, y },
    size: { w, h },
    z,
    style,
    label: WHITE_TEXT.has(style) ? { text, align: "center", fontSize: 11, color: "#FFFFFF" } : { text, align: "center", fontSize: 11 },
  };
}

/** The dashed scope of a zoom, named at its foot as Structurizr draws it, clear of the lines coming in. */
function boundary(slug: string, text: string, x: number, y: number, w: number, h: number): ShapeNode {
  return { ...el(slug, "c4/boundary", text, x, y, w, h, 0, BOUNDARY), label: { text, align: "left", fontSize: 11, bold: true, color: "#5C5C5C" } };
}

function title(slug: string, text: string, sub: string, x: number, y: number, w = 560): ShapeNode[] {
  return [
    { ...el(slug, "general/text", text, x, y, w, 26, 0, TEXT), label: { text, align: "left", fontSize: 15, bold: true } },
    { ...el(`${slug}Sub`, "general/text", sub, x, y + 26, w, 22, 0, TEXT), label: { text: sub, align: "left", fontSize: 12, color: "#66707D" } },
  ];
}

/** The key: one swatch per kind of element the diagram uses. */
function key(prefix: string, x: number, y: number, kinds: [string, StyleMap][]): ShapeNode[] {
  return [
    { ...el(`${prefix}Key`, "general/text", "Key", x, y, 120, 22, 0, TEXT), label: { text: "Key", align: "left", fontSize: 11, bold: true } },
    ...kinds.map(([text, style], i) => el(`${prefix}Key${i}`, "general/rounded-rect", text, x, y + 28 + i * 40, 200, 32, 0, style)),
  ];
}

function rel(slug: string, from: string, to: string, text: string, sides?: [string, string]): DEdge {
  const e: DEdge = {
    id: tid(slug),
    source: { nodeId: tid(from) },
    target: { nodeId: tid(to) },
    style: sides ? { ...C4_REL, sourceHandle: sides[0], targetHandle: sides[1] } : C4_REL,
    label: { text, fontSize: 10, color: "#5C5C5C" },
  };
  return e;
}

/** A relationship to or from one of a nested block's ports. */
function portRel(slug: string, from: { node: string; port?: string }, to: { node: string; port?: string }, text: string, sides?: [string, string]): DEdge {
  const e = rel(slug, from.node, to.node, text, sides);
  if (from.port) e.source = { nodeId: tid(from.node), portId: tid(from.port) };
  if (to.port) e.target = { nodeId: tid(to.node), portId: tid(to.port) };
  return e;
}

/**
 * An API call from a client container down to a controller: a straight line meeting the
 * controller's top at its own point, so two callers into one controller stay two lines.
 */
function call(slug: string, from: string, to: string, at: number): DEdge {
  const e = rel(slug, from, to, "Calls [JSON/HTTPS]", ["bottom", "top"]);
  e.style = { ...e.style, edgeStyle: "straight" };
  e.target = { nodeId: tid(to), anchor: { x: at, y: 0 } };
  return e;
}

// ---------------------------------------------------------------- Level 3: Components
const componentLevel: Diagram = {
  id: tid("dC4Component"),
  title: "API Application",
  layers: createDefaultLayers(),
  nodes: [
    ...title("kTitle", "Component diagram — API Application", "Internet Banking System", 40, 20),
    el("kSpa", "c4/container", "Single-Page Application\n[Container: JavaScript, React]\nBanking in the browser", 200, 100, 220, 100, 1, CONTAINER),
    el("kMobile", "c4/container", "Mobile App\n[Container: Kotlin, Swift]\nBanking on the phone", 620, 100, 220, 100, 2, CONTAINER),
    boundary("kBoundary", "API Application\n[Container: Java, Spring MVC]", 40, 290, 960, 400),
    el("kSignIn", "c4/component", "Sign In Controller\n[Component: Spring MVC]\nSigns users in", 80, 320, 240, 100, 3, COMPONENT),
    el("kAccounts", "c4/component", "Accounts Controller\n[Component: Spring MVC]\nAccount summaries", 400, 320, 240, 100, 4, COMPONENT),
    el("kReset", "c4/component", "Reset Password Controller\n[Component: Spring MVC]\nResets passwords", 720, 320, 240, 100, 5, COMPONENT),
    el("kSecurity", "c4/component", "Security Component\n[Component: Spring Bean]\nSign-in and passwords", 80, 520, 240, 100, 6, COMPONENT),
    el("kFacade", "c4/component", "Mainframe Facade\n[Component: Spring Bean]\nTalks to the mainframe", 400, 520, 240, 100, 7, COMPONENT),
    el("kEmailer", "c4/component", "E-mail Component\n[Component: Spring Bean]\nSends e-mails", 720, 520, 240, 100, 8, COMPONENT),
    el("kDb", "general/cylinder", "Database\n[Container: PostgreSQL]\nUsers and credentials", 80, 740, 240, 110, 9, CONTAINER),
    el("kMainframe", "c4/external-system", "Mainframe Banking System\n[Software System]\nCore banking records", 400, 740, 240, 110, 10, EXTERNAL),
    el("kEmail", "c4/external-system", "E-mail System\n[Software System]\nMicrosoft Exchange", 720, 740, 240, 110, 11, EXTERNAL),
    ...key("k", 1060, 320, [
      ["Container", CONTAINER],
      ["Component", COMPONENT],
      ["External system", EXTERNAL],
    ]),
  ],
  edges: [
    call("krSpaSignIn", "kSpa", "kSignIn", 0.5),
    call("krSpaAcc", "kSpa", "kAccounts", 0.3),
    call("krMobAcc", "kMobile", "kAccounts", 0.7),
    call("krMobReset", "kMobile", "kReset", 0.5),
    rel("krSignInSec", "kSignIn", "kSecurity", "Uses"),
    rel("krAccFacade", "kAccounts", "kFacade", "Uses"),
    rel("krResetMail", "kReset", "kEmailer", "Uses"),
    rel("krSecDb", "kSecurity", "kDb", "Reads from and writes to"),
    rel("krFacadeMain", "kFacade", "kMainframe", "Makes API calls to [XML/HTTPS]"),
    rel("krMailSys", "kEmailer", "kEmail", "Sends e-mail using"),
  ],
};

// ---------------------------------------------------------------- Level 2: Containers
//
// A level opens at 100% from its top-left, not fitted (see DiagramCanvas), so the API
// Application — the block a reader opens next — sits high enough to be on screen when they land.
const apiApplication: NestedNode = {
  id: tid("cApi"),
  type: "nested",
  childDiagramId: componentLevel.id,
  position: { x: 390, y: 450 },
  size: { w: 260, h: 160 },
  z: 5,
  style: {},
  label: { text: "API Application", align: "center" },
  collapsed: { icons: [], summary: "[Container: Java, Spring MVC]" },
  ports: [
    { id: tid("cpSpa"), side: "top", offset: 0.4, innerNodeId: tid("kSpa"), label: "Single-Page Application" },
    { id: tid("cpMobile"), side: "top", offset: 0.85, innerNodeId: tid("kMobile"), label: "Mobile App" },
    { id: tid("cpDb"), side: "bottom", offset: 0.5, innerNodeId: tid("kDb"), label: "Database" },
    { id: tid("cpEmail"), side: "right", offset: 0.2, innerNodeId: tid("kEmail"), label: "E-mail System" },
    { id: tid("cpMainframe"), side: "right", offset: 0.9, innerNodeId: tid("kMainframe"), label: "Mainframe" },
  ],
};

const containerLevel: Diagram = {
  id: tid("dC4Container"),
  title: "Internet Banking System",
  layers: createDefaultLayers(),
  nodes: [
    ...title("cTitle", "Container diagram — Internet Banking System", "Big-bank customers' online banking", 40, 20),
    el("cCustomer", "c4/person", "Personal Banking Customer\n[Person]\nHolds accounts", 410, 80, 220, 150, 1, PERSON),
    boundary("cBoundary", "Internet Banking System\n[Software System]", 40, 270, 940, 550),
    el("cWeb", "c4/container", "Web Application\n[Container: Java, Spring MVC]\nServes the single-page app", 80, 310, 240, 100, 2, CONTAINER),
    el("cSpa", "c4/container", "Single-Page Application\n[Container: JavaScript, React]\nBanking in the browser", 390, 310, 240, 100, 3, CONTAINER),
    el("cMobile", "c4/container", "Mobile App\n[Container: Kotlin, Swift]\nBanking on the phone", 700, 310, 240, 100, 4, CONTAINER),
    apiApplication,
    el("cDb", "general/cylinder", "Database\n[Container: PostgreSQL]\nUsers, credentials, logs", 400, 670, 240, 120, 6, CONTAINER),
    el("cEmail", "c4/external-system", "E-mail System\n[Software System]\nMicrosoft Exchange", 1060, 432, 240, 100, 7, EXTERNAL),
    el("cMainframe", "c4/external-system", "Mainframe Banking System\n[Software System]\nCore banking records", 1060, 544, 240, 100, 8, EXTERNAL),
    ...key("c", 1060, 700, [
      ["Person", PERSON],
      ["Container", CONTAINER],
      ["Container — open to zoom in", OPENS],
      ["External system", EXTERNAL],
    ]),
  ],
  edges: [
    rel("crVisits", "cCustomer", "cWeb", "Visits bank.example using [HTTPS]", ["left", "top"]),
    rel("crViews", "cCustomer", "cSpa", "Views balances using", ["bottom", "top"]),
    rel("crMobile", "cCustomer", "cMobile", "Banks using", ["right", "top"]),
    rel("crDelivers", "cWeb", "cSpa", "Delivers", ["right", "left"]),
    portRel("crSpaApi", { node: "cSpa" }, { node: "cApi", port: "cpSpa" }, "Makes API calls to [JSON/HTTPS]", ["bottom", "top"]),
    portRel("crMobApi", { node: "cMobile" }, { node: "cApi", port: "cpMobile" }, "Makes API calls to", ["bottom", "top"]),
    portRel("crApiDb", { node: "cApi", port: "cpDb" }, { node: "cDb" }, "Reads and writes [SQL/TCP]", ["bottom", "top"]),
    portRel("crApiMail", { node: "cApi", port: "cpEmail" }, { node: "cEmail" }, "Sends e-mail using", ["right", "left"]),
    portRel("crApiMain", { node: "cApi", port: "cpMainframe" }, { node: "cMainframe" }, "Calls [XML/HTTPS]", ["right", "left"]),
  ],
};

// ---------------------------------------------------------------- Level 1: Context
const bankingSystem: NestedNode = {
  id: tid("xBanking"),
  type: "nested",
  childDiagramId: containerLevel.id,
  position: { x: 330, y: 360 },
  size: { w: 280, h: 150 },
  z: 2,
  style: {},
  label: { text: "Internet Banking System", align: "center" },
  collapsed: { icons: [], summary: "[Software System] Balances and payments" },
  ports: [
    { id: tid("xpCustomer"), side: "top", offset: 0.5, innerNodeId: tid("cCustomer"), label: "Personal Banking Customer" },
    { id: tid("xpEmail"), side: "right", offset: 0.5, innerNodeId: tid("cEmail"), label: "E-mail System" },
    { id: tid("xpMainframe"), side: "bottom", offset: 0.5, innerNodeId: tid("cMainframe"), label: "Mainframe Banking System" },
  ],
};

const contextLevel: Diagram = {
  id: tid("dC4Context"),
  title: "System Context",
  layers: createDefaultLayers(),
  nodes: [
    ...title("xTitle", "System Context diagram — Internet Banking System", "Who uses it, and what it depends on", 40, 20),
    el("xCustomer", "c4/person", "Personal Banking Customer\n[Person]\nA customer of the bank", 360, 100, 220, 170, 1, PERSON),
    bankingSystem,
    el("xEmail", "c4/external-system", "E-mail System\n[Software System]\nMicrosoft Exchange", 760, 370, 240, 130, 3, EXTERNAL),
    el("xMainframe", "c4/external-system", "Mainframe Banking System\n[Software System]\nCustomers, accounts, transactions", 330, 620, 280, 130, 4, EXTERNAL),
    ...key("x", 760, 600, [
      ["Person", PERSON],
      ["System — open to zoom in", OPENS],
      ["External system", EXTERNAL],
    ]),
  ],
  edges: [
    portRel("xrUses", { node: "xCustomer" }, { node: "xBanking", port: "xpCustomer" }, "Views balances and makes payments using", ["bottom", "top"]),
    portRel("xrEmail", { node: "xBanking", port: "xpEmail" }, { node: "xEmail" }, "Sends e-mail using", ["right", "left"]),
    portRel("xrMainframe", { node: "xBanking", port: "xpMainframe" }, { node: "xMainframe" }, "Gets account information from", ["bottom", "top"]),
    rel("xrNotify", "xEmail", "xCustomer", "Sends e-mails to", ["top", "right"]),
  ],
};

export default templateDoc("System Context", [faceEdges(contextLevel), faceEdges(containerLevel), faceEdges(componentLevel)]);
