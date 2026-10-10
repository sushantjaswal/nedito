// Builds examples/azure-landing-zone.nedito.
//
// The source is Microsoft's well-known Azure landing zone illustration, which draws three
// callout boxes hanging off the subscription row to show what is *inside* Connectivity, inside
// A2, and how subscriptions get vended. Those callouts are the whole reason this diagram is a
// good example: in Nedito they are not callouts at all, they are nested blocks you open.
//
// The "Virtual network peering" line is the piece worth looking at. In the original it is drawn
// between two callout boxes. Here it is a real edge between two nested blocks, mapped through
// ports to the actual Regional hub and Virtual network shapes inside each child — so it renders
// as a ghost link on both child canvases instead of being a line that means nothing once you
// zoom in.
//
// Rebuild with: npx vite-node examples/build.ts
import { EXAMPLE_DATE, id, layers } from "./lib";
import type { DEdge, DNode, DiagramDocument, Diagram, NestedNode, RichLabel, ShapeNode, StyleMap } from "../src/model/types";

const INK = "#1E2733";
const BOX: StyleMap = { fill: "#FFFFFF", stroke: INK, strokeWidth: 1 };
const SUBSCRIPTION: StyleMap = { fill: "#FDF3DF", stroke: "#C9820A", strokeWidth: 1 };
const GROUP_BAND: StyleMap = { fill: "#EDEFF3", stroke: "#D8DCE3", strokeWidth: 1 };
const OUTER_BAND: StyleMap = { fill: "#F2F7FC", stroke: "#CFE0EF", strokeWidth: 1 };
const AUTOMATION_BAND: StyleMap = { fill: "#F4F5F7", stroke: "#D8DCE3", strokeWidth: 1 };

const EDGE: StyleMap = { edgeStyle: "orthogonal", stroke: INK, strokeWidth: 1.25, startArrow: "none", endArrow: "none" };
const ARROW: StyleMap = { ...EDGE, endArrow: "classic" };
const PEERING: StyleMap = { ...EDGE, edgeStyle: "curved", stroke: "#4B3BC4", strokeWidth: 1.5, dash: "dashed" };

let z = 0;
const nextZ = () => ++z;

function label(text: string, extra: Partial<RichLabel> = {}): RichLabel {
  return { text, align: "center", ...extra };
}

function box(
  slug: string,
  text: string,
  x: number,
  y: number,
  w: number,
  h: number,
  style: StyleMap = BOX,
): ShapeNode {
  return {
    id: id(slug),
    type: "shape",
    shapeRef: "general/rect",
    position: { x, y },
    size: { w, h },
    z: nextZ(),
    style,
    label: label(text),
  };
}

const BAND_LABEL = "#445060";

/**
 * A titled background region, returned as *two* nodes: the rectangle and a separate caption.
 *
 * The title cannot live on the rectangle itself. A shape's label is centred vertically with no
 * way to anchor it to the top, so on a 300px-tall band it lands in the middle of the region and
 * collides with whatever is drawn there — which is exactly what happened on the first pass.
 *
 * Bands carry negative z so they stay behind every shape on them regardless of declaration
 * order: a fixed floor, not a value derived from the running counter, which would drift as
 * nodes are added.
 */
let bandZ = -1000;

/**
 * A free-standing text node, sized to its own content.
 *
 * Sizing matters more than it looks: a label is centred inside its node box, so a caption in a
 * box far wider than its text drifts into the middle of that box. Fitting the box to the text
 * is what makes "position this at the left" actually put it at the left.
 */
function caption(
  slug: string,
  text: string,
  x: number,
  y: number,
  opts: { fontSize?: number; bold?: boolean; color?: string; maxWidth?: number } = {},
): ShapeNode {
  const fontSize = opts.fontSize ?? 12;
  // Generous per-character estimate: a caption that wraps mid-word ("Budge t") looks like a bug.
  const width = Math.min(opts.maxWidth ?? 460, Math.max(64, Math.round(text.length * fontSize * 0.64) + 16));
  return {
    id: id(slug),
    type: "shape",
    shapeRef: "general/text",
    position: { x, y },
    size: { w: width, h: Math.round(fontSize * 1.9) },
    z: bandZ++,
    style: { fill: "none", stroke: "none" },
    label: { text, align: "center", bold: opts.bold ?? false, color: opts.color ?? INK, fontSize },
  };
}

function band(slug: string, text: string, x: number, y: number, w: number, h: number, style: StyleMap): ShapeNode[] {
  const rect: ShapeNode = {
    id: id(slug),
    type: "shape",
    shapeRef: "general/rect",
    position: { x, y },
    size: { w, h },
    z: bandZ++,
    style,
  };
  return [rect, caption(`${slug}Cap`, text, x + 14, y + 8, { fontSize: 13, bold: true, color: BAND_LABEL })];
}

/**
 * An icon with its name underneath, as two nodes.
 *
 * A shape's label is drawn centred *inside* the shape, which for a 64px vendor glyph means the
 * text lands on top of the artwork and neither is readable. Vendor icons are also the one kind
 * of shape that must render exactly as published (see stencils/types.ts), so overlaying text is
 * wrong twice over. The caption is a separate node sitting below the glyph.
 */
function icon(slug: string, shapeRef: string, text: string, x: number, y: number, size = 64): ShapeNode[] {
  const glyph: ShapeNode = {
    id: id(slug),
    type: "shape",
    shapeRef,
    position: { x, y },
    size: { w: size, h: size },
    z: nextZ(),
    style: {},
  };
  const cap = caption(`${slug}Cap`, text, 0, y + size + 6, { fontSize: 11, maxWidth: 150 });
  // Centre the caption under the glyph now that its width is known.
  cap.position = { x: Math.round(x + size / 2 - cap.size.w / 2), y: cap.position.y };
  return [glyph, cap];
}

function edge(slug: string, from: string, to: string, style: StyleMap = EDGE, text?: string): DEdge {
  const e: DEdge = { id: id(slug), source: { nodeId: id(from) }, target: { nodeId: id(to) }, style };
  if (text) e.label = { text, fontSize: 11, color: "#66707D" };
  return e;
}

// ---------------------------------------------------------------------------------------
// Child 1 — what is inside the Connectivity subscription
// ---------------------------------------------------------------------------------------
const connectivity: Diagram = {
  id: id("dConnectivity"),
  title: "Connectivity subscription",
  layers: layers("Connectivity"),
  nodes: [
    ...band("cBand", "Regional hub", 40, 40, 520, 320, OUTER_BAND),
    ...icon("cHub", "azure/networking/virtual-networks", "Regional hub virtual network", 250, 90),
    ...icon("cFirewall", "azure/networking/firewalls", "Azure Firewall", 90, 250),
    ...icon("cGateway", "azure/networking/virtual-network-gateways", "VPN / ExpressRoute gateway", 250, 250),
    ...icon("cBastion", "azure/networking/bastions", "Azure Bastion", 410, 250),
  ],
  edges: [
    edge("cE1", "cHub", "cFirewall"),
    edge("cE2", "cHub", "cGateway"),
    edge("cE3", "cHub", "cBastion"),
  ],
};

// ---------------------------------------------------------------------------------------
// Child 2 — what is inside the A2 subscription
// ---------------------------------------------------------------------------------------
const a2: Diagram = {
  id: id("dA2"),
  title: "A2 subscription",
  layers: layers("A2"),
  nodes: [
    ...band("aBand", "A2 subscription", 40, 40, 620, 330, OUTER_BAND),
    ...icon("aVnet", "azure/networking/virtual-networks", "Virtual network", 300, 90),
    ...icon("aBudget", "azure/general/cost-budgets", "Budget", 90, 260, 52),
    ...icon("aRole", "azure/identity/entra-identity-custom-roles", "Role assignment", 210, 260, 52),
    ...icon("aPolicy", "azure/management-governance/policy", "Policy assignment", 330, 260, 52),
    ...icon("aWatcher", "azure/monitor/network-watcher", "Network Watcher", 450, 260, 52),
    ...icon("aDefender", "azure/security/microsoft-defender-for-cloud", "Defender for Cloud", 570, 260, 52),
  ],
  edges: [],
};

// ---------------------------------------------------------------------------------------
// Child 3 — the subscription vending pipeline
// ---------------------------------------------------------------------------------------
const vending: Diagram = {
  id: id("dVending"),
  title: "Subscription vending automation",
  layers: layers("Vending"),
  nodes: [
    ...band("vBand", "Subscription vending automation", 40, 40, 780, 330, AUTOMATION_BAND),
    ...icon("vCollect", "azure/general/resource-groups", "Data collection tool", 90, 210),
    ...icon("vRequest", "azure/devops/azure-devops", "Request pipeline", 270, 210),
    ...icon("vSource", "azure/general/tfs-vc-repository", "Source control", 450, 210),
    ...icon("vDeploy", "azure/devops/azure-devops", "Deployment pipeline", 630, 210),
    {
      id: id("vParams"),
      type: "shape",
      shapeRef: "general/note",
      position: { x: 330, y: 80 },
      size: { w: 150, h: 70 },
      z: nextZ(),
      style: BOX,
      label: label("JSON/YAML subscription parameter file", { fontSize: 10, italic: true }),
    },
    {
      id: id("vModules"),
      type: "shape",
      shapeRef: "general/note",
      position: { x: 610, y: 80 },
      size: { w: 130, h: 70 },
      z: nextZ(),
      style: BOX,
      label: label("IaC modules", { fontSize: 10, italic: true }),
    },
  ],
  edges: [
    edge("vE1", "vCollect", "vRequest", ARROW, "trigger"),
    edge("vE2", "vRequest", "vSource", ARROW, "commit"),
    edge("vE3", "vSource", "vDeploy", ARROW, "trigger"),
    edge("vE4", "vParams", "vSource", { ...ARROW, dash: "dashed" }),
    edge("vE5", "vModules", "vDeploy", { ...ARROW, dash: "dashed" }),
  ],
};

// ---------------------------------------------------------------------------------------
// Page 1 — management group and subscription organization
// ---------------------------------------------------------------------------------------
const nestedConnectivity: NestedNode = {
  id: id("nConnectivity"),
  type: "nested",
  childDiagramId: connectivity.id,
  position: { x: 320, y: 455 },
  size: { w: 240, h: 120 },
  z: nextZ(),
  style: {},
  label: label("Connectivity subscription"),
  collapsed: { icons: ["azure/networking/virtual-networks"], summary: "hub · firewall · gateway" },
  ports: [
    // Mapped to the Regional hub inside the child, so the peering edge below means something
    // from both sides of the boundary.
    { id: id("pConnHub"), side: "right", offset: 0.5, innerNodeId: id("cHub"), label: "Regional hub" },
  ],
};

const nestedA2: NestedNode = {
  id: id("nA2"),
  type: "nested",
  childDiagramId: a2.id,
  position: { x: 620, y: 570 },
  size: { w: 240, h: 120 },
  z: nextZ(),
  style: {},
  label: label("A2 subscription"),
  collapsed: { icons: ["azure/networking/virtual-networks"], summary: "vnet · budget · policy" },
  ports: [
    { id: id("pA2Vnet"), side: "left", offset: 0.4, innerNodeId: id("aVnet"), label: "Virtual network" },
    { id: id("pA2Vend"), side: "right", offset: 0.6, innerNodeId: id("aVnet"), label: "Vended by automation" },
  ],
};

const nestedVending: NestedNode = {
  id: id("nVending"),
  type: "nested",
  childDiagramId: vending.id,
  position: { x: 1000, y: 820 },
  size: { w: 260, h: 130 },
  z: nextZ(),
  style: {},
  label: label("Subscription vending automation"),
  collapsed: { icons: ["azure/devops/azure-devops"], summary: "request · source · deploy" },
  ports: [{ id: id("pVendOut"), side: "left", offset: 0.5, innerNodeId: id("vDeploy"), label: "Deployment pipeline" }],
};

const mainNodes: DNode[] = [
  // Bands are sized to leave a clear strip at the top for their own labels; a title sitting
  // under the first row of boxes reads as a stray caption rather than as the region's name.
  ...band("mOuter", "Management group and subscription organization", 40, 30, 1290, 720, OUTER_BAND),
  ...band("mGroups", "Management group", 70, 80, 1230, 320, GROUP_BAND),
  ...band("mSubs", "Subscriptions", 70, 420, 1230, 300, OUTER_BAND),

  box("mTenant", "Tenant root group", 600, 120, 220, 46),
  box("mContoso", "Contoso", 620, 190, 180, 46),

  box("mPlatform", "Platform", 180, 260, 200, 46),
  box("mLanding", "Landing zones", 560, 260, 220, 46),
  box("mSandbox", "Sandbox", 1040, 260, 180, 46),

  box("mIdentity", "Identity", 100, 330, 170, 46),
  box("mConn", "Connectivity", 300, 330, 190, 46),
  box("mSap", "SAP", 520, 330, 130, 46),
  box("mCorp", "Corp", 680, 330, 130, 46),
  box("mOnline", "Online", 840, 330, 130, 46),

  box("mSubIdentity", "Identity subscription", 100, 460, 190, 100, SUBSCRIPTION),
  // A1 above A2 under Corp, stacked as in the source illustration.
  box("mSubA1", "A1 subscription", 620, 450, 190, 90, SUBSCRIPTION),
  box("mSubSandbox", "Sandbox subscription 1", 1060, 460, 200, 100, SUBSCRIPTION),

  nestedConnectivity,
  nestedA2,
  nestedVending,
];

const mainEdges: DEdge[] = [
  edge("mE1", "mTenant", "mContoso"),
  edge("mE2", "mContoso", "mPlatform"),
  edge("mE3", "mContoso", "mLanding"),
  edge("mE4", "mContoso", "mSandbox"),
  edge("mE5", "mPlatform", "mIdentity"),
  edge("mE6", "mPlatform", "mConn"),
  edge("mE7", "mLanding", "mSap"),
  edge("mE8", "mLanding", "mCorp"),
  edge("mE9", "mLanding", "mOnline"),
  edge("mE10", "mIdentity", "mSubIdentity"),
  edge("mE11", "mConn", "nConnectivity"),
  edge("mE12", "mCorp", "mSubA1"),
  edge("mE13", "mCorp", "nA2"),
  edge("mE14", "mSandbox", "mSubSandbox"),

  // The two boundary-crossing edges. Both name a port, which is what makes them show up inside
  // the child diagrams as ghost links rather than stopping at the box.
  {
    id: id("mPeering"),
    source: { nodeId: nestedConnectivity.id, portId: id("pConnHub") },
    target: { nodeId: nestedA2.id, portId: id("pA2Vnet") },
    style: PEERING,
    label: { text: "Virtual network peering", fontSize: 11, color: "#4B3BC4" },
  },
  {
    id: id("mVendEdge"),
    source: { nodeId: nestedVending.id, portId: id("pVendOut") },
    target: { nodeId: nestedA2.id, portId: id("pA2Vend") },
    style: { ...ARROW, stroke: "#66707D" },
    label: { text: "deploys", fontSize: 11, color: "#66707D" },
  },
];

const main: Diagram = {
  id: id("dMain"),
  title: "Landing zone organization",
  layers: layers("Main"),
  nodes: mainNodes,
  edges: mainEdges,
};

const now = EXAMPLE_DATE;
const doc: DiagramDocument = {
  formatVersion: 2,
  meta: {
    title: "Azure landing zone",
    created: now,
    modified: now,
    appVersion: "0.0.1",
  },
  rootDiagramIds: [main.id],
  diagrams: {
    [main.id]: main,
    [connectivity.id]: connectivity,
    [a2.id]: a2,
    [vending.id]: vending,
  },
};

export default doc;
