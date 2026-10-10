// A data pipeline: sources, ingest, transform, store, serve.
//
// Deliberately notation-free — unlike ER and DFD there is no standard for this, so it uses the
// app's own default shapes and its curved default edge rather than inventing a house style. The
// value is the five-stage skeleton and the vocabulary, not the geometry.
import { ACCENT, MUTED_FILL, PIPE, PLAIN, link, node, page } from "./dataKit";
import { templateDoc } from "../starters/basicFlowchart";

const ROUND = "general/rounded-rect";
const STORE = "general/cylinder";

function heading(slug: string, text: string, x: number, w: number) {
  const h = node(slug, "general/text", text, x, 10, w, 26, 0, { fill: "none", stroke: "none" });
  h.label = { text, align: "center", fontSize: 11, bold: true, color: "#66707D" };
  return h;
}

const diagram = page(
  "dPipeline",
  "Data pipeline",
  [
    // Stage headings: the five-stage skeleton is the point, so it is named across the top.
    heading("gH0", "SOURCES", 60, 170),
    heading("gH1", "INGEST", 330, 180),
    heading("gH2", "TRANSFORM", 600, 190),
    heading("gH3", "STORE", 880, 180),
    heading("gH4", "SERVE", 1140, 170),

    // Sources.
    node("gApp", ROUND, "Application DB", 60, 60, 170, 60, 1, MUTED_FILL),
    node("gEvents", ROUND, "Event stream", 60, 160, 170, 60, 2, MUTED_FILL),
    node("gApi", ROUND, "Partner API", 60, 260, 170, 60, 3, MUTED_FILL),

    // Ingest.
    node("gIngest", ROUND, "Ingest\nbatch + streaming", 330, 150, 180, 80, 4, PLAIN),
    node("gRaw", STORE, "Raw zone", 330, 300, 180, 90, 5, PLAIN),

    // Transform.
    node("gTransform", ROUND, "Transform\nclean · conform · model", 600, 150, 190, 80, 6, ACCENT),
    node("gQuality", ROUND, "Data quality checks", 657, 330, 190, 60, 7, PLAIN),

    // Store.
    node("gWarehouse", STORE, "Warehouse", 880, 140, 180, 100, 8, PLAIN),

    // Serve.
    node("gBi", ROUND, "Dashboards", 1140, 60, 170, 60, 9, MUTED_FILL),
    node("gMl", ROUND, "ML features", 1140, 160, 170, 60, 10, MUTED_FILL),
    node("gReverse", ROUND, "Reverse ETL", 1140, 260, 170, 60, 11, MUTED_FILL),
  ],
  [
    link("glApp", "gApp", "gIngest", PIPE, undefined, ["right", "left"]),
    link("glEvents", "gEvents", "gIngest", PIPE, undefined, ["right", "left"]),
    link("glApi", "gApi", "gIngest", PIPE, undefined, ["right", "left"]),
    link("glRaw", "gIngest", "gRaw", PIPE, "land as-is", ["bottom", "top"]),
    link("glTransform", "gIngest", "gTransform", PIPE, undefined, ["right", "left"]),
    link("glReplay", "gRaw", "gTransform", PIPE, "replay", ["right", "bottom"]),
    link("glQuality", "gTransform", "gQuality", PIPE, "validate", ["bottom", "top"]),
    link("glWarehouse", "gTransform", "gWarehouse", PIPE, "load", ["right", "left"]),
    link("glBi", "gWarehouse", "gBi", PIPE, undefined, ["right", "left"]),
    link("glMl", "gWarehouse", "gMl", PIPE, undefined, ["right", "left"]),
    link("glReverse", "gWarehouse", "gReverse", PIPE, undefined, ["right", "left"]),
  ],
);

// Replay and validation leave Transform's underside at their own points, so the two lines never
// share a track.
diagram.edges = diagram.edges.map((e) => {
  const id = e.id.replace(/_+$/, "");
  if (id === "glReplay") return { ...e, target: { ...e.target, anchor: { x: 0.25, y: 1 } } };
  if (id === "glQuality") return { ...e, source: { ...e.source, anchor: { x: 0.8, y: 1 } } };
  return e;
});

export default templateDoc("Data pipeline", [diagram]);
