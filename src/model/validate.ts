// The document's invariants, checked whenever a document is read: opening a file, restoring
// the autosave, importing (README, "How a document is put together").
import { motionProblems } from "./motion";
import { assetProblem, isImageNode } from "./assets";
import type { DiagramDocument, Diagram, DNode, EdgeEnd, NestedNode } from "./types";

export interface ValidationError {
  code: string;
  message: string;
  diagramId?: string;
  nodeId?: string;
}

export function isNestedNode(node: DNode): node is NestedNode {
  return node.type === "nested";
}

export function validateDoc(doc: DiagramDocument): ValidationError[] {
  const errors: ValidationError[] = [];

  errors.push(...checkUniqueIds(doc));
  errors.push(...checkRootDiagramsExist(doc));
  errors.push(...checkChildDiagramsExist(doc));
  errors.push(...checkNoCycles(doc));
  errors.push(...checkPortsReferenceRealNodes(doc));
  errors.push(...checkLayerIdsReferenceRealLayers(doc));
  errors.push(...checkImagesHaveSoundAssets(doc));
  errors.push(...checkEdgeEnds(doc));
  errors.push(...checkComments(doc));
  errors.push(...motionProblems(doc).map((p) => ({ code: "BAD_MOTION", message: p.message, diagramId: p.diagramId })));

  return errors;
}

/**
 * Every edge end is attached to a node or free at a point — exactly one (types.ts EdgeEnd). An end
 * with neither has nowhere to be drawn; one with both would be read two ways by two renderers.
 */
function checkEdgeEnds(doc: DiagramDocument): ValidationError[] {
  const errors: ValidationError[] = [];
  const finite = (p: unknown): boolean =>
    typeof p === "object" && p !== null && Number.isFinite((p as { x: unknown }).x) && Number.isFinite((p as { y: unknown }).y);
  for (const diagram of Object.values(doc.diagrams)) {
    for (const edge of diagram.edges) {
      for (const name of ["source", "target"] as const) {
        const end = edge[name] as EdgeEnd | undefined;
        const attached = typeof end?.nodeId === "string" && end.nodeId.length > 0;
        const free = end?.point !== undefined;
        if (attached === free || (free && !finite(end?.point))) {
          errors.push({
            code: "BAD_EDGE_END",
            message: `Edge "${edge.id}" in diagram "${diagram.id}" has a ${name} that is ${attached ? "both attached and free" : free ? "at an invalid point" : "neither attached nor free"}`,
            diagramId: diagram.id,
          });
        }
      }
      const at = edge.labelPosition;
      if (at !== undefined && !(Number.isFinite(at.t) && at.t >= 0 && at.t <= 1 && Number.isFinite(at.dx) && Number.isFinite(at.dy))) {
        errors.push({
          code: "BAD_EDGE_END",
          message: `Edge "${edge.id}" in diagram "${diagram.id}" has an invalid label position`,
          diagramId: diagram.id,
        });
      }
    }
  }
  return errors;
}

/** Every image node shows an asset that exists, and every asset is what it claims to be (D79). */
function checkImagesHaveSoundAssets(doc: DiagramDocument): ValidationError[] {
  const errors: ValidationError[] = [];
  for (const [id, asset] of Object.entries(doc.assets ?? {})) {
    const problem = assetProblem(asset);
    if (problem) errors.push({ code: "BAD_ASSET", message: `Image "${asset.name ?? id}": ${problem}` });
  }
  for (const diagram of Object.values(doc.diagrams)) {
    for (const node of diagram.nodes) {
      if (!isImageNode(node)) continue;
      if (!node.imageId || !doc.assets?.[node.imageId]) {
        errors.push({
          code: "MISSING_ASSET",
          message: `Image node "${node.id}" in diagram "${diagram.id}" shows a picture that isn't in the file`,
          diagramId: diagram.id,
          nodeId: node.id,
        });
      }
    }
  }
  return errors;
}

function checkUniqueIds(doc: DiagramDocument): ValidationError[] {
  const errors: ValidationError[] = [];
  const seen = new Set<string>();

  const record = (id: string, diagramId?: string, nodeId?: string) => {
    if (seen.has(id)) {
      errors.push({
        code: "DUPLICATE_ID",
        message: `Duplicate id "${id}" found in document`,
        diagramId,
        nodeId,
      });
    }
    seen.add(id);
  };

  for (const diagram of Object.values(doc.diagrams)) {
    record(diagram.id, diagram.id);
    for (const node of diagram.nodes) {
      record(node.id, diagram.id, node.id);
      if (isNestedNode(node)) {
        for (const port of node.ports) {
          record(port.id, diagram.id, node.id);
        }
      }
    }
    for (const edge of diagram.edges) {
      record(edge.id, diagram.id);
    }
  }
  // Asset ids share the document's one id space, like every other id.
  for (const assetId of Object.keys(doc.assets ?? {})) record(assetId);
  // So do comment ids. What a comment *names*, on the other hand, is not checked at all: see
  // checkComments below.
  for (const comment of doc.comments ?? []) record(comment.id);

  return errors;
}

/**
 * Comments are checked for almost nothing, on purpose.
 *
 * A comment's `focus.nodeIds` and `focus.edgeIds` may name shapes and lines that no longer exist, and
 * that is **not** an error — the opposite of a port's `innerNodeId`, which must resolve. Deleting
 * a shape must never make a document invalid, because the document would then refuse to open and
 * the author would lose writing over a box they meant to delete. The stale ids are dropped when
 * the document loads (model/comments.ts), and a comment whose level is gone is dropped when it is
 * written. Neither is a failure, so neither is reported here.
 *
 * What is checked is the comment itself: an id to be unique by (above), and a body to be text.
 */
function checkComments(doc: DiagramDocument): ValidationError[] {
  const errors: ValidationError[] = [];
  for (const comment of doc.comments ?? []) {
    if (typeof comment.id !== "string" || comment.id === "") {
      errors.push({ code: "INVALID_COMMENT", message: "A comment has no id" });
      continue;
    }
    if (typeof comment.body !== "string") {
      errors.push({ code: "INVALID_COMMENT", message: `Comment "${comment.id}" has no text` });
    }
    if (typeof comment.focus?.diagramId !== "string" || comment.focus.diagramId === "") {
      errors.push({ code: "INVALID_COMMENT", message: `Comment "${comment.id}" names no diagram` });
    }
  }
  return errors;
}

function checkRootDiagramsExist(doc: DiagramDocument): ValidationError[] {
  return doc.rootDiagramIds
    .filter((id) => !doc.diagrams[id])
    .map((id) => ({
      code: "MISSING_ROOT_DIAGRAM",
      message: `rootDiagramIds references missing diagram "${id}"`,
      diagramId: id,
    }));
}

function checkChildDiagramsExist(doc: DiagramDocument): ValidationError[] {
  const errors: ValidationError[] = [];
  for (const diagram of Object.values(doc.diagrams)) {
    for (const node of diagram.nodes) {
      if (isNestedNode(node) && !doc.diagrams[node.childDiagramId]) {
        errors.push({
          code: "MISSING_CHILD_DIAGRAM",
          message: `Nested node "${node.id}" references missing diagram "${node.childDiagramId}"`,
          diagramId: diagram.id,
          nodeId: node.id,
        });
      }
    }
  }
  return errors;
}

/**
 * How many levels of Nested Blocks a document may have. Real diagrams use a handful; the limit
 * exists so that a crafted document cannot nest deeply enough to overflow the stack of anything
 * that walks the levels (deleting a block, the PowerPoint and Word exports, navigation).
 */
export const MAX_NESTING_DEPTH = 1000;

/**
 * No diagram contains itself, directly or further down, and no chain of Nested Blocks is deeper
 * than MAX_NESTING_DEPTH. A loop with its own stack rather than recursion, so a deep document is
 * reported rather than overflowing the call stack.
 */
function checkNoCycles(doc: DiagramDocument): ValidationError[] {
  const errors: ValidationError[] = [];
  // grey = on the current path, black = fully explored; absent = not visited yet
  const color = new Map<string, "grey" | "black">();
  let reportedDepth = false;

  const childDiagramIdsOf = (diagram: Diagram): string[] =>
    Array.isArray(diagram.nodes) ? diagram.nodes.filter(isNestedNode).map((n) => n.childDiagramId) : [];

  for (const start of Object.keys(doc.diagrams)) {
    if (color.has(start) || !doc.diagrams[start]) continue;
    const path: string[] = [start];
    const pending: string[][] = [childDiagramIdsOf(doc.diagrams[start])];
    color.set(start, "grey");
    while (path.length > 0) {
      const next = pending[pending.length - 1].pop();
      if (next === undefined) {
        color.set(path.pop()!, "black");
        pending.pop();
        continue;
      }
      const diagram = doc.diagrams[next];
      if (!diagram) continue; // reported by checkChildDiagramsExist
      const state = color.get(next);
      if (state === "black") continue;
      if (state === "grey") {
        errors.push({ code: "CYCLE", message: `Nesting cycle detected: ${[...path, next].join(" -> ")}`, diagramId: next });
        continue;
      }
      if (path.length >= MAX_NESTING_DEPTH) {
        if (!reportedDepth) {
          errors.push({ code: "TOO_DEEP", message: `Nested Blocks go more than ${MAX_NESTING_DEPTH} levels deep`, diagramId: next });
          reportedDepth = true;
        }
        continue;
      }
      color.set(next, "grey");
      path.push(next);
      pending.push(childDiagramIdsOf(diagram));
    }
  }

  return errors;
}

// Only checks nodes/edges that set an explicit layerId AND the diagram has a real (non-
// synthesized) layers array — an absent layerId always falls back safely (model/layers.ts's
// getLayerId), so there's nothing to validate for diagrams that haven't touched layers yet.
function checkLayerIdsReferenceRealLayers(doc: DiagramDocument): ValidationError[] {
  const errors: ValidationError[] = [];
  for (const diagram of Object.values(doc.diagrams)) {
    if (!diagram.layers || diagram.layers.length === 0) continue;
    const layerIds = new Set(diagram.layers.map((l) => l.id));
    for (const node of diagram.nodes) {
      if (node.layerId !== undefined && !layerIds.has(node.layerId)) {
        errors.push({
          code: "DANGLING_LAYER_ID",
          message: `Node "${node.id}" references missing layer "${node.layerId}" in diagram "${diagram.id}"`,
          diagramId: diagram.id,
          nodeId: node.id,
        });
      }
    }
    for (const edge of diagram.edges) {
      if (edge.layerId !== undefined && !layerIds.has(edge.layerId)) {
        errors.push({
          code: "DANGLING_LAYER_ID",
          message: `Edge "${edge.id}" references missing layer "${edge.layerId}" in diagram "${diagram.id}"`,
          diagramId: diagram.id,
        });
      }
    }
  }
  return errors;
}

function checkPortsReferenceRealNodes(doc: DiagramDocument): ValidationError[] {
  const errors: ValidationError[] = [];
  for (const diagram of Object.values(doc.diagrams)) {
    for (const node of diagram.nodes) {
      if (!isNestedNode(node)) continue;
      const child = doc.diagrams[node.childDiagramId];
      if (!child) continue; // reported by checkChildDiagramsExist
      const innerIds = new Set(child.nodes.map((n) => n.id));
      for (const port of node.ports) {
        // An absent innerNodeId is a legitimate "unmapped, waiting to be linked" port (see
        // types.ts's Port), not a dangling reference — only a *set* id that points at nothing
        // is a real violation: every set port.innerNodeId must exist in the child.
        if (port.innerNodeId === undefined) continue;
        if (!innerIds.has(port.innerNodeId)) {
          errors.push({
            code: "DANGLING_PORT",
            message: `Port "${port.id}" on node "${node.id}" references missing inner node "${port.innerNodeId}" in diagram "${child.id}"`,
            diagramId: diagram.id,
            nodeId: node.id,
          });
        }
      }
    }
  }
  return errors;
}

// ---- values from outside, cleaned on the way in --------------------------------------------
//
// A document may come from anyone, and its style, label and geometry values reach markup the app
// builds as a string (the Nested Block miniature, the stencil glyphs, the SVG export). Those
// builders escape every value; this is the other end: a value that is not what its field means —
// a colour that is not a colour, a number that is not a number — is dropped as the document is
// read, so it falls back to the default look. Dropped rather than refused, so one stray value
// never makes someone's diagram unopenable; nothing the app writes is ever outside these rules,
// so a legitimate document comes through unchanged.

const HEX_COLOUR = /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const CHANNEL = String.raw`\s*\d{1,3}(?:\.\d+)?%?\s*`;
const ALPHA = String.raw`\s*(?:\d?\.\d+|[01]|\d{1,3}%)\s*`;
const RGB_COLOUR = new RegExp(String.raw`^rgba?\(${CHANNEL},${CHANNEL},${CHANNEL}(?:,${ALPHA})?\)$`, "i");
const NAMED_COLOURS = new Set(
  (
    "none transparent aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond blue blueviolet " +
    "brown burlywood cadetblue chartreuse chocolate coral cornflowerblue cornsilk crimson cyan darkblue darkcyan " +
    "darkgoldenrod darkgray darkgreen darkgrey darkkhaki darkmagenta darkolivegreen darkorange darkorchid darkred " +
    "darksalmon darkseagreen darkslateblue darkslategray darkslategrey darkturquoise darkviolet deeppink deepskyblue " +
    "dimgray dimgrey dodgerblue firebrick floralwhite forestgreen fuchsia gainsboro ghostwhite gold goldenrod gray " +
    "green greenyellow grey honeydew hotpink indianred indigo ivory khaki lavender lavenderblush lawngreen " +
    "lemonchiffon lightblue lightcoral lightcyan lightgoldenrodyellow lightgray lightgreen lightgrey lightpink " +
    "lightsalmon lightseagreen lightskyblue lightslategray lightslategrey lightsteelblue lightyellow lime limegreen " +
    "linen magenta maroon mediumaquamarine mediumblue mediumorchid mediumpurple mediumseagreen mediumslateblue " +
    "mediumspringgreen mediumturquoise mediumvioletred midnightblue mintcream mistyrose moccasin navajowhite navy " +
    "oldlace olive olivedrab orange orangered orchid palegoldenrod palegreen paleturquoise palevioletred papayawhip " +
    "peachpuff peru pink plum powderblue purple rebeccapurple red rosybrown royalblue saddlebrown salmon sandybrown " +
    "seagreen seashell sienna silver skyblue slateblue slategray slategrey snow springgreen steelblue tan teal thistle " +
    "tomato turquoise violet wheat white whitesmoke yellow yellowgreen"
  ).split(" "),
);

/** A colour Nedito draws with: hex, rgb()/rgba(), a CSS named colour, "none" or "transparent". */
export function isSafeColour(value: unknown): value is string {
  return typeof value === "string" && (HEX_COLOUR.test(value) || RGB_COLOUR.test(value) || NAMED_COLOURS.has(value.toLowerCase()));
}

const COLOUR_KEYS = new Set(["fill", "stroke", "fontColor", "labelColor", "background"]);
/** Number-valued style keys, with the range a real document stays inside. */
const NUMBER_KEYS: Record<string, [number, number]> = {
  strokeWidth: [0, 100],
  fillOpacity: [0, 1],
  opacity: [0, 1],
  fontSize: [1, 400],
};
/** Any other style value: a short word, an id, a number with a unit — never markup. */
const PLAIN_TOKEN = /^[A-Za-z0-9 #.,%:_()/+-]{0,200}$/;

const inRange = (v: unknown, [lo, hi]: [number, number]): v is number => typeof v === "number" && Number.isFinite(v) && v >= lo && v <= hi;

/** A style map with every value that is not what its key means dropped. Returns the count dropped too. */
export function cleanStyle(style: unknown): { style: Record<string, string | number | boolean>; dropped: number } {
  const out: Record<string, string | number | boolean> = {};
  let dropped = 0;
  if (typeof style !== "object" || style === null || Array.isArray(style)) return { style: out, dropped: style === undefined ? 0 : 1 };
  for (const [key, value] of Object.entries(style as Record<string, unknown>)) {
    const ok = COLOUR_KEYS.has(key)
      ? isSafeColour(value)
      : key in NUMBER_KEYS
        ? inRange(value, NUMBER_KEYS[key])
        : typeof value === "boolean" || (typeof value === "number" && Number.isFinite(value)) || (typeof value === "string" && PLAIN_TOKEN.test(value));
    if (ok) out[key] = value as string | number | boolean;
    else dropped++;
  }
  return { style: out, dropped };
}

const POSITION: [number, number] = [-1e7, 1e7];
const SIZE: [number, number] = [Number.MIN_VALUE, 1e7];

/**
 * Cleans a freshly read document in place, before validateDoc checks its structure: colours,
 * numbers and plain style values that are not what their field means are dropped (falling back
 * to the default look), and a position or size that is not a finite number is replaced by a safe
 * default, since a shape cannot do without one. Returns how many values it changed.
 */
export function cleanDocValues(doc: DiagramDocument): number {
  let changed = 0;
  const num = (v: unknown, range: [number, number], fallback: number): number => {
    if (inRange(v, range)) return v;
    changed++;
    return fallback;
  };
  const cleanLabel = (owner: { label?: unknown }) => {
    const label = owner.label as Record<string, unknown> | undefined;
    if (!label || typeof label !== "object") return;
    if ("color" in label && !isSafeColour(label.color)) {
      delete label.color;
      changed++;
    }
    if ("fontSize" in label && !inRange(label.fontSize, NUMBER_KEYS.fontSize)) {
      delete label.fontSize;
      changed++;
    }
    for (const flag of ["bold", "italic"]) {
      if (flag in label && typeof label[flag] !== "boolean") {
        delete label[flag];
        changed++;
      }
    }
    if ("align" in label && !["left", "center", "right"].includes(label.align as string)) {
      delete label.align;
      changed++;
    }
  };
  for (const diagram of Object.values(doc.diagrams ?? {})) {
    if (typeof diagram !== "object" || diagram === null) continue;
    const d = diagram as Diagram & { background?: unknown; pageSize?: unknown };
    if ("background" in d && d.background !== undefined && !isSafeColour(d.background)) {
      delete d.background;
      changed++;
    }
    if (d.pageSize !== undefined) {
      const p = d.pageSize as { w?: unknown; h?: unknown };
      if (!(p && inRange(p.w, SIZE) && inRange(p.h, SIZE))) {
        delete d.pageSize;
        changed++;
      }
    }
    for (const node of Array.isArray(d.nodes) ? d.nodes : []) {
      if (typeof node !== "object" || node === null) continue;
      const n = node as DNode & { position?: { x: unknown; y: unknown }; size?: { w: unknown; h: unknown } };
      n.position = { x: num(n.position?.x, POSITION, 0), y: num(n.position?.y, POSITION, 0) };
      n.size = { w: num(n.size?.w, SIZE, 120), h: num(n.size?.h, SIZE, 60) };
      if (n.rotation !== undefined && !inRange(n.rotation, [-36000, 36000])) {
        delete n.rotation;
        changed++;
      }
      if (!inRange(n.z, [-1e9, 1e9])) {
        n.z = 0;
        changed++;
      }
      const s = cleanStyle(n.style);
      n.style = s.style;
      changed += s.dropped;
      cleanLabel(n);
      if (n.type === "nested" && Array.isArray(n.ports)) {
        for (const port of n.ports) port.offset = num(port.offset, [0, 1], 0.5);
      }
    }
    for (const edge of Array.isArray(d.edges) ? d.edges : []) {
      if (typeof edge !== "object" || edge === null) continue;
      const s = cleanStyle(edge.style);
      edge.style = s.style;
      changed += s.dropped;
      cleanLabel(edge);
    }
  }

  // Comments carry an author's own text, which a hostile document can make anything at all. What is
  // checked here is only that a comment is shaped like one: anything else is dropped, so nothing
  // downstream has to ask whether a comment's body is really a string. Stale ids are a separate
  // matter and are left alone — model/comments.ts resolves those, and they are not an error.
  if (doc.comments !== undefined) {
    const comments = Array.isArray(doc.comments) ? doc.comments : [];
    if (!Array.isArray(doc.comments)) changed++;
    const ids = (v: unknown): string[] | undefined => {
      if (!Array.isArray(v)) return undefined;
      const out = v.filter((id): id is string => typeof id === "string");
      if (out.length !== v.length) changed++;
      return out.length > 0 ? out : undefined;
    };
    const cleaned = comments.filter((n) => typeof n === "object" && n !== null).map((comment) => {
      const n = comment as unknown as Record<string, unknown>;
      const focus = (typeof n.focus === "object" && n.focus !== null ? n.focus : {}) as Record<string, unknown>;
      const nodeIds = ids(focus.nodeIds);
      const edgeIds = ids(focus.edgeIds);
      return {
        id: typeof n.id === "string" ? n.id : "",
        ...(typeof n.title === "string" ? { title: n.title } : {}),
        body: typeof n.body === "string" ? n.body : "",
        focus: {
          diagramId: typeof focus.diagramId === "string" ? focus.diagramId : "",
          ...(nodeIds ? { nodeIds } : {}),
          ...(edgeIds ? { edgeIds } : {}),
        },
      };
    });
    const whole = cleaned.filter((n) => n.id !== "" && n.focus.diagramId !== "");
    changed += comments.length - whole.length;
    if (whole.length === 0) delete doc.comments;
    else doc.comments = whole;
  }
  return changed;
}
