// Azure hub-and-spoke landing zone, with each spoke VNet as a Nested Block.
//
// Hub-and-spoke is the pattern Azure's own Cloud Adoption Framework recommends, and it is the
// clearest architectural case for nesting after C4. A landing zone diagram has two jobs that
// fight each other: show the shared platform services in the hub, and show what each workload
// team actually runs. Drawn flat, either the hub is buried under workload detail or the spokes
// are reduced to empty boxes labelled "Spoke 1".
//
// Here each spoke *is* its own diagram. The platform view stays readable, and a workload team
// clicks into their own spoke and finds their subnets, VMs and databases. The peering to the
// hub is a port, so the connection survives the drill-in as a ghost link rather than being
// something the reader has to remember.
//
// Icon ids verified against examples/azure-landing-zone.nedito.
import type { DEdge, Diagram, NestedNode } from "../../model/types";
import { templateDoc, tid } from "../starters/basicFlowchart";
import { BOUNDARY, LINK, MANAGEMENT, PEERING, ZONE, boundary, icon, link, node, page } from "./archKit";

const NET = "azure/networking";

// Azure's own diagrams draw a VNet in its blue and a subnet in a lighter blue.
const AZURE_VNET = { ...BOUNDARY, stroke: "#0078D4", dash: "solid" };
const AZURE_SUBNET = { ...BOUNDARY, stroke: "#50A0E0" };

/** One spoke's child diagram: a VNet with its own subnets and workload. */
function spoke(
  key: string,
  title: string,
  tiers: { slug: string; shapeRef: string; caption: string }[],
): Diagram {
  const k = (s: string) => `${key}${s}`;
  return page(
    k("d"),
    title,
    [
      ...boundary(k("vnet"), `${title} spoke VNet`, 20, 20, 700, 220, BOUNDARY),
      ...boundary(k("subnet"), "Workload subnet", 50, 60, 640, 160, AZURE_SUBNET),
      ...tiers.flatMap((t, i) => icon(k(t.slug), t.shapeRef, t.caption, 120 + i * 220, 110, 2)),
      ...boundary(k("obs"), "Management subscription", 20, 300, 700, 140, ZONE),
      ...icon(k("logs"), "azure/analytics/log-analytics-workspaces", "Central Log Analytics", 342, 340, 3),
    ],
    [
      ...tiers.slice(0, -1).map((t, i) =>
        link(k(`f${i}`), k(t.slug), k(tiers[i + 1].slug), LINK, undefined, ["right", "left"]),
      ),
      // From the VNet's edge, not an icon's underside, where the icon's name hangs.
      { ...link(k("obsLink"), k("vnet"), k("logs"), MANAGEMENT, "diagnostics", ["bottom", "top"]), source: { nodeId: tid(k("vnet")), anchor: { x: 350 / 700, y: 1 } } },
    ],
  );
}

const retailSpoke = spoke("sr", "Retail", [
  { slug: "web", shapeRef: "azure/app-services/app-service-plans", caption: "App Service" },
  { slug: "api", shapeRef: "azure/compute/virtual-machine", caption: "API VMs" },
  { slug: "db", shapeRef: "azure/databases/sql-database", caption: "SQL Database" },
]);

const dataSpoke = spoke("sd", "Data platform", [
  { slug: "ingest", shapeRef: "azure/compute/virtual-machine", caption: "Ingest VMs" },
  { slug: "store", shapeRef: "azure/storage/storage-accounts", caption: "Storage Account" },
  { slug: "vault", shapeRef: "azure/security/key-vaults", caption: "Key Vault" },
]);

/** A spoke's Nested Block, peered to the hub through a single mapped port. */
function spokeBlock(slug: string, title: string, child: Diagram, innerNodeId: string, x: number, y: number, z: number): NestedNode {
  return {
    id: tid(slug),
    type: "nested",
    childDiagramId: child.id,
    position: { x, y },
    size: { w: 260, h: 170 },
    z,
    style: {},
    label: { text: title, align: "center" },
    collapsed: { icons: [], summary: "VNet · subnets · workload" },
    ports: [
      {
        id: tid(`${slug}P`),
        side: "left",
        offset: 0.5,
        innerNodeId: tid(innerNodeId),
        label: "VNet peering",
      },
    ],
  };
}

const retailBlock = spokeBlock("bRetail", "Retail spoke", retailSpoke, "srweb", 960, 85, 5);
const dataBlock = spokeBlock("bData", "Data platform spoke", dataSpoke, "sdingest", 960, 325, 6);

const peering = (slug: string, block: NestedNode, text: string): DEdge => ({
  id: tid(slug),
  source: { nodeId: tid("hFirewall") },
  target: { nodeId: block.id, portId: block.ports[0].id },
  style: { ...PEERING, sourceHandle: "right", targetHandle: "left" },
  label: { text, fontSize: 10, color: "#66707D" },
});

// Laid out as the Cloud Adoption Framework draws hub-and-spoke: on-premises on the left, the
// gateway and the firewall in line across the hub, the hub's shared services in a row beneath
// them, the spokes peered off the firewall on the right, and the management subscription below,
// governing the hub and collecting its diagnostics.
const platform: Diagram = page(
  "dAzureLz",
  "Platform",
  [
    node("onprem", "network/cloud", "On-premises", 40, 202, 120, 76, 2, ZONE),

    ...boundary("hub", "Hub VNet — connectivity subscription", 220, 150, 620, 300, AZURE_VNET),
    ...icon("hGateway", `${NET}/virtual-network-gateways`, "VPN / ExpressRoute\nGateway", 300, 212, 2),
    ...icon("hFirewall", `${NET}/firewalls`, "Azure Firewall", 560, 212, 3),
    ...icon("hBastion", `${NET}/bastions`, "Bastion", 270, 340, 4),
    ...icon("hDdos", `${NET}/ddos-protection-plans`, "DDoS Protection", 410, 340, 2),
    ...icon("hRoutes", `${NET}/route-tables`, "Route Tables", 550, 340, 3),
    ...icon("hWatcher", "azure/monitor/network-watcher", "Network Watcher", 690, 340, 4),

    ...boundary("mgmt", "Management subscription", 220, 500, 620, 130, ZONE),
    ...icon("mPolicy", "azure/management-governance/policy", "Azure Policy", 440, 540, 2),
    ...icon("mDefender", "azure/security/microsoft-defender-for-cloud", "Defender for Cloud", 580, 540, 3),
    ...icon("mLogs", "azure/analytics/log-analytics-workspaces", "Log Analytics", 720, 540, 4),

    retailBlock,
    dataBlock,
  ],
  [
    link("lOnprem", "onprem", "hGateway", LINK, "ExpressRoute", ["right", "left"]),
    link("lGwFw", "hGateway", "hFirewall", LINK, undefined, ["right", "left"]),
    // Zone to zone: policy governs the whole hub, and the whole hub reports its diagnostics.
    { ...link("lPolicy", "mPolicy", "hub", MANAGEMENT, "governs", ["top", "bottom"]), target: { nodeId: tid("hub"), anchor: { x: 248 / 620, y: 1 } } },
    { ...link("lLogs", "hub", "mLogs", MANAGEMENT, "diagnostics", ["bottom", "top"]), source: { nodeId: tid("hub"), anchor: { x: 528 / 620, y: 1 } } },
    peering("pRetail", retailBlock, "peering"),
    peering("pData", dataBlock, "peering"),
  ],
);

export default templateDoc("Platform", [platform, retailSpoke, dataSpoke]);
