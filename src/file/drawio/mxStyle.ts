// draw.io encodes a cell's entire appearance in one semicolon-delimited string, e.g.
//   "ellipse;whiteSpace=wrap;html=1;fillColor=#dae8fc;strokeColor=#6c8ebf;"
// Tokens are either `key=value` pairs or bare names. The bare name is the shape ("ellipse",
// "rhombus", "triangle"); a plain rectangle simply has none, which is why the absence of a
// name is meaningful rather than a parse failure.

export interface MxStyle {
  /** Bare tokens, in order. Usually zero or one; "html=1" style strings often have none. */
  names: string[];
  keys: Record<string, string>;
}

export function parseMxStyle(style: string | null | undefined): MxStyle {
  const names: string[] = [];
  const keys: Record<string, string> = {};
  for (const token of (style ?? "").split(";")) {
    const t = token.trim();
    if (!t) continue;
    const eq = t.indexOf("=");
    if (eq === -1) {
      names.push(t.toLowerCase());
    } else {
      // Last wins: draw.io itself resolves a repeated key that way, and hand-edited styles do
      // sometimes repeat one.
      keys[t.slice(0, eq).trim()] = t.slice(eq + 1).trim();
    }
  }
  return { names, keys };
}

/**
 * Shape lookup, keyed by draw.io's `shape=` value or by a bare style name. Both spaces share
 * one table because draw.io uses them interchangeably across versions and stencil libraries —
 * `ellipse` is a bare name, `shape=cylinder3` is a key, and both mean a shape we can draw.
 *
 * Only shapes Nedito genuinely has are listed. Mapping something to a vaguely-similar
 * stencil would be worse than the honest fallback: a rectangle the user can see is wrong beats
 * a triangle they assume was faithful. Everything unlisted lands on general/rect and is
 * reported as a warning, so the import always says what it could not carry across.
 */
const SHAPE_BY_NAME: Record<string, string> = {
  // --- core geometry -------------------------------------------------------------------
  ellipse: "general/ellipse",
  rhombus: "general/diamond",
  triangle: "general/triangle",
  hexagon: "general/hexagon",
  cylinder: "general/cylinder",
  cylinder3: "general/cylinder",
  parallelogram: "general/parallelogram",
  trapezoid: "basic/trapezoid",
  cube: "basic/cube",
  step: "basic/step",
  card: "basic/card",
  tape: "flowchart/paper-tape",
  callout: "basic/callout",
  cross: "general/cross",
  cloud: "basic/cloud",
  // --- tables (X5, D136): the table is an entity table, its rows and cells plain boxes that
  // toNodeStyle draws without borders where draw.io does.
  table: "entity-relation/table",
  tablerow: "general/rect",
  partialrectangle: "general/rect",
  note: "general/note",
  text: "general/text",
  line: "lines/line",
  // --- flowchart -----------------------------------------------------------------------
  process: "flowchart/process",
  document: "flowchart/document",
  internalstorage: "flowchart/internal-storage",
  datastore: "flowchart/database",
  manualinput: "flowchart/manual-input",
  display: "flowchart/display",
  delay: "flowchart/delay",
  offpageconnector: "flowchart/off-page-connector",
  sortshape: "flowchart/sort",
  collate: "flowchart/collate",
  extract: "flowchart/extract",
  merge: "flowchart/merge",
  loislimit: "flowchart/loop-limit",
  looplimit: "flowchart/loop-limit",
  summingjunction: "flowchart/summing-junction",
  or: "flowchart/or",
  // --- UML -----------------------------------------------------------------------------
  umlactor: "uml/actor",
  actor: "uml/actor",
  umllifeline: "uml/lifeline",
  component: "uml/component",
  module: "uml/component",
  umlframe: "uml/package",
  folder: "uml/package",
};

/** draw.io's own flowchart stencil library, addressed as `shape=mxgraph.flowchart.<name>`. */
const SHAPE_BY_MXGRAPH_PATH: Record<string, string> = {
  "mxgraph.flowchart.database": "flowchart/database",
  "mxgraph.flowchart.document": "flowchart/document",
  "mxgraph.flowchart.decision": "flowchart/decision",
  "mxgraph.flowchart.process": "flowchart/process",
  "mxgraph.flowchart.terminator": "flowchart/terminator",
  "mxgraph.flowchart.data": "flowchart/data",
  "mxgraph.flowchart.manual_input": "flowchart/manual-input",
  "mxgraph.flowchart.preparation": "flowchart/preparation",
  "mxgraph.flowchart.predefined_process": "flowchart/predefined-process",
  "mxgraph.flowchart.stored_data": "flowchart/stored-data",
  "mxgraph.flowchart.display": "flowchart/display",
  "mxgraph.flowchart.delay": "flowchart/delay",
  "mxgraph.flowchart.sort": "flowchart/sort",
  "mxgraph.flowchart.collate": "flowchart/collate",
  "mxgraph.flowchart.extract_or_measurement": "flowchart/extract",
  "mxgraph.flowchart.merge_or_storage": "flowchart/merge",
  "mxgraph.flowchart.loop_limit": "flowchart/loop-limit",
  "mxgraph.flowchart.summing_function": "flowchart/summing-junction",
  "mxgraph.flowchart.on-page_reference": "flowchart/on-page-connector",
  "mxgraph.flowchart.off-page_reference": "flowchart/off-page-connector",
  "mxgraph.flowchart.or": "flowchart/or",
  "mxgraph.flowchart.paper_tape": "flowchart/paper-tape",
  "mxgraph.flowchart.direct_data": "flowchart/direct-access-storage",
  "mxgraph.flowchart.sequential_data": "flowchart/sequential-data",
  "mxgraph.flowchart.manual_operation": "flowchart/manual-operation",
  "mxgraph.flowchart.parallel_mode": "flowchart/parallel-mode",
  "mxgraph.flowchart.annotation_1": "flowchart/annotation",
  "mxgraph.flowchart.annotation_2": "flowchart/annotation",
};

export interface ShapeMatch {
  shapeRef: string;
  /** False when nothing in the style was recognised and the rectangle fallback was used. */
  matched: boolean;
  /** What the style asked for, when we could not honour it — used to phrase the warning. */
  requested?: string;
}

export function toShapeRef(style: MxStyle): ShapeMatch {
  const shapeKey = (style.keys.shape ?? "").toLowerCase();

  // A swimlane (X5, D136): its title band on top, or down the side when draw.io turns it.
  if (shapeKey === "swimlane" || style.names.includes("swimlane")) {
    return { shapeRef: style.keys.horizontal === "0" ? "bpmn/lane" : "advanced/swimlane-vertical", matched: true };
  }

  if (shapeKey) {
    const viaPath = SHAPE_BY_MXGRAPH_PATH[shapeKey];
    if (viaPath) return { shapeRef: viaPath, matched: true };
    const viaName = SHAPE_BY_NAME[shapeKey.replace(/[-_\s]/g, "")];
    if (viaName) return { shapeRef: viaName, matched: true };
    return { shapeRef: "general/rect", matched: false, requested: style.keys.shape };
  }

  for (const name of style.names) {
    const hit = SHAPE_BY_NAME[name.replace(/[-_\s]/g, "")];
    if (hit) return { shapeRef: hit, matched: true };
  }

  // No shape token at all: draw.io's default cell is a rectangle, rounded or not. This is the
  // single most common vertex in any real file, so it counts as a match, not a fallback.
  if (style.names.length === 0 || style.names.every((n) => n === "whitespace" || n === "html")) {
    return { shapeRef: style.keys.rounded === "1" ? "general/rounded-rect" : "general/rect", matched: true };
  }
  if (style.keys.rounded === "1") return { shapeRef: "general/rounded-rect", matched: true };

  return { shapeRef: "general/rect", matched: false, requested: style.names[0] };
}

/** draw.io colour values are hex, a named colour, or the literal "none". */
function color(value: string | undefined): string | undefined {
  if (!value || value.toLowerCase() === "none") return undefined;
  return value;
}

export function toNodeStyle(style: MxStyle): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  const fill = color(style.keys.fillColor);
  const stroke = color(style.keys.strokeColor);
  if (fill) out.fill = fill;
  // "strokeColor=none" is draw.io's borderless shape; Nedito spells that "none" too rather
  // than dropping the key, which would let the stencil default paint a border back on.
  if (stroke) out.stroke = stroke;
  else if (style.keys.strokeColor?.toLowerCase() === "none") out.stroke = "none";
  // "fillColor=none" is see-through in draw.io — a container's dashed outline, a table's rows —
  // where the stencil default would paint it white over what lies behind (X5, D136).
  if (style.keys.fillColor?.toLowerCase() === "none") out.fill = "none";
  // A table's row, and a cell with every side turned off, are borderless in draw.io (X5).
  const shapeKey = (style.keys.shape ?? "").toLowerCase();
  const sidesOff = ["top", "left", "bottom", "right"].every((side) => style.keys[side] === "0");
  if (shapeKey === "tablerow" || (shapeKey === "partialrectangle" && sidesOff)) out.stroke = "none";
  if (style.keys.strokeWidth) {
    const w = Number(style.keys.strokeWidth);
    if (Number.isFinite(w)) out.strokeWidth = w;
  }
  if (style.keys.dashed === "1") out.dash = style.keys.dashPattern === "1 4" ? "dotted" : "dashed";
  if (style.keys.opacity) {
    const o = Number(style.keys.opacity);
    if (Number.isFinite(o)) out.opacity = o / 100; // draw.io stores 0-100, Nedito 0-1
  }
  if (style.keys.shadow === "1") out.shadow = 1;
  // Where the label sits — the same keys, read the same way (canvas/labelLayout.ts).
  const valign = style.keys.verticalAlign;
  if (valign === "top" || valign === "bottom") out.verticalAlign = valign;
  if (style.keys.horizontal === "0") out.horizontal = 0;
  const outside = style.keys.verticalLabelPosition;
  if (outside === "top" || outside === "bottom") out.verticalLabelPosition = outside;
  return out;
}

export function toEdgeStyle(style: MxStyle): Record<string, string | number> {
  const out: Record<string, string | number> = {};

  // draw.io's default edge is orthogonal; ours is curved (D43). An imported file keeps what it
  // was drawn with, so a diagram comes across looking like itself rather than like our default.
  if (style.keys.curved === "1") out.edgeStyle = "curved";
  else if (style.keys.edgeStyle === "orthogonalEdgeStyle" || style.keys.edgeStyle === "elbowEdgeStyle")
    out.edgeStyle = "orthogonal";
  else if (style.keys.edgeStyle === "none" || style.names.includes("straight")) out.edgeStyle = "straight";
  else out.edgeStyle = "orthogonal";

  const stroke = color(style.keys.strokeColor);
  if (stroke) out.stroke = stroke;
  if (style.keys.strokeWidth) {
    const w = Number(style.keys.strokeWidth);
    if (Number.isFinite(w)) out.strokeWidth = w;
  }
  if (style.keys.dashed === "1") out.dash = style.keys.dashPattern === "1 4" ? "dotted" : "dashed";

  out.startArrow = toArrow(style.keys.startArrow, style.keys.startFill, "none");
  out.endArrow = toArrow(style.keys.endArrow, style.keys.endFill, "classic");
  // draw.io's "link" is a double line and its "flexArrow" a hollow block arrow (canvas/edgeShapes.ts).
  if (style.keys.shape === "link") out.edgeShape = "double";
  if (style.keys.shape === "flexArrow") out.edgeShape = "arrow";
  return out;
}

/**
 * draw.io's arrowheads, as Nedito's. The ones that carry meaning
 * come across as themselves — UML's hollow triangle and diamonds, every crow's-foot end — with
 * draw.io's `startFill`/`endFill=0` deciding hollow from filled. The rest keep the old rule:
 * "is there a head, and is it solid", which is what a reader takes from a head Nedito lacks.
 */
const ER_ENDS: Record<string, string> = {
  ermany: "crows-foot",
  erone: "er-one",
  ermandone: "er-one",
  erzerotoone: "er-zero-or-one",
  eronetomany: "er-one-or-many",
  erzerotomany: "er-zero-or-many",
};

export function toArrow(value: string | undefined, fill: string | undefined, fallback: string): string {
  if (value === undefined) return fallback;
  const v = value.toLowerCase();
  const hollow = fill === "0";
  if (v === "none" || v === "") return "none";
  if (ER_ENDS[v]) return ER_ENDS[v];
  if (v === "diamond" || v === "diamondthin") return hollow ? "diamond-open" : "diamond";
  if (v === "block" || v === "blockthin" || v === "classic" || v === "classicthin") return hollow ? "triangle" : "classic";
  if (v === "open" || v === "openthin" || v === "halfcircle") return "open";
  return "classic";
}
