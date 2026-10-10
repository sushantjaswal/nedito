// The template catalogue: metadata eagerly, documents lazily.
//
// The browser needs every template's name, category and description to draw its list, and that
// is a few hundred bytes. The documents are the expensive half, so they are loaded per category
// the same way stencil sections are — a catalogue of dozens must never inflate the main bundle.
import { stampClassicLook } from "../model/look";
import type { DiagramDocument } from "../model/types";
import { derivesNesting, type TemplateCategory, type TemplateDef, type TemplateMeta } from "./types";

type Loader = () => Promise<{ default: DiagramDocument }>;

interface Entry extends TemplateMeta {
  load: Loader;
}

const ENTRIES: Entry[] = [
  {
    id: "basic-flowchart",
    name: "Basic flowchart",
    category: "process",
    description: "Start, steps, a decision and an end.",
    keywords: ["process", "workflow", "decision", "steps", "diagram"],
    featured: true,
    load: () => import("./starters/basicFlowchart"),
  },
  {
    id: "flowchart-with-subprocess",
    name: "Flowchart with subprocess",
    category: "process",
    description: "A step that opens into its own flowchart.",
    keywords: ["process", "workflow", "subprocess", "nested", "predefined process", "drill down"],
    featured: true,
    load: () => import("./starters/flowchartWithSubprocess"),
  },
  {
    id: "c4-model",
    name: "C4 model",
    category: "software",
    description: "Context, Container and Component as three real nesting levels.",
    keywords: ["c4", "architecture", "context", "container", "component", "software", "nested", "system"],
    featured: true,
    load: () => import("./software/c4Model"),
  },
  {
    id: "uml-class",
    name: "UML class diagram",
    category: "software",
    description: "Classes with inheritance, composition and aggregation.",
    keywords: ["uml", "class", "oo", "inheritance", "composition", "aggregation", "model"],
    featured: false,
    load: () => import("./software/umlClass"),
  },
  {
    id: "uml-sequence",
    name: "UML sequence diagram",
    category: "software",
    description: "Lifelines, activation bars and a call-and-return exchange.",
    keywords: ["uml", "sequence", "lifeline", "message", "interaction", "call"],
    featured: false,
    load: () => import("./software/umlSequence"),
  },
  {
    id: "uml-use-case",
    name: "UML use case diagram",
    category: "software",
    description: "Actors outside a system boundary, use cases inside it.",
    keywords: ["uml", "use case", "actor", "boundary", "requirements", "scenario"],
    featured: false,
    load: () => import("./software/umlUseCase"),
  },
  {
    id: "uml-activity",
    name: "UML activity diagram",
    category: "software",
    description: "A flow with a decision and a parallel fork and join.",
    keywords: ["uml", "activity", "fork", "join", "parallel", "workflow", "swimlane"],
    featured: false,
    load: () => import("./software/umlActivity"),
  },
  {
    id: "uml-state-machine",
    name: "UML state machine",
    category: "software",
    description: "States and the labelled transitions between them.",
    keywords: ["uml", "state", "statechart", "transition", "lifecycle", "status"],
    featured: false,
    load: () => import("./software/umlState"),
  },
  {
    id: "uml-component",
    name: "UML component diagram",
    category: "software",
    description: "Components wired through provided and required interfaces.",
    keywords: ["uml", "component", "interface", "lollipop", "service", "module"],
    featured: false,
    load: () => import("./software/umlComponent"),
  },
  {
    id: "uml-deployment",
    name: "UML deployment diagram",
    category: "software",
    description: "Artifacts deployed onto device nodes.",
    keywords: ["uml", "deployment", "node", "artifact", "server", "infrastructure"],
    featured: false,
    load: () => import("./software/umlDeployment"),
  },
  {
    id: "dfd-levelled-yourdon",
    name: "Levelled DFD (Yourdon)",
    category: "data",
    description: "A context diagram whose process opens into its Level 1 decomposition.",
    keywords: ["dfd", "data flow", "yourdon", "demarco", "levelled", "context", "nested", "process", "balancing"],
    featured: true,
    load: () => import("./data/dfdYourdon"),
  },
  {
    id: "dfd-levelled-gane-sarson",
    name: "Levelled DFD (Gane & Sarson)",
    category: "data",
    description: "The same levelling, in Gane & Sarson notation.",
    keywords: ["dfd", "data flow", "gane", "sarson", "levelled", "context", "nested", "process"],
    featured: false,
    load: () => import("./data/dfdGaneSarson"),
  },
  {
    id: "er-chen",
    name: "ER diagram (Chen)",
    category: "data",
    description: "Entities, relationship diamonds and attribute ovals.",
    keywords: ["er", "erd", "chen", "entity", "relationship", "attribute", "database", "schema", "model"],
    featured: false,
    load: () => import("./data/erChen"),
  },
  {
    id: "er-crows-foot",
    name: "ER diagram (crow's foot)",
    category: "data",
    description: "Tables with crow's-foot cardinality on every relationship.",
    keywords: ["er", "erd", "crow's foot", "crows foot", "ie", "martin", "table", "database", "schema", "cardinality"],
    featured: false,
    load: () => import("./data/erCrowsFoot"),
  },
  {
    id: "data-pipeline",
    name: "Data pipeline",
    category: "data",
    description: "Sources, ingest, transform, store and serve.",
    keywords: ["data", "pipeline", "etl", "elt", "ingest", "transform", "warehouse", "lake", "analytics"],
    featured: false,
    load: () => import("./data/dataPipeline"),
  },
  {
    id: "azure-landing-zone",
    name: "Azure landing zone",
    category: "architecture",
    description: "Hub-and-spoke, where each spoke VNet opens into its own workload.",
    keywords: ["azure", "landing zone", "hub and spoke", "vnet", "cloud", "nested", "platform", "caf", "peering"],
    featured: true,
    load: () => import("./architecture/azureLandingZone"),
  },
  {
    id: "azure-foundry-chat",
    name: "Azure baseline AI chat",
    category: "architecture",
    description: "A Foundry agent with Azure OpenAI and AI Search, behind private endpoints and a firewall.",
    keywords: ["azure", "ai", "generative ai", "genai", "openai", "foundry", "agent", "chat", "rag", "ai search", "private endpoint", "baseline", "cloud"],
    featured: false,
    load: () => import("./architecture/azureFoundryChat"),
  },
  {
    id: "network-topology",
    name: "Network topology",
    category: "architecture",
    description: "Internet, firewall, DMZ and the internal LAN behind it.",
    keywords: ["network", "topology", "firewall", "router", "switch", "dmz", "lan", "vpn", "infrastructure"],
    featured: false,
    load: () => import("./architecture/networkTopology"),
  },
  {
    id: "aws-three-tier",
    name: "AWS three-tier web app",
    category: "architecture",
    description: "Edge, web, application and data tiers across two availability zones.",
    keywords: ["aws", "three tier", "web app", "vpc", "ec2", "rds", "cloudfront", "load balancer", "cloud"],
    featured: false,
    load: () => import("./architecture/awsThreeTier"),
  },
  {
    id: "aws-bedrock-rag",
    name: "AWS generative AI assistant",
    category: "architecture",
    description: "RAG on Amazon Bedrock: knowledge base, vector index, guardrails, private endpoint.",
    keywords: ["aws", "ai", "generative ai", "genai", "rag", "bedrock", "llm", "knowledge base", "vector", "opensearch", "chatbot", "assistant", "cloud"],
    featured: false,
    load: () => import("./architecture/awsBedrockRag"),
  },
  {
    id: "gcp-web-app",
    name: "GCP basic web app",
    category: "architecture",
    description: "Load balancing, Cloud Run and Compute Engine over Cloud SQL and Storage.",
    keywords: ["gcp", "google cloud", "web app", "cloud run", "compute engine", "cloud sql", "storage", "cloud"],
    featured: false,
    load: () => import("./architecture/gcpWebApp"),
  },
  {
    id: "gcp-ml-platform",
    name: "GCP ML platform",
    category: "architecture",
    description: "Train on Vertex AI and AI Hypercomputer, serve on GKE, retrain when models drift.",
    keywords: ["gcp", "google cloud", "ai", "ml", "machine learning", "mlops", "vertex ai", "tpu", "gpu", "gke", "inference", "training", "cloud"],
    featured: false,
    load: () => import("./architecture/gcpMlPlatform"),
  },
  {
    id: "kubernetes-cluster",
    name: "Kubernetes cluster",
    category: "architecture",
    description: "Control plane, ingress and namespaces that open into their workloads.",
    keywords: ["kubernetes", "k8s", "cluster", "namespace", "pod", "deployment", "ingress", "nested", "container"],
    featured: false,
    load: () => import("./architecture/kubernetesCluster"),
  },
  {
    id: "org-chart",
    name: "Org chart",
    category: "business",
    description: "Leadership on one page; each department opens into its team.",
    keywords: ["org chart", "organisation", "hierarchy", "reporting", "team", "people", "nested", "structure", "hr"],
    featured: false,
    load: () => import("./business/orgChart"),
  },
  {
    id: "swimlane-process",
    name: "Cross-functional process",
    category: "business",
    description: "Swimlanes showing which role owns each step.",
    keywords: ["swimlane", "cross-functional", "process", "lane", "handoff", "responsibility", "raci", "workflow"],
    featured: false,
    load: () => import("./business/swimlane"),
  },
  {
    id: "bpmn-basic",
    name: "BPMN (basic)",
    category: "business",
    description: "Pool and lanes, events, tasks and a labelled gateway.",
    keywords: ["bpmn", "process", "gateway", "event", "task", "pool", "lane", "notation", "workflow"],
    featured: false,
    load: () => import("./business/bpmnBasic"),
  },
  {
    id: "fishbone",
    name: "Fishbone (Ishikawa)",
    category: "business",
    description: "Cause-and-effect analysis with the classic six categories.",
    keywords: ["fishbone", "ishikawa", "cause and effect", "root cause", "rca", "6m", "quality", "analysis"],
    featured: false,
    load: () => import("./business/fishbone"),
  },
  {
    id: "swot",
    name: "SWOT",
    category: "business",
    description: "Strengths, weaknesses, opportunities and threats, with its axes.",
    keywords: ["swot", "strategy", "analysis", "strengths", "weaknesses", "opportunities", "threats", "planning"],
    featured: false,
    load: () => import("./business/swot"),
  },
  {
    id: "business-model-canvas",
    name: "Business Model Canvas",
    category: "business",
    description: "The nine blocks in their published arrangement.",
    keywords: ["business model", "canvas", "osterwalder", "strategy", "value proposition", "lean", "startup"],
    featured: false,
    load: () => import("./business/businessModelCanvas"),
  },
  {
    id: "customer-journey",
    name: "Customer journey map",
    category: "business",
    description: "Stages against what the customer does, thinks and feels.",
    keywords: ["customer journey", "journey map", "experience", "cx", "touchpoint", "persona", "service design"],
    featured: false,
    load: () => import("./business/customerJourney"),
  },
  {
    id: "milestone-timeline",
    name: "Milestone timeline",
    category: "business",
    description: "Evenly spaced milestones — deliberately not to scale.",
    keywords: ["timeline", "milestone", "roadmap", "plan", "schedule", "phases", "quarters"],
    featured: false,
    load: () => import("./business/milestoneTimeline"),
  },
  {
    id: "venn-two",
    name: "Venn — two sets",
    category: "thinking",
    description: "Two overlapping sets, with each region labelled.",
    keywords: ["venn", "overlap", "sets", "intersection", "compare", "prioritise", "sweet spot"],
    featured: false,
    load: () => import("./thinking/vennTwo"),
  },
  {
    id: "venn-three",
    name: "Venn — three sets",
    category: "thinking",
    description: "Three sets and all seven regions, centre highlighted.",
    keywords: ["venn", "overlap", "sets", "intersection", "three", "valuable feasible usable", "sweet spot"],
    featured: false,
    load: () => import("./thinking/vennThree"),
  },
  {
    id: "tree-diagram",
    name: "Tree diagram",
    category: "thinking",
    description: "A three-level hierarchy, no notation to learn.",
    keywords: ["tree", "hierarchy", "breakdown", "wbs", "structure", "levels", "taxonomy"],
    featured: false,
    load: () => import("./thinking/treeDiagram"),
  },
  {
    id: "decision-tree",
    name: "Decision tree",
    category: "thinking",
    description: "Questions branching to outcomes, every branch labelled.",
    keywords: ["decision tree", "triage", "choice", "branch", "if then", "routing", "playbook"],
    featured: false,
    load: () => import("./thinking/decisionTree"),
  },
  {
    id: "concept-map",
    name: "Concept map",
    category: "thinking",
    description: "Concepts joined by labelled relationships, not bare lines.",
    keywords: ["concept map", "relationships", "knowledge", "systems", "causal", "thinking", "model"],
    featured: false,
    load: () => import("./thinking/conceptMap"),
  },
  {
    id: "sitemap",
    name: "Sitemap",
    category: "thinking",
    description: "Site structure by page, with utility pages kept apart.",
    keywords: ["sitemap", "information architecture", "ia", "navigation", "pages", "website", "structure"],
    featured: false,
    load: () => import("./thinking/sitemap"),
  },
  {
    id: "mind-map",
    name: "Mind map",
    category: "thinking",
    description: "A central idea with themes branching off it.",
    keywords: ["brainstorm", "ideas", "notes", "branches", "thinking"],
    featured: true,
    load: () => import("./starters/mindMap"),
  },
];

/** Strips the loader, leaving the metadata the browser draws from. */
function meta(entry: Entry): TemplateMeta {
  const { load, ...rest } = entry;
  void load;
  return rest;
}

export function listTemplates(): TemplateMeta[] {
  return ENTRIES.map(meta);
}

export function templatesInCategory(category: TemplateCategory): TemplateMeta[] {
  // "Featured" is a view of the catalogue, not a home: a template lives in one real category
  // and appears in Featured as well when it is one of the six.
  return category === "featured"
    ? ENTRIES.filter((e) => e.featured).map(meta)
    : ENTRIES.filter((e) => e.category === category).map(meta);
}

export function featuredTemplates(): TemplateMeta[] {
  return templatesInCategory("featured");
}

const cache = new Map<string, TemplateDef>();

/** Loads a template's document, caching it for the session. */
export async function loadTemplate(id: string): Promise<TemplateDef | null> {
  const cached = cache.get(id);
  if (cached) return cached;

  const entry = ENTRIES.find((e) => e.id === id);
  if (!entry) return null;

  const module = await entry.load();
  // Templates keep the look they were designed in (R6 rule: templates do not change), so every
  // shape and edge in them is marked classic — on the canvas, in the previews and in exports.
  const doc = stampClassicLook(module.default);
  const def: TemplateDef = { ...meta(entry), doc, usesNesting: derivesNesting(doc) };
  cache.set(id, def);
  return def;
}

/** Every template, documents included. Used by the catalogue tests and by search. */
export async function loadAllTemplates(): Promise<TemplateDef[]> {
  const all = await Promise.all(ENTRIES.map((e) => loadTemplate(e.id)));
  return all.filter((t): t is TemplateDef => t !== null);
}

export function searchTemplates(templates: TemplateMeta[], query: string): TemplateMeta[] {
  const q = query.trim().toLowerCase();
  if (!q) return templates;
  return templates.filter((t) =>
    [t.name, t.description, t.id.replace(/-/g, " "), ...t.keywords].some((s) => s.toLowerCase().includes(q)),
  );
}
