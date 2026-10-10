// Azure baseline AI chat: an agent on Microsoft Foundry behind a private network.
//
// Microsoft's "Baseline Microsoft Foundry chat reference architecture" (Azure Architecture
// Center), drawn as Azure draws it: a workload resource group holding a virtual network whose
// subnets are columns — Application Gateway, App Service integration, private endpoints, and the
// firewall — with the platform services to the right, reached only through private endpoints.
//
// The request, left to right: users reach the chat UI through Application Gateway and its web
// application firewall; App Service calls the Foundry agent over a private endpoint with its
// managed identity, never a key; the agent grounds its answer in AI Search, keeps the
// conversation in Cosmos DB and uploaded files in Storage, and calls the Azure OpenAI model —
// four lines fanning out from one agent, as the reference shows them. Anything the agent calls on
// the internet (an external API, an MCP server) leaves through Azure Firewall, which is the point
// of the baseline: no unreviewed egress. Key Vault, managed identities, Application Insights and
// Log Analytics sit below as the operations and identity plane.
//
// Every icon is Azure's own (azure/…) except the users and the external tools, which no Azure
// icon represents; vendor-neutral shapes stand in. Lines join icons at their sides or tops, clear
// of the names hung beneath them.
import type { DEdge, StyleMap } from "../../model/types";
import { BOUNDARY, DIRECT, LINK, MANAGEMENT, boundary, icon, link, page } from "./archKit";
import { templateDoc } from "../starters/basicFlowchart";

const AI = "azure/ai-machine-learning";
const NET = "azure/networking";

// Azure's own diagram conventions: a VNet in its blue, subnets in a lighter dashed blue, the
// resource group in grey, the AI platform in Foundry's purple.
const GROUP: StyleMap = { ...BOUNDARY, stroke: "#5F6368", dash: "solid" };
const VNET: StyleMap = { ...BOUNDARY, stroke: "#0078D4", dash: "solid" };
const SUBNET: StyleMap = { ...BOUNDARY, stroke: "#50A0E0" };
const FOUNDRY: StyleMap = { ...BOUNDARY, stroke: "#8661C5", dash: "solid" };
const DEPENDENCIES: StyleMap = { ...BOUNDARY, stroke: "#8661C5" };
const OPS: StyleMap = { ...BOUNDARY, stroke: "#E8A600" };

const diagram = page(
  "dAzureFoundryChat",
  "Azure baseline AI chat (Microsoft Foundry)",
  [
    ...icon("fUsers", "business/group", "Users", 40, 380, 5),
    ...icon("fTools", "network/cloud-queue", "External APIs\n& MCP servers", 1060, 20, 5),

    ...boundary("fRg", "Workload resource group", 150, 130, 1560, 620, GROUP),

    ...boundary("fVnet", "Virtual network (DDoS protection)", 180, 180, 840, 320, VNET),
    ...boundary("fSnGw", "App Gateway subnet", 200, 220, 180, 260, SUBNET),
    ...icon("fGateway", `${NET}/application-gateways`, "Application\nGateway + WAF", 262, 380, 6),
    ...boundary("fSnApp", "App Service subnet", 400, 220, 180, 260, SUBNET),
    ...icon("fWeb", "azure/app-services/app-services", "App Service\n(chat UI)", 462, 380, 6),
    ...boundary("fSnPe", "Private endpoints", 600, 220, 180, 260, SUBNET),
    ...icon("fPe", "azure/other/private-endpoints", "Private\nendpoints", 662, 380, 6),
    ...boundary("fSnFw", "Firewall subnet", 800, 220, 200, 260, SUBNET),
    ...icon("fFirewall", `${NET}/firewalls`, "Azure Firewall\n(egress)", 930, 260, 6),

    ...boundary("fFoundry", "Microsoft Foundry", 1060, 180, 260, 320, FOUNDRY),
    ...icon("fAgent", `${AI}/foundry-agent-service`, "Foundry Agent\nService", 1162, 380, 6),

    ...boundary("fDeps", "Models, knowledge & state", 1380, 180, 300, 520, DEPENDENCIES),
    ...icon("fOpenAi", `${AI}/azure-openai`, "Azure OpenAI\nmodels", 1502, 220, 6),
    ...icon("fSearch", `${AI}/cognitive-search`, "AI Search\n(knowledge)", 1502, 340, 6),
    ...icon("fCosmos", "azure/databases/azure-cosmos-db", "Cosmos DB\n(conversations)", 1502, 460, 6),
    ...icon("fStorage", "azure/storage/storage-accounts", "Storage\n(uploaded files)", 1502, 580, 6),

    ...boundary("fOps", "Operations & identity", 180, 550, 840, 170, OPS),
    ...icon("fVault", "azure/security/key-vaults", "Key Vault\n(TLS cert, secrets)", 240, 600, 7),
    ...icon("fIdentity", "azure/identity/managed-identities", "Managed\nidentities", 430, 600, 7),
    ...icon("fInsights", "azure/monitor/application-insights", "Application\nInsights", 620, 600, 7),
    ...icon("fLogs", "azure/monitor/log-analytics-workspaces", "Log Analytics", 810, 600, 7),
  ],
  [
    link("cUsers", "fUsers", "fGateway", LINK, "HTTPS", ["right", "left"]),
    link("cWeb", "fGateway", "fWeb", LINK, undefined, ["right", "left"]),
    link("cPe", "fWeb", "fPe", LINK, "managed\nidentity", ["right", "left"]),
    link("cAgent", "fPe", "fAgent", LINK, "invoke agent", ["right", "left"]),
    link("cModel", "fAgent", "fOpenAi", DIRECT, undefined, ["right", "left"]),
    link("cSearch", "fAgent", "fSearch", DIRECT, undefined, ["right", "left"]),
    link("cCosmos", "fAgent", "fCosmos", DIRECT, undefined, ["right", "left"]),
    link("cStorage", "fAgent", "fStorage", DIRECT, undefined, ["right", "left"]),
    link("cEgress", "fAgent", "fFirewall", LINK, "tool calls", ["left", "right"]),
    link("cTools", "fFirewall", "fTools", LINK, "allow-listed", ["top", "left"]),
    link("cTelemetry", "fVnet", "fInsights", MANAGEMENT, "telemetry", ["bottom", "top"]),
    link("cLogs", "fInsights", "fLogs", MANAGEMENT, undefined, ["right", "left"]),
  ],
);

// The agent's four dependency lines leave its right side at four heights, so they fan out rather
// than starting from one point; the egress line leaves its left side high, above the request.
const FAN: Record<string, number> = { cModel: 0.12, cSearch: 0.38, cCosmos: 0.62, cStorage: 0.88 };
diagram.edges = diagram.edges.map((e): DEdge => {
  const key = Object.keys(FAN).find((k) => e.id.startsWith(k));
  if (key) return { ...e, source: { ...e.source, anchor: { x: 1, y: FAN[key] } } };
  if (e.id.startsWith("cEgress")) return { ...e, source: { ...e.source, anchor: { x: 0, y: 0.15 } } };
  // Telemetry leaves the network's floor under the App Service column.
  if (e.id.startsWith("cTelemetry")) return { ...e, source: { ...e.source, anchor: { x: (650 - 180) / 840, y: 1 } } };
  return e;
});

export default templateDoc("Azure baseline AI chat (Microsoft Foundry)", [diagram]);
