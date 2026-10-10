// GCP ML platform: train on Vertex AI and AI Hypercomputer, serve on GKE.
//
// The loop Google documents for MLOps on Vertex AI ("MLOps: continuous delivery and automation
// pipelines in machine learning", and the GKE inference reference architecture), drawn as
// Google's own architecture diagrams are: a project, zones in Google's colours — data in green,
// training and serving in blue, operations in yellow — and work moving left to right.
//
// Features from BigQuery and datasets in Cloud Storage feed a Vertex AI pipeline, which runs its
// training jobs on AI Hypercomputer's TPUs and GPUs, evaluates the result and registers it. A
// registered model is deployed to GPU node pools on GKE, which applications reach through an
// Apigee API. What makes it a platform rather than a one-off is the bottom row: Vertex AI Model
// Monitoring reads the prediction logs and, when it sees drift, triggers the pipeline again;
// Cloud Monitoring and Logging take the serving metrics; Security Command Center watches the
// project.
//
// The client is vendor-neutral, as Google's set has no icon for one; everything else is Google's
// own icon (gcp/…). The registry and model monitoring are parts of Vertex AI and carry its icon,
// as Google's diagrams draw them. Lines join icons at their sides or tops, clear of their names.
import type { DEdge, StyleMap } from "../../model/types";
import { BOUNDARY, LINK, MANAGEMENT, boundary, icon, link, page } from "./archKit";
import { templateDoc } from "../starters/basicFlowchart";

const CORE = "gcp/core";

const PROJECT: StyleMap = { ...BOUNDARY, stroke: "#5F6368", dash: "solid" };
const DATA: StyleMap = { ...BOUNDARY, stroke: "#34A853" };
const COMPUTE: StyleMap = { ...BOUNDARY, stroke: "#4285F4" };
const OPS: StyleMap = { ...BOUNDARY, stroke: "#E8A600" };

const TRAIN = { x: 450, y: 110, w: 560, h: 360 };
const SERVE = { x: 1060, y: 110, w: 520, h: 360 };

const diagram = page(
  "dGcpMlPlatform",
  "GCP ML platform (Vertex AI + GKE)",
  [
    ...boundary("vProj", "Google Cloud project", 150, 60, 1460, 700, PROJECT),

    ...boundary("vData", "Data", 180, 110, 230, 360, DATA),
    ...icon("vBq", `${CORE}/bigquery`, "BigQuery\n(features)", 267, 170, 5),
    ...icon("vGcs", `${CORE}/cloud-storage`, "Cloud Storage\n(datasets)", 267, 330, 5),

    ...boundary("vTrain", "Train — Vertex AI", TRAIN.x, TRAIN.y, TRAIN.w, TRAIN.h, COMPUTE),
    ...icon("vPipe", `${CORE}/vertex-ai`, "Vertex AI\nPipelines", 520, 170, 6),
    ...icon("vHyper", `${CORE}/ai-hypercomputer`, "AI Hypercomputer\n(TPU · GPU)", 690, 330, 6),
    ...icon("vRegistry", `${CORE}/vertex-ai`, "Model\nRegistry", 860, 170, 6),

    ...boundary("vServe", "Serve — GKE", SERVE.x, SERVE.y, SERVE.w, SERVE.h, COMPUTE),
    ...icon("vGke", `${CORE}/gke`, "GKE inference\n(GPU node pools)", 1170, 330, 6),
    ...icon("vApigee", `${CORE}/apigee`, "Apigee\n(model API)", 1400, 330, 6),

    ...icon("vApps", "network/desktop-windows", "Applications", 1660, 330, 5),

    ...boundary("vOps", "Operate", 180, 520, 1400, 200, OPS),
    ...icon("vScc", `${CORE}/security-command-center`, "Security\nCommand Center", 267, 580, 7),
    ...icon("vModelMon", `${CORE}/vertex-ai`, "Vertex AI\nModel Monitoring", 690, 580, 7),
    ...icon("vObs", "gcp/category/observability", "Cloud Monitoring\n& Logging", 1400, 580, 7),
  ],
  [
    link("mFeatures", "vBq", "vPipe", LINK, "features", ["right", "left"]),
    link("mJobs", "vPipe", "vHyper", LINK, "training jobs", ["right", "top"]),
    link("mDatasets", "vGcs", "vHyper", LINK, "datasets", ["right", "left"]),
    link("mRegister", "vPipe", "vRegistry", LINK, "evaluate &\nregister", ["right", "left"]),
    link("mDeploy", "vRegistry", "vGke", LINK, "deploy", ["right", "top"]),
    link("mCall", "vApps", "vApigee", LINK, "HTTPS", ["left", "right"]),
    link("mServe", "vApigee", "vGke", LINK, "predict", ["left", "right"]),
    link("mPredLogs", "vServe", "vModelMon", MANAGEMENT, "prediction logs", ["bottom", "top"]),
    link("mMetrics", "vServe", "vObs", MANAGEMENT, "metrics · logs", ["bottom", "top"]),
    link("mRetrain", "vModelMon", "vPipe", MANAGEMENT, "drift → retrain", ["left", "left"]),
  ],
);

diagram.edges = diagram.edges.map((e): DEdge => {
  // Into training low on the pipeline's right, onward to the registry high — two lines, two heights.
  if (e.id.startsWith("mJobs")) return { ...e, source: { ...e.source, anchor: { x: 1, y: 0.85 } } };
  if (e.id.startsWith("mRegister")) return { ...e, source: { ...e.source, anchor: { x: 1, y: 0.3 } }, target: { ...e.target, anchor: { x: 0, y: 0.3 } } };
  // The retrain trigger arrives low on the pipeline's left, under the features line.
  if (e.id.startsWith("mRetrain")) return { ...e, target: { ...e.target, anchor: { x: 0, y: 0.85 } } };
  // Telemetry leaves the serving zone's floor straight above what reads it.
  if (e.id.startsWith("mPredLogs")) return { ...e, source: { ...e.source, anchor: { x: (1110 - SERVE.x) / SERVE.w, y: 1 } } };
  if (e.id.startsWith("mMetrics")) return { ...e, source: { ...e.source, anchor: { x: (1428 - SERVE.x) / SERVE.w, y: 1 } } };
  return e;
});

export default templateDoc("GCP ML platform (Vertex AI + GKE)", [diagram]);
