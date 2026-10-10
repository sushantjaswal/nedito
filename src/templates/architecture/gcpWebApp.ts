// GCP basic web app.
//
// One compromise worth naming: Google's published icon set (the category + core-product packs
// we ship in full — see NOTICE) has no per-product icon for Cloud Load Balancing, Cloud CDN or
// Cloud DNS. There is nothing to add, so the front door uses the official *networking category*
// icon rather than a scraped or invented one. Everything else is a real product icon.
//
// Laid out as Google's own architecture diagrams are: requests flow left to right into a
// project, whose zones group the serving and data tiers in Google's blue and green; operations
// sit apart in yellow and take telemetry from the whole serving tier. Lines join icons at their
// sides, clear of the names hung beneath them.
import type { DEdge, StyleMap } from "../../model/types";
import { BOUNDARY, LINK, MANAGEMENT, boundary, icon, link, page } from "./archKit";
import { templateDoc } from "../starters/basicFlowchart";

const PROJECT: StyleMap = { ...BOUNDARY, stroke: "#5F6368", dash: "solid" };
const SERVING: StyleMap = { ...BOUNDARY, stroke: "#4285F4" };
const DATA: StyleMap = { ...BOUNDARY, stroke: "#34A853" };
const OPS: StyleMap = { ...BOUNDARY, stroke: "#E8A600" };

const diagram = page(
  "dGcpWebApp",
  "GCP basic web app",
  [
    ...icon("cUsers", "business/group", "Users", 40, 158, 5),

    ...boundary("proj", "Google Cloud project", 180, 60, 840, 560, PROJECT),
    ...icon("cLb", "gcp/category/networking", "Cloud Load\nBalancing", 230, 158, 5),

    ...boundary("svc", "Serving", 380, 110, 300, 330, SERVING),
    ...icon("cRun", "gcp/core/cloud-run", "Cloud Run\n(web + API)", 502, 170, 6),
    ...icon("cGce", "gcp/core/compute-engine", "Compute Engine\n(batch workers)", 502, 330, 6),

    ...boundary("dataZone", "Data", 720, 110, 260, 330, DATA),
    ...icon("cSql", "gcp/core/cloud-sql", "Cloud SQL", 822, 170, 6),
    ...icon("cStorage", "gcp/core/cloud-storage", "Cloud Storage", 822, 330, 6),

    ...boundary("opsZone", "Operations", 220, 470, 260, 130, OPS),
    ...icon("cOps", "gcp/category/observability", "Cloud Monitoring\n& Logging", 322, 500, 7),
  ],
  [
    link("gUsers", "cUsers", "cLb", LINK, "HTTPS", ["right", "left"]),
    link("gLbRun", "cLb", "cRun", LINK, undefined, ["right", "left"]),
    link("gRunSql", "cRun", "cSql", LINK, "queries", ["right", "left"]),
    link("gRunGce", "cRun", "cGce", LINK, "jobs", ["left", "left"]),
    link("gGceStorage", "cGce", "cStorage", LINK, "reads · writes", ["right", "left"]),
    link("gOps", "svc", "cOps", MANAGEMENT, "metrics · logs", ["bottom", "right"]),
  ],
);

// Telemetry leaves the serving zone near its lower-left corner, below the tier's own lines.
diagram.edges = diagram.edges.map(
  (e): DEdge => {
    if (e.id.startsWith("gOps")) return { ...e, source: { ...e.source, anchor: { x: 0.3, y: 1 } } };
    // Requests come in high on Cloud Run's left; jobs go out low, so the two never meet.
    if (e.id.startsWith("gLbRun")) return { ...e, target: { ...e.target, anchor: { x: 0, y: 0.3 } } };
    if (e.id.startsWith("gRunGce")) return { ...e, source: { ...e.source, anchor: { x: 0, y: 0.85 } } };
    return e;
  },
);

export default templateDoc("GCP basic web app", [diagram]);
