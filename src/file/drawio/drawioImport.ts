// drawio XML import, a best-effort mapping. Turns an .drawio/.xml file
// into a DiagramDocument, reporting in plain words whatever it could not carry across.
//
// "Best-effort" is the whole design brief, so two rules run through everything below:
//   1. Never drop content silently. A shape we cannot draw becomes a rectangle of the right
//      size, in the right place, with its label and colours intact, and says so in a warning.
//      A missing shape the user can see beats a faithful-looking diagram that quietly lost a
//      third of itself.
//   2. Never produce an invalid document. The result goes through the same validateDoc() as
//      any opened file, and a failure there is reported rather than loaded.
//
// Nesting has no draw.io equivalent, so nothing here ever produces a NestedNode; an imported
// diagram is flat and the author can convert selections afterwards.
import type * as CloudIcons from "./cloudIcons";
import type { ImportNotice } from "../importNotices";
import { nanoid } from "nanoid";
import { APP_VERSION } from "../../app/version";
import { BRAND } from "../../app/brand";
import { createDefaultLayers } from "../../model/layers";
import { validateDoc } from "../../model/validate";
import { assetProblem, IMAGE_SHAPE_REF } from "../../model/assets";
import type { DEdge, DNode, DiagramDocument, Diagram, EdgeEnd, EdgeLabelPosition, GroupNode, ImageAsset, Layer, RichLabel, ShapeNode } from "../../model/types";
import { imageSizeFromBytes, sniffImageType } from "../imageImport";
import { imageRefFromStyle, isImageCell, readDrawioPicture } from "./drawioImages";
import { CURRENT_FORMAT_VERSION } from "../documentFormat";
import { parseMxStyle, toEdgeStyle, toNodeStyle, toShapeRef } from "./mxStyle";
import { unwrapMxfile } from "./mxfile";

export type DrawioImportResult =
  | { ok: true; doc: DiagramDocument; notices: ImportNotice[] }
  | { ok: false; error: string };

interface Geometry {
  x: number;
  y: number;
  w: number;
  h: number;
}

function readGeometry(cell: Element): Geometry {
  const g = Array.from(cell.children).find((c) => c.nodeName === "mxGeometry");
  const num = (name: string) => {
    const v = Number(g?.getAttribute(name));
    return Number.isFinite(v) ? v : 0;
  };
  return { x: num("x"), y: num("y"), w: num("width"), h: num("height") };
}

function readWaypoints(cell: Element): { x: number; y: number }[] {
  const g = Array.from(cell.children).find((c) => c.nodeName === "mxGeometry");
  const array = g ? Array.from(g.children).find((c) => c.nodeName === "Array" && c.getAttribute("as") === "points") : null;
  if (!array) return [];
  return Array.from(array.children)
    .filter((p) => p.nodeName === "mxPoint")
    .map((p) => ({ x: Number(p.getAttribute("x")) || 0, y: Number(p.getAttribute("y")) || 0 }));
}

/** An edge's loose end, `<mxPoint as="sourcePoint|targetPoint">` in its geometry, or null. */
function readTerminalPoint(cell: Element, which: "sourcePoint" | "targetPoint"): { x: number; y: number } | null {
  const g = Array.from(cell.children).find((c) => c.nodeName === "mxGeometry");
  const p = g ? Array.from(g.children).find((c) => c.nodeName === "mxPoint" && c.getAttribute("as") === which) : null;
  if (!p) return null;
  const x = Number(p.getAttribute("x") ?? 0);
  const y = Number(p.getAttribute("y") ?? 0);
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
}

/**
 * draw.io labels are HTML when `html=1`, which is almost always. We keep the text and the
 * handful of attributes RichLabel can actually represent, and drop the rest — a label that
 * arrives as readable text beats one that arrives as markup.
 */
function toLabel(value: string, style: ReturnType<typeof parseMxStyle>): RichLabel | undefined {
  const text = htmlToText(value);
  if (!text) return undefined;

  const label: RichLabel = { text };
  if (/<(b|strong)[\s>]/i.test(value) || style.keys.fontStyle === "1" || style.keys.fontStyle === "3") {
    label.bold = true;
  }
  if (/<(i|em)[\s>]/i.test(value) || style.keys.fontStyle === "2" || style.keys.fontStyle === "3") {
    label.italic = true;
  }
  const size = Number(style.keys.fontSize);
  if (Number.isFinite(size) && size > 0) label.fontSize = size;
  if (style.keys.fontColor && style.keys.fontColor.toLowerCase() !== "none") label.color = style.keys.fontColor;
  const align = style.keys.align;
  if (align === "left" || align === "center" || align === "right") label.align = align;
  return label;
}

const ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&apos;": "'",
  "&nbsp;": " ",
};

function htmlToText(value: string): string {
  return value
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(div|p|li)>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(Number(code)))
    .replace(/&[a-z#0-9]+;/gi, (m) => ENTITIES[m.toLowerCase()] ?? m)
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * The cell carrying a vertex/edge's own data. draw.io wraps a cell in <object> or <UserObject>
 * when it has custom properties or a plain-text label, putting the label on a `label` attribute
 * instead of the mxCell's `value` — miss this and every such shape imports unlabelled.
 */
interface CellRecord {
  id: string;
  value: string;
  cell: Element;
  /** The object's link and tooltip, which have no place here (X6): kept only to say so. */
  link?: string;
  tooltip?: string;
}

/** The wrapper's own attributes that are draw.io's, not the author's data. */
const OBJECT_KEYS = new Set(["id", "label", "placeholders", "link", "tooltip", "linkTarget"]);

/**
 * An object's label with its `%name%` placeholders filled from the object's own data, as draw.io
 * shows it (X6, D137). An unknown name is left as written; `%%` is a literal percent sign.
 */
export function fillPlaceholders(label: string, data: Record<string, string>): string {
  return label.replace(/%([A-Za-z0-9_-]*)%/g, (whole, name: string) => {
    if (name === "") return "%";
    return Object.prototype.hasOwnProperty.call(data, name) ? data[name] : whole;
  });
}

function collectCells(model: Element): CellRecord[] {
  const root = model.getElementsByTagName("root")[0];
  if (!root) return [];
  const out: CellRecord[] = [];
  for (const child of Array.from(root.children)) {
    if (child.nodeName === "mxCell") {
      out.push({ id: child.getAttribute("id") ?? "", value: child.getAttribute("value") ?? "", cell: child });
      continue;
    }
    // <object> / <UserObject> wrapper
    const inner = child.getElementsByTagName("mxCell")[0];
    if (inner) {
      let value = child.getAttribute("label") ?? inner.getAttribute("value") ?? "";
      if (child.getAttribute("placeholders") === "1") {
        const data: Record<string, string> = {};
        for (const a of Array.from(child.attributes)) if (!OBJECT_KEYS.has(a.name)) data[a.name] = a.value;
        value = fillPlaceholders(value, data);
      }
      out.push({
        id: child.getAttribute("id") ?? inner.getAttribute("id") ?? "",
        value,
        cell: inner,
        ...(child.getAttribute("link") ? { link: child.getAttribute("link")! } : {}),
        ...(child.getAttribute("tooltip") ? { tooltip: child.getAttribute("tooltip")! } : {}),
      });
    }
  }
  return out;
}

interface PageResult {
  diagram: Diagram;
  notices: ImportNotice[];
}

/** Pictures found across the whole file, each stored once however often it appears (D82). */
interface PictureStore {
  assets: Record<string, ImageAsset>;
  idByData: Map<string, string>;
}

/** Adds a picture to the store (once), returning its asset id; null if it cannot be used. */
function storePicture(pictures: PictureStore, bytes: Uint8Array, fallback: { w: number; h: number }): string | null {
  const mime = sniffImageType(bytes);
  if (!mime) return null;
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  const data = btoa(s);
  const known = pictures.idByData.get(data);
  if (known) return known;
  const size = imageSizeFromBytes(bytes, mime) ?? { width: Math.round(fallback.w) || 1, height: Math.round(fallback.h) || 1 };
  const asset: ImageAsset = { mime, data, width: size.width, height: size.height };
  if (assetProblem(asset)) return null;
  const id = nanoid();
  pictures.assets[id] = asset;
  pictures.idByData.set(data, id);
  return id;
}

function convertPage(model: Element, title: string, pageLabel: string, pictures: PictureStore, cloud: typeof CloudIcons): PageResult {
  const cells = collectCells(model);
  const notices: ImportNotice[] = [];
  // Minted first rather than when the diagram is assembled, so each notice can say which page it
  // is about.
  const diagramId = nanoid();

  // draw.io ids are unique per page and may be things like "0"/"1"; Nedito requires nanoid
  // strings unique across the whole document (a validation invariant), so every cell gets a new
  // id and edges are rewired through this map.
  const idMap = new Map<string, string>();
  for (const c of cells) if (c.id) idMap.set(c.id, nanoid());

  const geometryById = new Map<string, Geometry>();
  const parentById = new Map<string, string>();
  for (const c of cells) {
    geometryById.set(c.id, readGeometry(c.cell));
    parentById.set(c.id, c.cell.getAttribute("parent") ?? "");
  }

  /**
   * draw.io stores a child's geometry relative to its parent; Nedito positions every node in
   * diagram coordinates. Walk up the parent chain adding offsets. Guarded against a cyclic
   * parent chain, which a corrupt file can contain and which would otherwise hang the import.
   */
  function absolutePosition(id: string): { x: number; y: number } {
    let x = 0;
    let y = 0;
    let current = id;
    const seen = new Set<string>();
    while (current && !seen.has(current)) {
      seen.add(current);
      const g = geometryById.get(current);
      if (g) {
        x += g.x;
        y += g.y;
      }
      const parent = parentById.get(current) ?? "";
      // "0" is the model root and "1" the default layer; neither contributes an offset.
      if (!parent || parent === "0" || parent === "1") break;
      current = parent;
    }
    return { x, y };
  }

  // Layers: draw.io's layers are the root's own children, bottom
  // first. Each becomes a Nedito layer with its name, visibility and lock, so a layer the author
  // hid stays hidden for everyone the file is passed to. What a collapsed container folds away
  // goes on a hidden layer of its own rather than spilling out beside it.
  const layerCells = cells.filter(
    (c) => parentById.get(c.id) === "0" && c.cell.getAttribute("vertex") !== "1" && c.cell.getAttribute("edge") !== "1",
  );
  const layers: Layer[] = layerCells.length
    ? layerCells.map((c, i) => ({
        id: nanoid(),
        name: htmlToText(c.value).trim() || `Layer ${i + 1}`,
        visible: c.cell.getAttribute("visible") !== "0",
        locked: parseMxStyle(c.cell.getAttribute("style")).keys.locked === "1",
      }))
    : createDefaultLayers();
  const layerIdOf = new Map(layerCells.map((c, i) => [c.id, layers[i].id]));
  const collapsedIds = new Set(cells.filter((c) => c.cell.getAttribute("collapsed") === "1").map((c) => c.id));
  /** The layer a cell sits on, and whether a collapsed container above it folds it away. */
  function placement(id: string): { layer?: string; folded: boolean } {
    let folded = false;
    let current = parentById.get(id) ?? "";
    const seen = new Set<string>();
    while (current && !seen.has(current)) {
      seen.add(current);
      if (layerIdOf.has(current)) return { layer: layerIdOf.get(current), folded };
      if (collapsedIds.has(current)) folded = true;
      current = parentById.get(current) ?? "";
    }
    return { folded };
  }

  const edgeCellIds = new Set(cells.filter((c) => c.cell.getAttribute("edge") === "1").map((c) => c.id));

  const nodes: DNode[] = [];
  const edges: DEdge[] = [];
  const unmappedShapes = new Set<string>();
  /** The nodes drawn as stand-ins, so the notice can take the user to them. */
  const substitutedIds: string[] = [];
  /** Pictures that stayed rectangles: linked from the web (never fetched), or unreadable. */
  const linkedPictureIds: string[] = [];
  const unreadablePictureIds: string[] = [];
  let z = 0;

  // Vertices first, so every edge endpoint already exists to be validated against.
  for (const c of cells) {
    if (c.cell.getAttribute("vertex") !== "1") continue;
    const style = parseMxStyle(c.cell.getAttribute("style"));
    // A line's own label stored as a cell of its own (X4, D135) goes with its line, below — not
    // drawn as a box near the canvas origin.
    if (style.names.includes("edgelabel") && edgeCellIds.has(parentById.get(c.id) ?? "")) continue;
    const geom = geometryById.get(c.id)!;
    const pos = absolutePosition(c.id);
    const id = idMap.get(c.id)!;
    z += 1;

    // draw.io's group is a plain vertex with style "group" whose members name it as parent.
    if (style.names.includes("group")) {
      const childIds = cells
        .filter((other) => other.cell.getAttribute("parent") === c.id && idMap.has(other.id))
        .map((other) => idMap.get(other.id)!);
      const group: GroupNode = {
        id,
        type: "group",
        childIds,
        position: pos,
        size: { w: geom.w, h: geom.h },
        z,
        style: {},
      };
      nodes.push(group);
      continue;
    }

    const size = { w: geom.w || 120, h: geom.h || 60 };

    // A picture (D82): embedded ones become real image nodes; a linked one is never fetched and
    // stays a rectangle, said so in a notice of its own.
    // A cloud vendor's icon becomes our official icon for the same service (X1, D132) — before
    // the picture rule, since Azure's arrive as linked pictures of draw.io's own copies.
    const service = cloud.cloudServiceOf(style, imageRefFromStyle(c.cell.getAttribute("style")));
    const cloudRef = service ? cloud.matchCloudIcon(service.vendor, service.name) : null;
    let imageId: string | null = null;
    if (!cloudRef && isImageCell(style)) {
      const ref = imageRefFromStyle(c.cell.getAttribute("style"));
      const picture = ref ? readDrawioPicture(ref) : ({ kind: "unreadable" } as const);
      if (picture.kind === "embedded") imageId = storePicture(pictures, picture.bytes, size);
      if (!imageId) (picture.kind === "linked" ? linkedPictureIds : unreadablePictureIds).push(id);
    }

    const match = cloudRef
      ? { shapeRef: cloudRef, matched: true }
      : imageId
        ? { shapeRef: IMAGE_SHAPE_REF, matched: true }
        : isImageCell(style)
          ? { shapeRef: "general/rect", matched: true }
          : toShapeRef(style);
    if (!match.matched && "requested" in match && match.requested) {
      unmappedShapes.add(match.requested);
      substitutedIds.push(id);
    }

    const node: ShapeNode = {
      id,
      type: "shape",
      shapeRef: match.shapeRef,
      position: pos,
      size,
      z,
      // A picture carries no fill or line of draw.io's: its border, if any, is its own. Nor does a
      // vendor icon, which is drawn as the vendor publishes it; its label keeps its place.
      style: imageId ? {} : cloudRef ? labelPlacement(toNodeStyle(style)) : toNodeStyle(style),
      ...(imageId ? { imageId } : {}),
    };
    const rotation = Number(style.keys.rotation);
    if (Number.isFinite(rotation) && rotation !== 0) node.rotation = rotation;
    const label = toLabel(c.value, style);
    if (label) node.label = label;
    nodes.push(node);
  }

  // Containment (X5, D136): a swimlane, table or container holds its children in draw.io — moving
  // it moves them. Nedito's equivalent is a group of the container and everything inside it.
  // Only the outermost container groups (groups are flat here), never one that sits inside a
  // draw.io group or holds one, and never a collapsed one, whose contents are folded away (X3).
  const vertexCells = new Map(cells.filter((c) => c.cell.getAttribute("vertex") === "1").map((c) => [c.id, c]));
  const styleOf = (id: string) => parseMxStyle(vertexCells.get(id)?.cell.getAttribute("style") ?? null);
  const holds = (id: string) => {
    const s = styleOf(id);
    return s.names.includes("swimlane") || (s.keys.shape ?? "").toLowerCase() === "swimlane" || (s.keys.shape ?? "").toLowerCase() === "table" || s.keys.container === "1";
  };
  const isGroupCell = (id: string) => styleOf(id).names.includes("group");
  const ancestors = (id: string): string[] => {
    const out: string[] = [];
    const seen = new Set<string>();
    let current = parentById.get(id) ?? "";
    while (current && vertexCells.has(current) && !seen.has(current)) {
      seen.add(current);
      out.push(current);
      current = parentById.get(current) ?? "";
    }
    return out;
  };
  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  for (const [cellId] of vertexCells) {
    if (!holds(cellId) || collapsedIds.has(cellId)) continue;
    if (ancestors(cellId).some((a) => holds(a) || isGroupCell(a))) continue;
    const inside = [...vertexCells.keys()].filter((other) => other !== cellId && ancestors(other).includes(cellId));
    if (inside.length === 0 || inside.some(isGroupCell)) continue;
    const container = nodeById.get(idMap.get(cellId) ?? "");
    const members = inside.map((other) => nodeById.get(idMap.get(other) ?? "")).filter((n): n is DNode => n !== undefined);
    if (!container || members.length === 0) continue;
    nodes.push({
      id: nanoid(),
      type: "group",
      childIds: [container.id, ...members.map((m) => m.id)],
      position: { ...container.position },
      size: { ...container.size },
      z: container.z,
      style: {},
    });
  }

  const nodeIds = new Set(nodes.map((n) => n.id));
  let danglingEdges = 0;
  let endsOnLines = 0;
  const extraLabelIds: string[] = [];

  /** Roughly where a draw.io line runs through its middle, in diagram coordinates. */
  function lineMidpoint(edgeCellId: string): { x: number; y: number } | null {
    const cell = cells.find((o) => o.id === edgeCellId)?.cell;
    if (!cell) return null;
    const parent = parentById.get(edgeCellId) ?? "";
    const base = parent && parent !== "0" && parent !== "1" && !layerIdOf.has(parent) ? absolutePosition(parent) : { x: 0, y: 0 };
    const points = readWaypoints(cell);
    if (points.length) {
      const p = points[Math.floor(points.length / 2)];
      return { x: p.x + base.x, y: p.y + base.y };
    }
    const endAt = (attr: "source" | "target", which: "sourcePoint" | "targetPoint") => {
      const ref = cell.getAttribute(attr);
      if (ref && geometryById.has(ref) && !edgeCellIds.has(ref)) {
        const g = geometryById.get(ref)!;
        const p = absolutePosition(ref);
        return { x: p.x + g.w / 2, y: p.y + g.h / 2 };
      }
      const loose = readTerminalPoint(cell, which);
      return loose ? { x: loose.x + base.x, y: loose.y + base.y } : null;
    };
    const a = endAt("source", "sourcePoint");
    const b = endAt("target", "targetPoint");
    return a && b ? { x: Math.round((a.x + b.x) / 2), y: Math.round((a.y + b.y) / 2) } : null;
  }

  for (const c of cells) {
    if (c.cell.getAttribute("edge") !== "1") continue;
    const sourceRaw = c.cell.getAttribute("source");
    const targetRaw = c.cell.getAttribute("target");
    const source = sourceRaw ? idMap.get(sourceRaw) : undefined;
    const target = targetRaw ? idMap.get(targetRaw) : undefined;

    // draw.io lets an end float at a point instead of on a cell — a line drawn from its sidebar,
    // or a connection never finished. Since v4 an end can be free here too (D86), so such a line
    // comes across where it was; only an end with neither a shape nor a point is skipped.
    const parent = c.cell.getAttribute("parent") ?? "";
    const offset = parent && parent !== "0" && parent !== "1" ? absolutePosition(parent) : { x: 0, y: 0 };
    const at = (p: { x: number; y: number } | null) => (p ? { point: { x: p.x + offset.x, y: p.y + offset.y } } : null);
    // A line may end on another line in draw.io; Nedito's cannot, so that end is kept loose at
    // the other line's middle — the connection drawn, not dropped (X4, D135).
    const onLine = (raw: string | null): EdgeEnd | null => {
      if (!raw || !edgeCellIds.has(raw)) return null;
      const mid = lineMidpoint(raw);
      if (mid) endsOnLines += 1;
      return mid ? { point: mid } : null;
    };
    const sourceEnd: EdgeEnd | null = source && nodeIds.has(source) ? { nodeId: source } : (onLine(sourceRaw) ?? at(readTerminalPoint(c.cell, "sourcePoint")));
    const targetEnd: EdgeEnd | null = target && nodeIds.has(target) ? { nodeId: target } : (onLine(targetRaw) ?? at(readTerminalPoint(c.cell, "targetPoint")));
    if (!sourceEnd || !targetEnd) {
      danglingEdges += 1;
      continue;
    }

    const style = parseMxStyle(c.cell.getAttribute("style"));
    const edgeStyle = toEdgeStyle(style);
    // Where draw.io fixed the line to its shapes (exitX/exitY, entryX/entryY).
    if (sourceEnd.nodeId) anchorEnd(sourceEnd, edgeStyle, "sourceHandle", style.keys.exitX, style.keys.exitY);
    if (targetEnd.nodeId) anchorEnd(targetEnd, edgeStyle, "targetHandle", style.keys.entryX, style.keys.entryY);
    // draw.io's entity-relation style runs side to side, from the facing sides (X5, D136).
    if (style.keys.edgeStyle === "entityRelationEdgeStyle" && sourceEnd.nodeId && targetEnd.nodeId) {
      const a = nodeById.get(sourceEnd.nodeId);
      const b = nodeById.get(targetEnd.nodeId);
      if (a && b) {
        const rightward = a.position.x + a.size.w / 2 <= b.position.x + b.size.w / 2;
        edgeStyle.sourceHandle ??= rightward ? "right" : "left";
        edgeStyle.targetHandle ??= rightward ? "left" : "right";
      }
    }
    const edge: DEdge = {
      id: idMap.get(c.id) ?? nanoid(),
      source: sourceEnd,
      target: targetEnd,
      style: edgeStyle,
    };
    const waypoints = readWaypoints(c.cell);
    if (waypoints.length) edge.waypoints = waypoints;
    const label = toLabel(c.value, style);
    if (label) {
      edge.label = label;
      const placed = readLabelPlacement(c.cell);
      if (placed) edge.labelPosition = placed;
    }
    // Its labels stored as cells of their own: the first becomes its label, where it was along
    // the line; a line that already has one keeps the others as text beside it.
    for (const extra of cells.filter((o) => parentById.get(o.id) === c.id && o.cell.getAttribute("vertex") === "1")) {
      const extraStyle = parseMxStyle(extra.cell.getAttribute("style"));
      if (!extraStyle.names.includes("edgelabel")) continue;
      const text = toLabel(extra.value, extraStyle);
      if (!text) continue;
      if (!edge.label) {
        edge.label = text;
        const placed = readLabelPlacement(extra.cell);
        if (placed) edge.labelPosition = placed;
        continue;
      }
      const mid = lineMidpoint(c.id) ?? { x: 0, y: 0 };
      z += 1;
      const textNode: ShapeNode = {
        id: idMap.get(extra.id) ?? nanoid(),
        type: "shape",
        shapeRef: "general/text",
        position: { x: mid.x - 50, y: mid.y + 8 },
        size: { w: 100, h: 24 },
        z,
        style: {},
        label: text,
      };
      nodes.push(textNode);
      extraLabelIds.push(textNode.id);
    }
    edges.push(edge);
  }

  if (endsOnLines) {
    notices.push({
      diagramId,
      message: `${pageLabel}: ${endsOnLines} line end${endsOnLines === 1 ? " was" : "s were"} attached to another line, which lines here cannot be — ${endsOnLines === 1 ? "it is" : "they are"} left loose at the middle of that line.`,
      nodeIds: [],
    });
  }
  if (extraLabelIds.length) {
    notices.push({
      diagramId,
      message: `${pageLabel}: ${extraLabelIds.length} line${extraLabelIds.length === 1 ? " had" : "s had"} a second label; a line here has one, so the others are text beside it.`,
      nodeIds: extraLabelIds,
    });
  }

  // Every node and line onto its layer (the first layer is left implicit, as everywhere else).
  const originalOf = new Map(Array.from(idMap, ([original, minted]) => [minted, original]));
  let foldedLayer: Layer | null = null;
  const folded = new Set<string>();
  const place = (item: { id: string; layerId?: string }, fold: boolean) => {
    const at = placement(originalOf.get(item.id) ?? "");
    if (at.folded || fold) {
      foldedLayer ??= { id: nanoid(), name: "Folded in draw.io", visible: false, locked: false };
      item.layerId = foldedLayer.id;
      folded.add(item.id);
    } else if (at.layer && at.layer !== layers[0].id) {
      item.layerId = at.layer;
    }
  };
  for (const n of nodes) place(n, false);
  // A line to something folded away is folded with it, rather than ending in empty space.
  for (const e of edges) place(e, (!!e.source.nodeId && folded.has(e.source.nodeId)) || (!!e.target.nodeId && folded.has(e.target.nodeId)));
  if (foldedLayer) layers.push(foldedLayer);

  for (const layer of layers) {
    if (layer.visible || layer === foldedLayer) continue;
    notices.push({
      diagramId,
      message: `${pageLabel}: the layer “${layer.name}” was hidden in draw.io and stays hidden here — show it from Layers.`,
      nodeIds: [],
    });
  }
  const foldedShapes = nodes.filter((n) => folded.has(n.id)).length;
  if (foldedShapes) {
    notices.push({
      diagramId,
      message: `${pageLabel}: ${foldedShapes} shape${foldedShapes === 1 ? " was" : "s were"} folded inside a collapsed container in draw.io, so ${foldedShapes === 1 ? "it is" : "they are"} on the hidden layer “Folded in draw.io” — show it from Layers.`,
      nodeIds: [],
    });
  }

  // What has no place here, said rather than dropped quietly (X6, D137): links and tooltips on
  // draw.io's objects, and the small style losses — gradients, underline, colours within a label.
  const drawnIds = new Set([...nodes.map((n) => n.id), ...edges.map((e) => e.id)]);
  const present = (c: CellRecord) => drawnIds.has(idMap.get(c.id) ?? "");
  const withLink = cells.filter((c) => c.link && present(c));
  const withTip = cells.filter((c) => c.tooltip && present(c));
  if (withLink.length || withTip.length) {
    const parts = [
      withLink.length ? `${withLink.length} ${withLink.length === 1 ? `shape had a link (${withLink[0].link})` : "shapes had links"}` : "",
      withTip.length ? `${withTip.length} ${withTip.length === 1 ? "had a tooltip" : "had tooltips"}` : "",
    ].filter(Boolean);
    notices.push({
      diagramId,
      message: `${pageLabel}: ${parts.join(" and ")}; shapes here have neither, so ${withLink.length + withTip.length === 1 ? "it was" : "they were"} left out.`,
      nodeIds: [...new Set([...withLink, ...withTip].map((c) => idMap.get(c.id)!))],
    });
  }
  const lost = { gradients: [] as string[], underlined: [] as string[], colouredWords: [] as string[] };
  for (const c of cells) {
    if (!present(c)) continue;
    const s = parseMxStyle(c.cell.getAttribute("style"));
    const id = idMap.get(c.id)!;
    if (s.keys.gradientColor && s.keys.gradientColor.toLowerCase() !== "none") lost.gradients.push(id);
    if ((Number(s.keys.fontStyle) & 4) === 4) lost.underlined.push(id);
    if (/<font[^>]*\bcolor=|style="[^"]*\bcolor:/i.test(c.value)) lost.colouredWords.push(id);
  }
  const lostParts = [
    lost.gradients.length ? `gradients on ${lost.gradients.length}` : "",
    lost.underlined.length ? `underlined text on ${lost.underlined.length}` : "",
    lost.colouredWords.length ? `colours within the label on ${lost.colouredWords.length}` : "",
  ].filter(Boolean);
  if (lostParts.length) {
    notices.push({
      diagramId,
      message: `${pageLabel}: some styling has no equivalent here and was left out — ${lostParts.join(", ")}. The shapes and their words are all there.`,
      nodeIds: [...new Set([...lost.gradients, ...lost.underlined, ...lost.colouredWords])],
    });
  }

  if (unmappedShapes.size) {
    const names = Array.from(unmappedShapes).sort();
    const list = names.slice(0, 6).join(", ");
    const more = names.length > 6 ? ` and ${names.length - 6} more` : "";
    const plural = names.length === 1 && !more ? "a plain rectangle" : "plain rectangles";
    notices.push({
      diagramId,
      message: `${pageLabel}: drew ${list}${more} as ${plural} — no matching shape here yet.`,
      nodeIds: substitutedIds,
    });
  }
  if (linkedPictureIds.length) {
    const n = linkedPictureIds.length;
    notices.push({
      diagramId,
      message: `${pageLabel}: ${n} picture${n === 1 ? " is" : "s are"} linked from the web rather than stored in the file. Nothing is fetched — this app never goes online — so ${n === 1 ? "it is" : "they are"} drawn as plain rectangles.`,
      nodeIds: linkedPictureIds,
    });
  }
  if (unreadablePictureIds.length) {
    const n = unreadablePictureIds.length;
    notices.push({
      diagramId,
      message: `${pageLabel}: ${n} embedded picture${n === 1 ? "" : "s"} couldn't be read and ${n === 1 ? "is" : "are"} drawn as plain rectangles.`,
      nodeIds: unreadablePictureIds,
    });
  }
  if (danglingEdges) {
    // Nothing survived to point at, so "Show" opens the page rather than selecting anything.
    notices.push({
      diagramId,
      message: `${pageLabel}: skipped ${danglingEdges} connection${danglingEdges === 1 ? "" : "s"} with an end that is neither on a shape nor at a point.`,
      nodeIds: [],
    });
  }

  const diagram: Diagram = {
    id: diagramId,
    title,
    nodes,
    edges,
    layers,
  };

  const bg = model.getAttribute("background");
  if (bg && bg.toLowerCase() !== "none") diagram.background = bg;

  return { diagram, notices };
}

/**
 * Reads .drawio / .xml text into a document. Async because draw.io's compressed pages need the
 * platform's DecompressionStream (see mxfile.ts).
 */
export async function decodeDrawio(text: string, fileName?: string): Promise<DrawioImportResult> {
  // The vendors' icon names are only needed here, so they load with the first import (D132).
  const cloud = await import("./cloudIcons");
  const unwrapped = await unwrapMxfile(text);
  if (!unwrapped.ok) return { ok: false, error: unwrapped.error ?? "This file couldn't be read as draw.io XML." };

  const diagrams: Record<string, Diagram> = {};
  const rootDiagramIds: string[] = [];
  const notices: ImportNotice[] = [];
  const pictures: PictureStore = { assets: {}, idByData: new Map() };

  for (const page of unwrapped.pages) {
    const { diagram, notices: pageNotices } = convertPage(page.model, page.name, page.name, pictures, cloud);
    diagrams[diagram.id] = diagram;
    rootDiagramIds.push(diagram.id);
    notices.push(...pageNotices);
  }

  const now = new Date().toISOString();
  const title = (fileName ?? "").replace(/\.(drawio|xml)$/i, "").trim() || "Imported diagram";
  const doc: DiagramDocument = {
    formatVersion: CURRENT_FORMAT_VERSION,
    meta: { title, created: now, modified: now, appVersion: APP_VERSION },
    rootDiagramIds,
    diagrams,
    ...(Object.keys(pictures.assets).length ? { assets: pictures.assets } : {}),
  };

  // Same gate as any opened file: an importer that can emit a document the app would refuse to
  // open is worse than one that admits defeat here.
  const errors = validateDoc(doc);
  if (errors.length) {
    return {
      ok: false,
      error: `This draw.io file couldn't be converted into a valid ${BRAND.name} document (${errors[0].code}).`,
    };
  }

  return { ok: true, doc, notices };
}

/** Only where a vendor icon's label sits: its colours are the vendor's own (D132). */
function labelPlacement(style: Record<string, string | number>): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  for (const k of ["verticalAlign", "verticalLabelPosition", "horizontal"]) if (style[k] !== undefined) out[k] = style[k];
  return out;
}

/**
 * Where draw.io put a line's label: `x` from -1 (the start) to 1 (the end), `y` and an offset
 * point away from the line. As Nedito's EdgeLabelPosition (D97); undefined when it is the middle.
 */
function readLabelPlacement(cell: Element): EdgeLabelPosition | undefined {
  const g = Array.from(cell.children).find((c) => c.nodeName === "mxGeometry");
  if (!g) return undefined;
  const x = Number(g.getAttribute("x")) || 0;
  const y = Number(g.getAttribute("y")) || 0;
  const off = Array.from(g.children).find((p) => p.nodeName === "mxPoint" && p.getAttribute("as") === "offset");
  const ox = Number(off?.getAttribute("x")) || 0;
  const oy = Number(off?.getAttribute("y")) || 0;
  if (x === 0 && y === 0 && ox === 0 && oy === 0) return undefined;
  const r = (n: number) => Math.round(n * 10) / 10;
  return { t: Math.round(Math.min(1, Math.max(0, (x + 1) / 2)) * 100) / 100, dx: r(ox), dy: r(oy + y) };
}

/** Sides by draw.io's fixed point on them: the middle of each side is our side handle. */
const SIDE_AT: Record<string, string> = { "0.5,0": "top", "1,0.5": "right", "0.5,1": "bottom", "0,0.5": "left" };

/**
 * Where draw.io fixed a line to its shape (X4, D135): the middle of a side becomes that side's
 * handle, any other point a fixed anchor there (EdgeEnd.anchor), as the original routes.
 */
function anchorEnd(end: EdgeEnd, style: Record<string, string | number>, key: "sourceHandle" | "targetHandle", xs?: string, ys?: string): void {
  if (xs === undefined || ys === undefined) return;
  const x = Number(xs);
  const y = Number(ys);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return;
  const side = SIDE_AT[`${x},${y}`];
  if (side) style[key] = side;
  else end.anchor = { x: Math.min(1, Math.max(0, x)), y: Math.min(1, Math.max(0, y)) };
}
