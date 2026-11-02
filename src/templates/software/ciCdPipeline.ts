// A delivery pipeline, with each stage a Nested Block holding its jobs.
//
// Pipelines are the diagram teams draw most and keep worst, because the two audiences want
// different diagrams: a reviewer wants "commit to production in seven boxes", and whoever is
// fixing it at the time wants every job in the stage that broke. Drawn flat it is forty boxes
// of jobs with the shape of the pipeline lost inside them; drawn as seven boxes it cannot be
// used to fix anything.
//
// A stage is the natural Nested Block — a named group of jobs with one way in and one way out —
// so the pipeline view is the seven boxes and each stage opens into its jobs. The production
// stage carries a third port for the rollback, because monitoring triggering a rollback is a
// fact about the pipeline and belongs on the pipeline view, while the rollback job belongs
// inside the stage that runs it.
import { createDefaultLayers } from "../../model/layers";
import type { DEdge, Diagram, NestedNode, ShapeNode, StyleMap } from "../../model/types";
import { templateDoc, tid } from "../starters/basicFlowchart";
import { faceEdges } from "../faceEdges";

const INK = "#1E2733";
const MUTED = "#66707D";
const ROUND = "general/rounded-rect";
const GATE = "flowchart/decision";

/** A job, or a stage that does something. */
const STEP: StyleMap = { fill: "#FFFFFF", stroke: INK, strokeWidth: 1 };
/** What a stage hands on: the artifact it produced, the state it reached. */
const HANDOFF: StyleMap = { fill: "#EEEBFC", stroke: "#6D5AE6", strokeWidth: 1.25 };
/** A decision the pipeline waits on. */
const DECIDE: StyleMap = { fill: "#FFF4DE", stroke: "#C98A0B", strokeWidth: 1 };
/** A stop: the pipeline went no further. */
const STOP: StyleMap = { fill: "#F4F5F7", stroke: MUTED, strokeWidth: 1 };

const RUNS: StyleMap = { edgeStyle: "orthogonal", stroke: MUTED, strokeWidth: 1.5, startArrow: "none", endArrow: "classic" };
/** A path taken only when something went wrong, drawn back so it never competes with the run. */
const UNHAPPY: StyleMap = { ...RUNS, dash: "dashed", endArrow: "open" };

type Side = "top" | "right" | "bottom" | "left";

function node(
  slug: string,
  shapeRef: string,
  text: string,
  x: number,
  y: number,
  w: number,
  h: number,
  z: number,
  style: StyleMap = STEP,
): ShapeNode {
  return {
    id: tid(slug),
    type: "shape",
    shapeRef,
    position: { x, y },
    size: { w, h },
    z,
    style,
    label: { text, align: "center", fontSize: 11 },
  };
}

function link(slug: string, from: string, to: string, style: StyleMap, text?: string, sides?: [Side, Side]): DEdge {
  const edge: DEdge = {
    id: tid(slug),
    source: { nodeId: tid(from) },
    target: { nodeId: tid(to) },
    style: sides ? { ...style, sourceHandle: sides[0], targetHandle: sides[1] } : style,
  };
  if (text) edge.label = { text, fontSize: 10, color: MUTED };
  return edge;
}

function page(slug: string, title: string, nodes: Diagram["nodes"], edges: DEdge[]): Diagram {
  return faceEdges({ id: tid(slug), title, layers: createDefaultLayers(), nodes, edges });
}

// ------------------------------------------------------------- the stages, one level down

/** Build and test: the fan of checks every commit runs, and the artifact they produce. */
const build: Diagram = page(
  "dBuild",
  "Build and test",
  [
    node("cbIn", ROUND, "Commit on the PR", 60, 240, 170, 64, 1, HANDOFF),
    node("cbLint", ROUND, "Lint and format", 290, 120, 170, 56, 2),
    node("cbTypes", ROUND, "Type check", 290, 240, 170, 56, 3),
    node("cbUnit", ROUND, "Unit tests", 290, 360, 170, 56, 4),
    node("cbBuild", ROUND, "Build the image", 520, 240, 180, 64, 5),
    node("cbE2e", ROUND, "End-to-end tests\nsix parallel shards", 760, 230, 190, 80, 6),
    node("cbPub", ROUND, "Publish the artifact", 1010, 240, 180, 64, 7, HANDOFF),
    node("cbFail", ROUND, "Report the failure\nand block the PR", 520, 440, 190, 70, 8, STOP),
  ],
  [
    link("cbeL", "cbIn", "cbLint", RUNS, undefined, ["right", "left"]),
    link("cbeT", "cbIn", "cbTypes", RUNS, undefined, ["right", "left"]),
    link("cbeU", "cbIn", "cbUnit", RUNS, undefined, ["right", "left"]),
    link("cbeLB", "cbLint", "cbBuild", RUNS, undefined, ["right", "left"]),
    link("cbeTB", "cbTypes", "cbBuild", RUNS, undefined, ["right", "left"]),
    link("cbeUB", "cbUnit", "cbBuild", RUNS, undefined, ["right", "left"]),
    link("cbeBE", "cbBuild", "cbE2e", RUNS, undefined, ["right", "left"]),
    link("cbeEP", "cbE2e", "cbPub", RUNS, undefined, ["right", "left"]),
    link("cbeFail", "cbE2e", "cbFail", UNHAPPY, "a job fails", ["bottom", "right"]),
  ],
);

/** Deploy to staging: the ordered steps that put the artifact somewhere real. */
const staging: Diagram = page(
  "dStaging",
  "Deploy to staging",
  [
    node("csIn", ROUND, "Approved artifact", 60, 240, 180, 64, 1, HANDOFF),
    node("csProv", ROUND, "Apply the\ninfrastructure plan", 290, 240, 180, 70, 2),
    node("csMig", ROUND, "Run database\nmigrations", 530, 240, 180, 70, 3),
    node("csDeploy", ROUND, "Deploy the services", 770, 240, 180, 70, 4),
    node("csSmoke", ROUND, "Smoke tests", 1010, 240, 180, 70, 5),
    node("csOut", ROUND, "Staging is ready", 1250, 240, 180, 64, 6, HANDOFF),
    node("csRoll", ROUND, "Roll back staging", 1010, 420, 180, 70, 7, STOP),
  ],
  [
    link("cse1", "csIn", "csProv", RUNS, undefined, ["right", "left"]),
    link("cse2", "csProv", "csMig", RUNS, undefined, ["right", "left"]),
    link("cse3", "csMig", "csDeploy", RUNS, undefined, ["right", "left"]),
    link("cse4", "csDeploy", "csSmoke", RUNS, undefined, ["right", "left"]),
    link("cse5", "csSmoke", "csOut", RUNS, undefined, ["right", "left"]),
    link("cse6", "csSmoke", "csRoll", UNHAPPY, "fails", ["bottom", "top"]),
  ],
);

/** Release to production: a canary, a health decision, and the two ways out of it. */
const production: Diagram = page(
  "dProduction",
  "Release to production",
  [
    node("crIn", ROUND, "Release candidate", 60, 240, 180, 64, 1, HANDOFF),
    node("crCanary", ROUND, "Canary: 10%\nof traffic", 290, 240, 180, 70, 2),
    node("crHealth", GATE, "Healthy?", 530, 225, 190, 110, 3, DECIDE),
    node("crPromote", ROUND, "Promote to\n100% of traffic", 780, 240, 180, 70, 4),
    node("crOut", ROUND, "Released", 1020, 240, 180, 64, 5, HANDOFF),
    node("crRollback", ROUND, "Roll back to the\nprevious release", 530, 440, 190, 70, 6, STOP),
    node("crNotify", ROUND, "Notify the team", 780, 440, 180, 64, 7),
  ],
  [
    link("cre1", "crIn", "crCanary", RUNS, undefined, ["right", "left"]),
    link("cre2", "crCanary", "crHealth", RUNS, undefined, ["right", "left"]),
    link("cre3", "crHealth", "crPromote", RUNS, "yes", ["right", "left"]),
    link("cre4", "crPromote", "crOut", RUNS, undefined, ["right", "left"]),
    link("cre5", "crHealth", "crRollback", UNHAPPY, "no", ["bottom", "top"]),
    link("cre6", "crRollback", "crNotify", UNHAPPY, undefined, ["right", "left"]),
  ],
);

// ------------------------------------------------------------------- the pipeline view

function stage(
  slug: string,
  title: string,
  summary: string,
  child: Diagram,
  x: number,
  z: number,
  ports: NestedNode["ports"],
): NestedNode {
  return {
    id: tid(slug),
    type: "nested",
    childDiagramId: child.id,
    position: { x, y: 200 },
    size: { w: 260, h: 150 },
    z,
    style: {},
    label: { text: title, align: "center" },
    collapsed: { icons: [], summary },
    ports,
  };
}

const buildStage = stage("pBuild", "Build and test", "checks · image · artifact", build, 480, 3, [
  { id: tid("pBuildIn"), side: "left", offset: 0.5, innerNodeId: tid("cbIn"), label: "commit" },
  { id: tid("pBuildOut"), side: "right", offset: 0.5, innerNodeId: tid("cbPub"), label: "artifact" },
  { id: tid("pBuildFail"), side: "bottom", offset: 0.5, innerNodeId: tid("cbFail"), label: "blocked" },
]);

const stagingStage = stage("pStaging", "Deploy to staging", "infrastructure · migrations · smoke tests", staging, 1030, 5, [
  { id: tid("pStagingIn"), side: "left", offset: 0.5, innerNodeId: tid("csIn"), label: "artifact" },
  { id: tid("pStagingOut"), side: "right", offset: 0.5, innerNodeId: tid("csOut"), label: "staged" },
]);

const productionStage = stage("pProd", "Release to production", "canary · health · promote", production, 1570, 7, [
  { id: tid("pProdIn"), side: "left", offset: 0.5, innerNodeId: tid("crIn"), label: "candidate" },
  { id: tid("pProdOut"), side: "right", offset: 0.5, innerNodeId: tid("crOut"), label: "released" },
  { id: tid("pProdRoll"), side: "bottom", offset: 0.5, innerNodeId: tid("crRollback"), label: "roll back" },
]);

const pipeline: Diagram = page(
  "dPipeline",
  "Delivery pipeline",
  [
    node("pDev", ROUND, "Developer pushes\na branch", 40, 243, 170, 64, 1),
    node("pPr", ROUND, "Pull request", 260, 243, 170, 64, 2),
    buildStage,
    node("pArt", "general/cylinder", "Artifact registry\nimage and SBOM", 790, 235, 190, 80, 4, HANDOFF),
    stagingStage,
    node("pGate", GATE, "Approved?", 1340, 225, 180, 100, 6, DECIDE),
    productionStage,
    node("pMon", ROUND, "Monitoring\nand alerts", 1880, 235, 190, 80, 8),
    node("pHold", ROUND, "Waiting for the\nrelease window", 1345, 420, 170, 70, 9, STOP),
    // Short on purpose: this is the node a ghost pill names one level down, where the job that
    // reports the failure already says the longer version.
    node("pFail", ROUND, "PR blocked", 560, 450, 190, 70, 10, STOP),
  ],
  [
    link("peDev", "pDev", "pPr", RUNS, undefined, ["right", "left"]),
    {
      id: tid("pePr"),
      source: { nodeId: tid("pPr") },
      target: { nodeId: buildStage.id, portId: buildStage.ports[0].id },
      style: { ...RUNS, sourceHandle: "right" },
    },
    {
      id: tid("peArt"),
      source: { nodeId: buildStage.id, portId: buildStage.ports[1].id },
      target: { nodeId: tid("pArt") },
      style: { ...RUNS, targetHandle: "left" },
    },
    {
      id: tid("peStage"),
      source: { nodeId: tid("pArt") },
      target: { nodeId: stagingStage.id, portId: stagingStage.ports[0].id },
      style: { ...RUNS, sourceHandle: "right" },
    },
    {
      id: tid("peGate"),
      source: { nodeId: stagingStage.id, portId: stagingStage.ports[1].id },
      target: { nodeId: tid("pGate") },
      style: { ...RUNS, targetHandle: "left" },
    },
    {
      id: tid("peProd"),
      source: { nodeId: tid("pGate") },
      target: { nodeId: productionStage.id, portId: productionStage.ports[0].id },
      style: { ...RUNS, sourceHandle: "right" },
      label: { text: "yes", fontSize: 10, color: MUTED },
    },
    link("peHold", "pGate", "pHold", UNHAPPY, "no", ["bottom", "top"]),
    {
      id: tid("peMon"),
      source: { nodeId: productionStage.id, portId: productionStage.ports[1].id },
      target: { nodeId: tid("pMon") },
      style: { ...RUNS, targetHandle: "left" },
    },
    // Monitoring is what decides a release went bad, so the rollback is triggered from here and
    // lands on the production stage's own rollback job one level down.
    {
      id: tid("peRoll"),
      source: { nodeId: tid("pMon") },
      target: { nodeId: productionStage.id, portId: productionStage.ports[2].id },
      style: { ...UNHAPPY, sourceHandle: "bottom" },
    },
    {
      id: tid("peFail"),
      source: { nodeId: buildStage.id, portId: buildStage.ports[2].id },
      target: { nodeId: tid("pFail") },
      style: { ...UNHAPPY, targetHandle: "top" },
    },
    link("peBack", "pFail", "pDev", UNHAPPY, "fix and push again", ["left", "bottom"]),
  ],
);

export default templateDoc("Delivery pipeline", [pipeline, build, staging, production]);
