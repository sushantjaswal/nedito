// Document data model: the authoritative shape of a .nedito document (docs/FORMAT.md).
import type { DiagramMotion, EdgeMotion, NodeMotion } from "./motion";

export interface DiagramDocument {
  formatVersion: number;
  meta: { title: string; created: string; modified: string; appVersion: string };
  rootDiagramIds: string[];
  diagrams: Record<string, Diagram>;
  /**
   * Pictures the document's image nodes show, keyed by id — each stored once however many nodes
   * show it. New in formatVersion 3; omitted when the document has none. See model/assets.ts.
   */
  assets?: Record<string, ImageAsset>;
  /**
   * What the author wrote about this diagram, in reading order — the array's order *is* the
   * order, with no separate index to keep in step. New in formatVersion 7; omitted when the
   * document has none. See model/notes.ts.
   */
  notes?: Note[];
}

/**
 * A piece of writing about a diagram: a paragraph of why, attached to whatever the author had
 * selected when they wrote it.
 *
 * There is deliberately no shape note, level note and flow note. There is one note, and what it
 * is about is however much was selected: one shape, several shapes and lines, or nothing at all,
 * which makes it a note about the level.
 */
export interface Note {
  /** nanoid, unique across the document like every other id. */
  id: string;
  /** One line. Falls back to the first line of `body` when absent. */
  title?: string;
  /** Plain text; line breaks allowed. */
  body: string;
  focus: NoteFocus;
}

/**
 * What a note is about. One level only: `diagramId` names it, and a note never reaches across
 * levels — a trace carries the lit path down through a Nested Block's ports on its own, so a
 * note on a parent lights the right shapes inside its children without naming them.
 *
 * There is no page id here because a diagram id is unique across the whole document (the
 * document is one flat map of diagrams, and validate.ts checks every id against one set), so
 * the page is derivable from `diagramId` with nesting.ts's findDiagramPath.
 */
export interface NoteFocus {
  /** The level the note opens at. */
  diagramId: string;
  /** Shapes and Nested Blocks it concerns. Absent or empty: the note is about the level. */
  nodeIds?: string[];
  /** Lines it concerns. */
  edgeIds?: string[];
}

/** An image of the user's own, carried inside the document (there is no server to keep it). */
export interface ImageAsset {
  mime: "image/png" | "image/jpeg" | "image/gif" | "image/webp" | "image/svg+xml";
  /** The file's bytes, base64, without a `data:` prefix. */
  data: string;
  /** Intrinsic size in pixels, after any shrinking on insert. */
  width: number;
  height: number;
  /** The original file name, shown in the Style tab. */
  name?: string;
}

export interface Diagram {
  id: string;
  title: string;
  nodes: DNode[];
  edges: DEdge[];
  /** CSS color for the page background; omitted means the app's default canvas color. */
  background?: string;
  /**
   * Printable page size in canvas units (CSS px at 96dpi), used to draw page boundaries and to
   * size PDF/print output. Omitted means the canvas stays purely infinite with no page concept,
   * which is the default and what every diagram authored before this existed will have.
   */
  pageSize?: { w: number; h: number };
  /** Omitted means "one implicit default layer" — see model/layers.ts's getLayers(). */
  layers?: Layer[];
  /** Whole-diagram motion — Draw in, one presentation mode (model/motion.ts, D116). Omitted: none. */
  motion?: DiagramMotion;
}

export interface Layer {
  id: string;
  name: string;
  visible: boolean;
  locked: boolean;
}

export type DNode = ShapeNode | NestedNode | GroupNode;

// Style keys (fill, stroke, fontSize, etc.); kept as a loose string map so
// stencil-specific and future keys don't require a model change.
export type StyleMap = Record<string, string | number | boolean>;

export interface RichLabel {
  text: string;
  bold?: boolean;
  italic?: boolean;
  fontSize?: number;
  color?: string;
  align?: "left" | "center" | "right";
}

export interface NodeBase {
  id: string;
  position: { x: number; y: number };
  size: { w: number; h: number };
  rotation?: number;
  z: number;
  style: StyleMap;
  label?: RichLabel;
  /** Omitted means the diagram's first layer — see model/layers.ts's getLayerId(). */
  layerId?: string;
  /** Pulse and Health (model/motion.ts, D116). Omitted: still, exactly as before motion existed. */
  motion?: NodeMotion;
}

export interface ShapeNode extends NodeBase {
  type: "shape";
  /** A stencil id, or `"image"` for a picture of the user's own (see `imageId`). */
  shapeRef: string;
  /** Set only when `shapeRef` is `"image"`: the key of its picture in `DiagramDocument.assets`. */
  imageId?: string;
}

export interface GroupNode extends NodeBase {
  type: "group";
  childIds: string[];
}

export interface NestedNode extends NodeBase {
  type: "nested";
  childDiagramId: string;
  collapsed: {
    icons: string[];
    summary?: string;
  };
  ports: Port[];
  /** One-shot: the miniature stirs a few times on first view, to show the box opens (D116). */
  peek?: true;
}

export interface Port {
  id: string;
  side: "top" | "right" | "bottom" | "left";
  offset: number;
  /**
   * Node inside the child diagram this port maps to. **Optional since formatVersion 2**: a port
   * auto-created by dropping an edge on a nested node's body (rather than on an existing port)
   * starts out *unmapped*, because the child diagram often has nothing to map to yet — the
   * common case is connecting to a nested node the moment it's placed, while it's still empty.
   * An unmapped port is a valid, intentional "waiting to be linked" state, surfaced to the user
   * as an amber ghost link with a loose endpoint inside the child (see nesting/GhostLinks.tsx),
   * not a dangling reference. validate.ts's DANGLING_PORT check skips these deliberately.
   */
  innerNodeId?: string;
  label?: string;
}

/**
 * One end of an edge: attached to a node (`nodeId`, optionally a port or a fixed anchor on it), or
 * — since formatVersion 4 — free, at a `point` on the canvas, as a line drawn from the sidebar's
 * Lines section is until either end is dropped on a shape. Exactly one
 * of `nodeId` and `point` is set; model/edgeEnds.ts reads them, validate.ts enforces it.
 */
export interface EdgeEnd {
  nodeId?: string;
  portId?: string;
  anchor?: { x: number; y: number };
  point?: { x: number; y: number };
}

export interface DEdge {
  id: string;
  source: EdgeEnd;
  target: EdgeEnd;
  waypoints?: { x: number; y: number }[];
  style: StyleMap;
  label?: RichLabel;
  /**
   * Where the label sits, once dragged: `t` of the way along the line
   * (0 at the source, 1 at the target), then `dx`,`dy` off it. Relative to the line, so the label
   * keeps its place as the shapes move. Omitted: the
   * middle of the line, as before.
   */
  labelPosition?: EdgeLabelPosition;
  /** Omitted means the diagram's first layer — see model/layers.ts's getLayerId(). */
  layerId?: string;
  /** Flow, Packets or Throughput along the line (model/motion.ts, D116). Omitted: still. */
  motion?: EdgeMotion;
}

export interface EdgeLabelPosition {
  t: number;
  dx: number;
  dy: number;
}
