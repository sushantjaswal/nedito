// Builds examples/incident-runbook.nedito.
//
// An on-call runbook: what happens when an alert fires, drilled into twice — Triage opens into
// Diagnose, and Diagnose opens into Database checks. It exists to exercise the parts of the file
// format the Azure example and the 35 templates never touch, so that a change which breaks any of
// them fails a test on a real document rather than on someone's diagram:
//
//   - two pages, and nesting two levels deep, with ports mapped at both levels;
//   - waypoints on an edge;
//   - a group;
//   - a second layer, locked, holding the runbook's ownership note;
//   - bold, italic and coloured labels, and dashed edges;
//   - one port deliberately left **unmapped** — "Escalate from Database checks" has nothing to
//     point at inside yet — because a waiting port is a real state the format has to carry, and
//     it renders as the amber "waiting to be linked" marker rather than being dropped.
//
// Rebuild with: npx vite-node examples/build.ts
import type { DEdge, DiagramDocument, Diagram, NestedNode, RichLabel, ShapeNode, StyleMap } from "../src/model/types";
import { EXAMPLE_DATE, id, layers } from "./lib";

const INK = "#1E2733";
const MUTED = "#66707D";
const WARN = "#C9820A";

const PLAIN: StyleMap = { fill: "#FFFFFF", stroke: INK, strokeWidth: 1 };
const FLOW: StyleMap = { edgeStyle: "orthogonal", stroke: MUTED, strokeWidth: 1.5, startArrow: "none", endArrow: "classic" };

type Side = "top" | "right" | "bottom" | "left";

function shape(
  slug: string,
  shapeRef: string,
  text: string,
  x: number,
  y: number,
  w: number,
  h: number,
  z: number,
  extra: { style?: StyleMap; label?: Partial<RichLabel>; layerId?: string } = {},
): ShapeNode {
  const node: ShapeNode = {
    id: id(slug),
    type: "shape",
    shapeRef,
    position: { x, y },
    size: { w, h },
    z,
    style: extra.style ?? PLAIN,
    label: { text, align: "center", fontSize: 12, ...extra.label },
  };
  if (extra.layerId) node.layerId = extra.layerId;
  return node;
}

function flow(slug: string, from: string, to: string, sides: [Side, Side], text?: string, style: StyleMap = FLOW): DEdge {
  const edge: DEdge = {
    id: id(slug),
    source: { nodeId: id(from) },
    target: { nodeId: id(to) },
    style: { ...style, sourceHandle: sides[0], targetHandle: sides[1] },
  };
  if (text) edge.label = { text, fontSize: 11, color: MUTED };
  return edge;
}

// ---------------------------------------------------------------- level 2: Database checks
const databaseChecks: Diagram = {
  id: id("dDbChecks"),
  title: "Database checks",
  layers: layers("DbChecks"),
  nodes: [
    shape("dbLag", "flowchart/process", "Check replication lag", 60, 40, 200, 60, 1),
    shape("dbConn", "flowchart/process", "Check connection pool", 60, 150, 200, 60, 2),
    shape("dbHealthy", "flowchart/decision", "Primary healthy?", 50, 260, 220, 100, 3),
    shape("dbFailover", "bpmn/task", "Fail over to replica", 360, 280, 200, 60, 4, {
      label: { bold: true, color: WARN },
    }),
    shape("dbDone", "flowchart/terminator", "Back to Diagnose", 60, 420, 200, 56, 5),
  ],
  edges: [
    flow("dbE1", "dbLag", "dbConn", ["bottom", "top"]),
    flow("dbE2", "dbConn", "dbHealthy", ["bottom", "top"]),
    flow("dbE3", "dbHealthy", "dbFailover", ["right", "left"], "no"),
    flow("dbE4", "dbHealthy", "dbDone", ["bottom", "top"], "yes"),
    // Waypoints: the failover path returns round the right-hand side rather than cutting back
    // across the decision it came out of.
    {
      ...flow("dbE5", "dbFailover", "dbDone", ["bottom", "right"]),
      waypoints: [
        { x: 460, y: 448 },
      ],
    },
  ],
};

// ---------------------------------------------------------------- level 1: Diagnose
const dbBlock: NestedNode = {
  id: id("nDbChecks"),
  type: "nested",
  childDiagramId: databaseChecks.id,
  position: { x: 340, y: 240 },
  size: { w: 240, h: 140 },
  z: 4,
  style: {},
  label: { text: "Database checks", align: "center" },
  collapsed: { icons: [], summary: "lag · pool · failover" },
  ports: [
    { id: id("pDbIn"), side: "left", offset: 0.5, innerNodeId: id("dbLag"), label: "suspect database" },
    { id: id("pDbOut"), side: "bottom", offset: 0.5, innerNodeId: id("dbDone"), label: "checked" },
    // Deliberately unmapped: nothing inside handles escalation yet. A real, legal state.
    { id: id("pDbEscalate"), side: "right", offset: 0.3, label: "escalate" },
  ],
};

const diagnose: Diagram = {
  id: id("dDiagnose"),
  title: "Diagnose",
  layers: layers("Diagnose"),
  nodes: [
    shape("gDash", "flowchart/process", "Open service dashboards", 60, 40, 220, 60, 1),
    shape("gDeploy", "flowchart/decision", "Deploy in the last hour?", 50, 150, 240, 110, 2),
    shape("gRollback", "bpmn/task", "Roll back the deploy", 360, 170, 200, 60, 3),
    dbBlock,
    shape("gNext", "flowchart/terminator", "Back to Triage", 60, 460, 220, 56, 5),
    shape("gPager", "general/rounded-rect", "Page the database owner", 660, 260, 200, 60, 6),
  ],
  edges: [
    flow("gE1", "gDash", "gDeploy", ["bottom", "top"]),
    flow("gE2", "gDeploy", "gRollback", ["right", "left"], "yes"),
    {
      id: id("gE3"),
      source: { nodeId: id("gDeploy") },
      target: { nodeId: dbBlock.id, portId: id("pDbIn") },
      style: { ...FLOW, sourceHandle: "bottom" },
      label: { text: "no", fontSize: 11, color: MUTED },
    },
    {
      id: id("gE4"),
      source: { nodeId: dbBlock.id, portId: id("pDbOut") },
      target: { nodeId: id("gNext") },
      style: { ...FLOW, targetHandle: "right" },
    },
    {
      id: id("gE5"),
      source: { nodeId: dbBlock.id, portId: id("pDbEscalate") },
      target: { nodeId: id("gPager") },
      style: { ...FLOW, dash: "dashed", targetHandle: "left" },
      label: { text: "not linked yet", fontSize: 11, color: WARN, italic: true },
    },
    // Round the block, into the top: dropped straight down, this ran behind the Database checks
    // block, which is drawn above the edge layer, so the line disappeared; brought in from below,
    // it landed on the ghost link that marks Back to Triage's exit to the parent.
    {
      ...flow("gE6", "gRollback", "gNext", ["right", "top"]),
      waypoints: [
        { x: 620, y: 200 },
        { x: 620, y: 420 },
        { x: 170, y: 420 },
      ],
    },
  ],
};

// ---------------------------------------------------------------- level 0: Triage (page 1)
const diagnoseBlock: NestedNode = {
  id: id("nDiagnose"),
  type: "nested",
  childDiagramId: diagnose.id,
  position: { x: 300, y: 380 },
  size: { w: 240, h: 140 },
  z: 5,
  style: {},
  label: { text: "Diagnose", align: "center" },
  collapsed: { icons: [], summary: "dashboards · deploys · database" },
  ports: [
    { id: id("pDiagIn"), side: "top", offset: 0.5, innerNodeId: id("gDash"), label: "customer-facing" },
    { id: id("pDiagOut"), side: "bottom", offset: 0.5, innerNodeId: id("gNext"), label: "cause found" },
  ],
};

const ANNOTATIONS: Parameters<typeof layers>[1] = [{ name: "Annotations", visible: true, locked: true }];
const triageLayers = layers("Triage", ANNOTATIONS);

const triage: Diagram = {
  id: id("dTriage"),
  title: "Triage",
  layers: triageLayers,
  nodes: [
    shape("tAlert", "flowchart/terminator", "Alert fires", 320, 30, 200, 56, 1, {
      style: { fill: "#FDF3DF", stroke: WARN, strokeWidth: 1.5 },
      label: { bold: true },
    }),
    shape("tAck", "flowchart/process", "Acknowledge within 5 minutes", 300, 130, 240, 60, 2),
    shape("tFacing", "flowchart/decision", "Customer-facing?", 310, 230, 220, 100, 3),
    diagnoseBlock,
    shape("tResolve", "flowchart/terminator", "Resolved — write it up", 320, 600, 200, 56, 8),
    shape("tTicket", "flowchart/process", "Open a ticket for business hours", 640, 250, 240, 60, 9),

    // A group: the two communication steps move together. On the left, so the dashed "in
    // parallel" line reaches it without crossing the Diagnose block — the first layout ran it
    // straight across the block, which reads as a connection into Diagnose.
    {
      id: id("gComms"),
      type: "group",
      position: { x: 20, y: 380 },
      size: { w: 260, h: 170 },
      z: 6,
      style: {},
      childIds: [id("tStatus"), id("tLead")],
    },
    shape("tStatus", "general/rounded-rect", "Post a status update", 40, 395, 220, 56, 7, { label: { bold: true } }),
    shape("tLead", "general/rounded-rect", "Page the incident lead", 40, 480, 220, 56, 7),

    // On the locked Annotations layer: present, visible, and not accidentally moved.
    shape("tOwner", "general/note", "Runbook v3\nOwner: SRE on-call", 40, 30, 180, 80, 10, {
      style: { fill: "#FFF9DB", stroke: "#C9A20A", strokeWidth: 1 },
      label: { italic: true, align: "left", fontSize: 11 },
      layerId: triageLayers[1].id,
    }),
  ],
  edges: [
    flow("tE1", "tAlert", "tAck", ["bottom", "top"]),
    flow("tE2", "tAck", "tFacing", ["bottom", "top"]),
    {
      id: id("tE3"),
      source: { nodeId: id("tFacing") },
      target: { nodeId: diagnoseBlock.id, portId: id("pDiagIn") },
      style: { ...FLOW, sourceHandle: "bottom" },
      label: { text: "yes", fontSize: 11, color: MUTED },
    },
    flow("tE4", "tFacing", "tTicket", ["right", "left"], "no"),
    {
      id: id("tE5"),
      source: { nodeId: diagnoseBlock.id, portId: id("pDiagOut") },
      target: { nodeId: id("tResolve") },
      style: { ...FLOW, targetHandle: "top" },
    },
    // Dashed: communication runs alongside the fix rather than after it.
    flow("tE6", "tFacing", "tStatus", ["left", "right"], "in parallel", { ...FLOW, dash: "dashed" }),
    flow("tE7", "tStatus", "tLead", ["bottom", "top"]),
  ],
};

// ---------------------------------------------------------------- page 2: Escalation
const TIER: StyleMap = { fill: "#EEEBFC", stroke: "#6D5AE6", strokeWidth: 1.25 };
const escalation: Diagram = {
  id: id("dEscalation"),
  title: "Escalation",
  layers: layers("Escalation"),
  nodes: [
    shape("eT1", "general/rounded-rect", "Tier 1\nOn-call engineer", 40, 80, 190, 70, 1, { style: TIER }),
    shape("eT2", "general/rounded-rect", "Tier 2\nService owner", 300, 80, 190, 70, 2, { style: TIER }),
    shape("eIc", "general/rounded-rect", "Incident commander", 560, 80, 190, 70, 3, { style: TIER, label: { bold: true } }),
    shape("eExec", "general/rounded-rect", "Executive on call", 820, 80, 190, 70, 4, { style: TIER }),
  ],
  edges: [
    flow("eE1", "eT1", "eT2", ["right", "left"], "15 min", { ...FLOW, dash: "dashed" }),
    flow("eE2", "eT2", "eIc", ["right", "left"], "30 min", { ...FLOW, dash: "dashed" }),
    flow("eE3", "eIc", "eExec", ["right", "left"], "customer data at risk", { ...FLOW, dash: "dotted" }),
  ],
};

const doc: DiagramDocument = {
  formatVersion: 2,
  meta: { title: "Incident runbook", created: EXAMPLE_DATE, modified: EXAMPLE_DATE, appVersion: "0.0.1" },
  rootDiagramIds: [triage.id, escalation.id],
  diagrams: {
    [triage.id]: triage,
    [escalation.id]: escalation,
    [diagnose.id]: diagnose,
    [databaseChecks.id]: databaseChecks,
  },
};

export default doc;
