// Hand-rolled SVG export: walks the model directly into real <rect>/<path>/<text> elements
// (no dependency on html-to-image or similar: a screenshot of the DOM can't carry real
// shapes, text and links into another program).
//
// **An export must look exactly like the canvas.** This file used to claim that and not do it:
// edge geometry, stencil default styles, the Nested Block's contents, fonts and the bounding
// box were each reimplemented here and had drifted from the real renderer. The shared pieces
// now live in canvas/edgeRouting.ts, library/stencils/defaultStyle.ts and
// nesting/miniatureSvg.ts, and this module is only the part that turns them into a standalone
// document. Anything a canvas component and this file could disagree about belongs in a shared
// module, not here: when the two drifted apart, exports drew lines and labels differently from
// the canvas.
import { escapeMarkup as escapeXml, escapeMarkup as q } from "../model/escapeMarkup";
import { edgeDashArray, edgeStrokeWidth, flowClass, flowVars, packetPointAt, packetRadius, packetRestPoint } from "../canvas/motionStyle";
import { frameCss } from "./motionFrameCss";
import { healthBadgeSvg, healthCentre } from "../canvas/healthStatus";
import { lineStepCentre, stepBadgeSvg, stepCentre } from "../canvas/stepGeometry";
import { resolveIconTokens, stillBody } from "../library/stencils/animatedBodies";
import { effectiveOrder } from "../model/presentation";
import { fitStencilBody } from "../library/stencils/fitBody";
import { hasShadow, SHADOW_FILTER_SVG, shapeDash } from "../canvas/shapeEffects";
import {
  captionAbove,
  labelArea,
  labelHangsBelow,
  labelSidePad,
  verticalAlignOf,
  type LabelArea,
  type VerticalAlign,
} from "../canvas/labelLayout";
import { getStencil } from "../library/stencils";
import { getStencilDefaultStyle, stencilBody } from "../library/stencils/defaultStyle";
import { edgeColorLiteral } from "../canvas/edgeColor";
import { isClassicLook } from "../model/look";
import { markerDefs, markerUrl } from "../canvas/arrowheads";
import { defaultLabelColor, labelBackdrop } from "../canvas/labelColor";
import {
  buildEdgePath,
  edgeExtentPoints,
  DEFAULT_EDGE_WIDTH,
  endHandle,
  freeEndPosition,
  normalizeEdgeStyle,
  resolveHandleAnchor,
  type EdgePathInput,
  type NodeBox,
} from "../canvas/edgeRouting";
import { EXPORT_FONT_STACK, loadExportFontCss } from "./exportFonts";
import { buildMiniatureSvg } from "../nesting/miniatureSvg";
import { assetDataUrl, isImageNode } from "../model/assets";
import { imageLabelBox } from "../canvas/imageGeometry";
import type { DEdge, DNode, Diagram, ImageAsset, NestedNode, RichLabel, ShapeNode } from "../model/types";
import { isFreeEnd } from "../model/edgeEnds";
import { edgeShapeOf, shapeEdge } from "../canvas/edgeShapes";

// Matches src/styles/tokens.css — this module can't read CSS custom properties at
// generation time, so the values are duplicated here deliberately.
const INK = "#1E2733";
const MUTED = "#66707D";
const NEST_DEEP = "#4B3BC4";
const NEST_ACCENT = "#6D5AE6";
const NEST_SOFT = "#EEEBFC";
const PANEL = "#FFFFFF";
const WARN = "#B7791F";

// Edges and shapes share one set of dash patterns (canvas/shapeEffects.ts).

/** The stacked-card ghosts behind a nested node's body, from NestedNode.module.css. */
const GHOST_OFFSETS = [
  { d: 9, opacity: 0.5 },
  { d: 4.5, opacity: 0.75 },
];
const NESTED_STACK_OUTSET = Math.max(...GHOST_OFFSETS.map((g) => g.d));

export interface SvgExportOptions {
  /** CSS color, or omit/null for a transparent background. */
  background?: string | null;
  padding?: number;
  /**
   * @font-face CSS to embed, from loadExportFontCss(). Omitted, the SVG still names IBM Plex
   * Sans and falls back to the viewer's system stack — correct, just not identical. Prefer
   * renderDiagramSvg(), which fills this in for you.
   */
  fontCss?: string;
  /**
   * Every diagram in the document, so a Nested Block can draw the live miniature of its child.
   * Without it the block still renders — title, ports and all — just with no thumbnail.
   */
  diagrams?: Record<string, Diagram>;
  /**
   * The document's pictures (D79), so an image node draws its picture — in this SVG and in every
   * export rasterised from it. Without it an image draws as an empty frame.
   */
  assets?: Record<string, ImageAsset>;
  /**
   * Tag each node's group with `data-node-id` and wrap each edge in a `<g data-edge-id>`.
   *
   * Off for real exports, which stay exactly as they were. The render-parity sweep turns it on so
   * it can line every exported element up with the canvas element drawn from the same model node
   * and compare them property by property (tests/e2e/m14-render-parity.spec.ts).
   */
  annotateIds?: boolean;
  /**
   * Draws one moment of the diagram's motion instead of its resting state — a frame of an
   * animated GIF (G1, D131). Omitted, the export is the still picture it always was.
   */
  frame?: MotionFrame;
}

/** One moment of motion, for a frame of a moving picture (G1, D131). */
export interface MotionFrame {
  /** Seconds into the motion. */
  t: number;
  /** Build: the shapes and lines not shown yet. */
  hidden?: Set<string>;
  /** Spotlight: what stays lit; everything else steps back. */
  lit?: { nodes: Set<string>; edges: Set<string> };
  /** Walkthrough: where its dot is, in canvas coordinates. */
  walkDot?: { x: number; y: number };
}

export interface DiagramBounds {
  width: number;
  height: number;
  offsetX: number;
  offsetY: number;
}

const DEFAULT_PADDING = 40;
const EMPTY_SIZE = { width: 240, height: 160 };

/** Roughly how wide a label runs, for bounds only. Plex Sans averages a bit over half its em. */
const AVG_GLYPH_WIDTH_RATIO = 0.58;

export function labelHalfWidth(label: RichLabel): number {
  const longest = Math.max(...label.text.split("\n").map((l) => l.length));
  return (longest * (label.fontSize ?? 12) * AVG_GLYPH_WIDTH_RATIO) / 2;
}

/** Where an edge runs, resolved exactly as the canvas resolves it. */
export function edgePathInput(edge: DEdge, nodeById: Map<string, DNode>, offsetX = 0, offsetY = 0): EdgePathInput | null {
  // A free end (a line from the Lines section) sits at its own point; an attached one needs its node.
  const source = edge.source.nodeId ? nodeById.get(edge.source.nodeId) : undefined;
  const target = edge.target.nodeId ? nodeById.get(edge.target.nodeId) : undefined;
  if ((!source && !isFreeEnd(edge.source)) || (!target && !isFreeEnd(edge.target))) return null;

  const box = (n: DNode): NodeBox => ({
    x: n.position.x + offsetX,
    y: n.position.y + offsetY,
    w: n.size.w,
    h: n.size.h,
  });

  // The handle the model names, resolved the same way React Flow resolves it on the canvas —
  // including the fallback to "top" when it names none.
  const at = (p: { x: number; y: number }) => ({ x: p.x + offsetX, y: p.y + offsetY });
  const attached = (node: DNode | undefined, end: DEdge["source"], handle: unknown) =>
    node ? resolveHandleAnchor(node, box(node), endHandle(end, handle), end.anchor) : null;
  const fromNode = attached(source, edge.source, edge.style.sourceHandle);
  const toNode = attached(target, edge.target, edge.style.targetHandle);
  const fromPoint = fromNode?.point ?? at(edge.source.point!);
  const toPoint = toNode?.point ?? at(edge.target.point!);
  const waypoints = (edge.waypoints ?? []).map(at);
  // A free end leaves toward its neighbour on the line: the first waypoint, or the other end.
  const from = fromNode ?? { point: fromPoint, position: freeEndPosition(fromPoint, waypoints[0] ?? toPoint) };
  const to = toNode ?? { point: toPoint, position: freeEndPosition(toPoint, waypoints[waypoints.length - 1] ?? fromPoint) };

  return {
    sourceX: from.point.x,
    sourceY: from.point.y,
    sourcePosition: from.position,
    targetX: to.point.x,
    targetY: to.point.y,
    targetPosition: to.position,
    waypoints,
    kind: normalizeEdgeStyle(edge.style.edgeStyle),
    ...(edge.labelPosition ? { label: edge.labelPosition } : {}),
  };
}

/**
 * The box the exported document needs.
 *
 * Node boxes alone are not enough, and clipped output was the symptom: an edge anchors *outside*
 * its node (the handle outset), a waypoint can be dragged anywhere, a nested node's stacked
 * ghosts sit 9px past its body, and an edge label sits at the path's midpoint with nothing
 * keeping it inside the shapes.
 */
export function computeDiagramBounds(diagram: Diagram, padding = DEFAULT_PADDING): DiagramBounds {
  if (diagram.nodes.length === 0 && diagram.edges.length === 0) {
    return { width: EMPTY_SIZE.width, height: EMPTY_SIZE.height, offsetX: padding, offsetY: padding };
  }

  const xs: number[] = [];
  const ys: number[] = [];
  const push = (x: number, y: number) => {
    xs.push(x);
    ys.push(y);
  };

  for (const n of diagram.nodes) {
    const outset = n.type === "nested" ? NESTED_STACK_OUTSET : 0;
    push(n.position.x, n.position.y);
    push(n.position.x + n.size.w + outset, n.position.y + n.size.h + outset);
    // An image's label hangs below it, outside the node box; count it or the export crops it.
    if (n.type === "shape" && n.label?.text && labelHangsBelow(n.shapeRef, getStencil(n.shapeRef), n.style)) {
      const size = n.label.fontSize ?? 12;
      const box = imageLabelBox(n.size.h, n.label.text.split("\n").length, size, captionAbove(n.style));
      const cx = n.position.x + n.size.w / 2;
      const half = labelHalfWidth(n.label);
      push(cx - half, n.position.y + box.top);
      push(cx + half, n.position.y + box.bottom);
    } else if (n.type === "shape" && n.label?.text) {
      // A stencil's label area can reach outside the shape (a UML interface names itself above
      // its ball); count the text's own extent there.
      const area = labelArea(getStencil(n.shapeRef), n.size.w, n.size.h, n.style);
      if (area.x < 0 || area.y < 0 || area.x + area.w > n.size.w || area.y + area.h > n.size.h) {
        const half = Math.min(area.w / 2, labelHalfWidth(n.label) + 8);
        const cx = n.position.x + area.x + area.w / 2;
        push(cx - half, n.position.y + area.y);
        push(cx + half, n.position.y + area.y + area.h);
      }
    }
  }

  const nodeById = new Map(diagram.nodes.map((n) => [n.id, n]));
  for (const edge of diagram.edges) {
    const input = edgePathInput(edge, nodeById);
    if (!input) continue;
    for (const p of edgeExtentPoints(input)) push(p.x, p.y);
    if (edge.label?.text) {
      const { labelPos } = buildEdgePath(input);
      const half = labelHalfWidth(edge.label);
      const line = edge.label.fontSize ?? 11;
      push(labelPos.x - half, labelPos.y - line);
      push(labelPos.x + half, labelPos.y + line);
    }
  }

  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const maxX = Math.max(...xs);
  const maxY = Math.max(...ys);
  return {
    width: maxX - minX + padding * 2,
    height: maxY - minY + padding * 2,
    offsetX: padding - minX,
    offsetY: padding - minY,
  };
}


const markerRef = markerUrl;

function fontAttrs(label: { fontSize?: number; bold?: boolean; italic?: boolean }, fallbackSize: number): string {
  return `font-family="${EXPORT_FONT_STACK}" font-size="${q(label.fontSize ?? fallbackSize)}" font-weight="${q(label.bold ? 700 : 400)}" font-style="${q(label.italic ? "italic" : "normal")}"`;
}

/**
 * A node label, one <tspan> per line.
 *
 * The canvas renders labels in a flex box where `\n` really does break the line. A single
 * <text> ran them together, which is what made UML class compartments and C4 elements
 * unreadable in every export.
 */
function renderLabel(
  label: RichLabel,
  area: LabelArea,
  defaultColor: string = INK,
  valign: VerticalAlign = "middle",
): string {
  if (area.vertical) {
    // Laid out in a frame turned a quarter left about the area's centre, as the canvas does it.
    const cx = area.x + area.w / 2;
    const cy = area.y + area.h / 2;
    const turned = { x: cx - area.h / 2, y: cy - area.w / 2, w: area.h, h: area.w };
    // The turn goes on the <text> itself rather than a wrapping group, so the label stays the
    // node's own direct child, where every other label is.
    return renderLabel(label, turned, defaultColor, "middle").replace(/^<text /, `<text transform="rotate(-90 ${q(cx)} ${q(cy)})" `);
  }
  const align = label.align ?? "center";
  const anchor = align === "left" ? "start" : align === "right" ? "end" : "middle";
  // The canvas label pads 6px top and bottom, and 8px each side — less on a narrow box (D139).
  const side = labelSidePad(area.w);
  const x = align === "left" ? area.x + side : align === "right" ? area.x + area.w - side : area.x + area.w / 2;
  const size = label.fontSize ?? 12;
  const lines = label.text.split("\n");
  const lineHeight = size * 1.25;
  const block = (lines.length - 1) * lineHeight;
  const top =
    valign === "top"
      ? area.y + 6 + lineHeight / 2
      : valign === "bottom"
        ? area.y + area.h - 6 - lineHeight / 2 - block
        : area.y + area.h / 2 - block / 2;
  const tspans = lines
    .map((line, i) => `<tspan x="${q(x)}" y="${q(top + i * lineHeight)}">${escapeXml(line)}</tspan>`)
    .join("");
  return `<text text-anchor="${q(anchor)}" dominant-baseline="middle" ${fontAttrs(label, 12)} fill="${q(label.color ?? defaultColor)}">${tspans}</text>`;
}

/**
 * The Nested Block, as the canvas draws it: two ghost cards behind the body, the ⧉ badge and
 * the title, the live miniature of the child (or the author's chosen icon row), the summary,
 * and the port dots — dashed amber while unmapped, exactly like PortHandle.
 *
 * This used to be three rectangles and a summary line, which is why a Nested Block pasted into
 * Word arrived as a blank box.
 */
function renderNestedNode(
  node: NestedNode,
  pos: { x: number; y: number },
  childDiagram?: Diagram,
  assets?: Record<string, ImageAsset>,
): string {
  const { w, h } = node.size;
  const name = node.label?.text || childDiagram?.title || "Nested Block";

  const ghosts = GHOST_OFFSETS.map(
    (g) =>
      `<rect x="${q(g.d)}" y="${q(g.d)}" width="${q(w)}" height="${q(h)}" rx="8" fill="${NEST_SOFT}" stroke="${NEST_ACCENT}" stroke-width="1" opacity="${q(g.opacity)}" />`,
  ).join("");

  // Header band: badge + title, laid out to match NestedNode.module.css's 6px/8px padding.
  const headerY = 6 + 11.5;
  const header =
    `<text x="8" y="${q(headerY)}" font-family="${EXPORT_FONT_STACK}" font-size="12" fill="${NEST_DEEP}">⧉</text>` +
    `<text x="24" y="${q(headerY)}" font-family="${EXPORT_FONT_STACK}" font-size="11.5" font-weight="600" fill="${NEST_DEEP}">${escapeXml(name)}</text>`;

  const summaryH = node.collapsed.summary ? 15 : 0;
  const previewTop = 6 + 20;
  const previewH = Math.max(0, h - previewTop - summaryH - 6);

  let preview = "";
  if (node.collapsed.icons.length > 0) {
    preview = node.collapsed.icons
      .map((ref, i) => {
        const stencil = getStencil(ref);
        if (!stencil || stencil.raw) return "";
        const defaults = getStencilDefaultStyle(stencil);
        return `<g transform="translate(${q(8 + i * 20)} ${q(previewTop + previewH / 2 - 8)}) scale(0.16)" fill="${q(defaults.fill)}" stroke="${q(defaults.stroke)}" stroke-width="${q(defaults.strokeWidth)}">${stencil.svgBody}</g>`;
      })
      .join("");
  } else if (childDiagram) {
    const mini = buildMiniatureSvg(childDiagram, undefined, assets);
    if (mini && previewH > 0) {
      preview = `<svg x="8" y="${q(previewTop)}" width="${q(Math.max(0, w - 16))}" height="${q(previewH)}" viewBox="${q(mini.viewBox)}" preserveAspectRatio="xMidYMid meet">${mini.body}</svg>`;
    }
  }
  if (!preview && previewH > 0) {
    preview = `<text x="${q(w / 2)}" y="${q(previewTop + previewH / 2)}" text-anchor="middle" dominant-baseline="middle" font-family="${EXPORT_FONT_STACK}" font-size="11" fill="${MUTED}">Empty</text>`;
  }

  const summary = node.collapsed.summary
    ? `<text x="8" y="${q(h - 8)}" font-family="${EXPORT_FONT_STACK}" font-size="11" fill="${MUTED}">${escapeXml(node.collapsed.summary)}</text>`
    : "";

  const ports = node.ports
    .map((port) => {
      const along = Math.min(1, Math.max(0, port.offset));
      const cx = port.side === "left" ? 0 : port.side === "right" ? w : w * along;
      const cy = port.side === "top" ? 0 : port.side === "bottom" ? h : h * along;
      const unmapped = port.innerNodeId === undefined;
      const dash = unmapped ? ` stroke-dasharray="2 2"` : "";
      return `<circle cx="${q(cx)}" cy="${q(cy)}" r="4.5" fill="${PANEL}" stroke="${q(unmapped ? WARN : NEST_ACCENT)}" stroke-width="2"${dash} />`;
    })
    .join("");

  return `<g transform="translate(${q(pos.x)},${q(pos.y)})">
${ghosts}
<rect x="0" y="0" width="${q(w)}" height="${q(h)}" rx="8" fill="${PANEL}" stroke="${NEST_DEEP}" stroke-width="1.5" />
${header}
${preview}
${summary}
${ports}
</g>`;
}

/**
 * A picture of the user's own, as the canvas draws it (D79): the image stretched to the node box,
 * an optional border, and the label below — centred, one line per typed line, at the same place
 * canvas/imageGeometry.ts puts it on screen.
 */
function renderImageNode(node: ShapeNode, pos: { x: number; y: number }, asset: ImageAsset | undefined): string {
  const { w, h } = node.size;
  const rotation = node.rotation ?? 0;
  const opacity = (node.style.opacity as number) ?? 1;
  const picture = asset
    ? `<image x="0" y="0" width="${q(w)}" height="${q(h)}" href="${q(assetDataUrl(asset))}" preserveAspectRatio="none" />`
    : `<rect x="0.5" y="0.5" width="${q(w - 1)}" height="${q(h - 1)}" fill="none" stroke="${MUTED}" stroke-dasharray="4 3" />`;
  const stroke = node.style.stroke as string | undefined;
  const border =
    stroke && stroke !== "none"
      ? (() => {
          const sw = (node.style.strokeWidth as number | undefined) ?? 1;
          return `<rect x="${q(sw / 2)}" y="${q(sw / 2)}" width="${q(w - sw)}" height="${q(h - sw)}" fill="none" stroke="${q(stroke)}" stroke-width="${q(sw)}" />`;
        })()
      : "";
  const label = labelBelowMarkup(node.label, w, h, captionAbove(node.style));
  return `<g transform="translate(${q(pos.x)},${q(pos.y)}) rotate(${q(rotation)},${q(w / 2)},${q(h / 2)})" opacity="${q(opacity)}">
${picture}
${border}
${label}
</g>`;
}

/** A caption hung below (or above) a picture or an icon, centred, one line per typed line. */
function labelBelowMarkup(label: RichLabel | undefined, w: number, h: number, above = false): string {
  if (!label?.text) return "";
  const size = label.fontSize ?? 12;
  const lines = label.text.split("\n");
  const box = imageLabelBox(h, lines.length, size, above);
  const tspans = lines
    .map((line, i) => `<tspan x="${q(w / 2)}" y="${q(box.top + (i + 0.5) * box.lineHeight)}">${escapeXml(line)}</tspan>`)
    .join("");
  return `<text text-anchor="middle" dominant-baseline="middle" ${fontAttrs(label, 12)} fill="${q(label.color ?? INK)}">${tspans}</text>`;
}

function renderShapeNode(node: ShapeNode, pos: { x: number; y: number }, moving = false): string {
  const { w, h } = node.size;
  const rotation = node.rotation ?? 0;
  const stencil = getStencil(node.shapeRef);
  // The canvas resolves an unset fill/stroke/width through getStencilDefaultStyle, so a
  // pictogram icon renders as a flat silhouette and an outline shape gets a 1px border. This
  // used to hardcode white/ink/2, and therefore exported every icon as an outlined blob and
  // every plain shape with double-weight lines.
  const classic = isClassicLook(node.style);
  const defaults = stencil ? getStencilDefaultStyle(stencil, classic) : { fill: "#ffffff", stroke: INK, strokeWidth: 1 };
  const fill = (node.style.fill as string) ?? defaults.fill;
  const stroke = (node.style.stroke as string) ?? defaults.stroke;
  const strokeWidth = (node.style.strokeWidth as number) ?? defaults.strokeWidth;
  const opacity = (node.style.opacity as number) ?? 1;
  // Fill-only translucency, separate from the node's own opacity — see StencilGlyph.
  const fillOpacity = node.style.fillOpacity as number | undefined;
  // Raw vendor icons (see StencilDef) carry their own viewBox and colors — nest them as a
  // plain sized <svg> instead of the scale(w/100,h/100) transform used for our 0-0-100-100
  // authored shapes, and skip the fill/stroke wrapper since they're never themed.
  const dash = shapeDash(node.style);
  const glyph = stencil?.raw
    ? `<svg x="0" y="0" width="${q(w)}" height="${q(h)}">${stencil.raw}</svg>`
    : `<g transform="scale(${q(w / 100)},${q(h / 100)})" fill="${q(fill)}"${stencil?.pictogram ? ` color="${q(fill)}"` : ""}${fillOpacity === undefined ? "" : ` fill-opacity="${q(fillOpacity)}"`} stroke="${q(stroke)}" stroke-width="${q(strokeWidth)}"${dash ? ` stroke-dasharray="${dash}"` : ""}>${movingBody(fitStencilBody(stencil ? (moving ? stencilBody(stencil, classic) : stillBody(stencilBody(stencil, classic))) : "", w, h, { stroke, strokeWidth }), moving && stencil?.animated !== undefined)}</g>`;
  const drawn = hasShadow(node.style) ? `<g filter="url(#nd-shadow)">${glyph}</g>` : glyph;
  // Same rule as the canvas, from the same module: contrast with the fill behind the label (D78).
  const labelDefault = defaultLabelColor(labelBackdrop(node.style.fill, stencil, classic), fillOpacity) ?? INK;
  const label = !node.label?.text
    ? ""
    : labelHangsBelow(node.shapeRef, stencil, node.style)
      ? labelBelowMarkup(node.label, w, h, captionAbove(node.style))
      : renderLabel(node.label, labelArea(stencil, w, h, node.style), labelDefault, verticalAlignOf(node.style));
  return `<g transform="translate(${q(pos.x)},${q(pos.y)}) rotate(${q(rotation)},${q(w / 2)},${q(h / 2)})" opacity="${q(opacity)}">
${drawn}
${label}
</g>`;
}

function renderNode(node: DNode, offsetX: number, offsetY: number, options: SvgExportOptions): string {
  const pos = { x: node.position.x + offsetX, y: node.position.y + offsetY };
  // A Health badge rests as itself, on top of the shape (A4, D120); in a frame, it blinks.
  let health = node.motion?.health ? healthBadgeSvg(node.motion.health, healthCentre({ x: pos.x, y: pos.y, w: node.size.w })) : "";
  if (options.frame && health && node.motion?.health !== "healthy") health = `<g class="nd-anim nd-health-blink" data-health="${q(node.motion!.health)}">${health}</g>`;
  // Pulse, in a frame: the glow, and the ripple, behind the shape (D116).
  const pulse = options.frame && node.motion?.pulse ? pulseSvg(node, pos, node.motion.pulse.ripple === true) : "";
  if (pulse) return pulse + renderNodeBody(node, pos, options) + health;
  return renderNodeBody(node, pos, options) + health;
}

/**
 * Pulse in a frame (D116): the glow and the ripple on the shape's own outline, as the canvas draws
 * them (D130) — or round its box, for a Nested Block, a vendor icon or a picture.
 */
function pulseSvg(node: DNode, pos: { x: number; y: number }, ripple: boolean): string {
  const { w, h } = node.size;
  const stencil = node.type === "shape" ? getStencil(node.shapeRef) : undefined;
  const outline =
    stencil && !stencil.raw
      ? fitStencilBody(stillBody(stencilBody(stencil, isClassicLook(node.style))), w, h)
      : `<rect x="-3" y="-3" width="${q(w + 6)}" height="${q(h + 6)}" rx="10" />`;
  const scale = stencil && !stencil.raw ? ` scale(${q(w / 100)},${q(h / 100)})` : "";
  const at = `translate(${q(pos.x)},${q(pos.y)}) rotate(${q(node.rotation ?? 0)},${q(w / 2)},${q(h / 2)})`;
  return (
    `<g transform="${q(at)}"><g class="nd-anim nd-glow nd-outline-svg nd-outline-glow" transform="${q(scale.trim() || "scale(1)")}" filter="url(#nd-glow-blur)">${outline}</g>` +
    // The ripple's own scale is a CSS transform, which would replace an SVG one on the same element.
    (ripple ? `<g transform="${q(scale.trim() || "scale(1)")}"><g class="nd-anim nd-ripple nd-outline-svg">${outline}</g></g>` : "") +
    `</g>`
  );
}

function renderNodeBody(node: DNode, pos: { x: number; y: number }, options: SvgExportOptions): string {
  const health = "";
  if (node.type === "nested") return renderNestedNode(node, pos, options.diagrams?.[node.childDiagramId], options.assets) + health;
  // A group's frame is invisible on the canvas (GroupNode.module.css: no border, no background),
  // so the export draws nothing for it either; its children render as ordinary nodes.
  if (node.type === "group") return "";
  if (isImageNode(node)) return renderImageNode(node, pos, options.assets?.[node.imageId]) + health;
  return renderShapeNode(node, pos, options.frame !== undefined) + health;
}

/**
 * An edge's line, and its label separately: the canvas draws edge labels above every shape, so
 * the export lays them down after the nodes rather than letting a shape cover one.
 */
function renderEdge(
  edge: DEdge,
  nodeById: Map<string, DNode>,
  offsetX: number,
  offsetY: number,
  pageColor = "#ffffff",
  frame?: MotionFrame,
): { line: string; label: string } {
  const input = edgePathInput(edge, nodeById, offsetX, offsetY);
  if (!input) return { line: "", label: "" };

  const { path, labelPos } = buildEdgePath(input);

  // A Flow line rests as its dashes, standing still (D116): the same pattern the canvas marches.
  const dashArray = edgeDashArray(edge);
  const markerStart = markerRef(edge.style.startArrow);
  const markerEnd = markerRef(edge.style.endArrow);
  const stroke = edgeColorLiteral(edge.style);
  // Throughput rests as its weight (A3, D119).
  const strokeWidth = edgeStrokeWidth(edge, (edge.style.strokeWidth as number) ?? DEFAULT_EDGE_WIDTH);

  let markup: string;
  const shape = edgeShapeOf(edge.style);
  // A wavy line is an ordinary stroke along a different path.
  const linePath = shape === "wavy" ? shapeEdge(input, shape, strokeWidth, { start: false, end: false }).path : path;
  if (shape === "double" || shape === "arrow") {
    // A double line or block arrow: a wide stroke with the page colour down its middle, drawn by
    // the same module the canvas uses (canvas/edgeShapes.ts).
    const shaped = shapeEdge(input, shape, strokeWidth, {
      start: (edge.style.startArrow ?? "none") !== "none",
      end: (edge.style.endArrow ?? "none") !== "none",
    });
    markup =
      `<path d="${q(shaped.path)}" fill="none" stroke="${q(stroke)}" stroke-width="${q(shaped.outer)}"${dashArray ? ` stroke-dasharray="${q(dashArray)}"` : ""} />` +
      `<path d="${q(shaped.path)}" fill="none" stroke="${q(pageColor)}" stroke-width="${q(shaped.inner)}" />` +
      shaped.heads.map((d) => `<path d="${q(d)}" fill="${q(pageColor)}" stroke="${q(stroke)}" stroke-width="${q(strokeWidth)}" stroke-linejoin="round" />`).join("");
  } else {
    markup = `<path d="${q(linePath)}" fill="none" stroke="${q(stroke)}" stroke-width="${q(strokeWidth)}"`;
    if (dashArray) markup += ` stroke-dasharray="${q(dashArray)}"`;
    // In a frame, Flow and Throughput march as the canvas does, by the same rule (G1, D131).
    const flow = frame ? flowVars(edge) : undefined;
    if (flow && flowClass(edge)) markup += ` class="${q(flowClass(edge))}" style="${Object.entries(flow).map(([k, v]) => `${q(k)}:${q(v)}`).join(";")}"`;
    if (markerStart) markup += ` marker-start="${q(markerStart)}"`;
    if (markerEnd) markup += ` marker-end="${q(markerEnd)}"`;
    markup += " />";
  }
  // Packets rest as one dot, part of the way along in the direction it travels (A3, D119).
  if (edge.motion?.kind === "packets") {
    const at = frame ? packetPointAt(linePath, edge, frame.t) : packetRestPoint(linePath, edge);
    if (at) markup += `<circle cx="${q(Math.round(at.x * 10) / 10)}" cy="${q(Math.round(at.y * 10) / 10)}" r="${q(packetRadius(strokeWidth))}" fill="${q(stroke)}" />`;
  }

  let labelMarkup = "";
  if (edge.label?.text) {
    const label = edge.label;
    const size = label.fontSize ?? 11;
    const half = labelHalfWidth(label);
    // The canvas draws an edge label as a pill over the line so the stroke doesn't run through
    // the text (DiagramEdge.module.css's .labelPill). Same here, sized from the text.
    labelMarkup =
      `<rect x="${q(labelPos.x - half - 3)}" y="${q(labelPos.y - size * 0.8)}" width="${q(half * 2 + 6)}" height="${q(size * 1.6)}" rx="3" fill="${PANEL}" opacity="0.92" />` +
      `<text x="${q(labelPos.x)}" y="${q(labelPos.y)}" text-anchor="middle" dominant-baseline="middle" ${fontAttrs(label, 11)} fill="${q(label.color ?? INK)}">${escapeXml(label.text)}</text>`;
  }

  return { line: markup, label: labelMarkup };
}

// Shared verbatim with the canvas, so an exported SVG cannot draw a different arrowhead
// from the one on screen — or, as before, silently draw none at all for a newer kind.
const MARKER_DEFS = markerDefs();

export function diagramToSvg(diagram: Diagram, options: SvgExportOptions = {}): string {
  const { width, height, offsetX, offsetY } = computeDiagramBounds(diagram, options.padding);
  const nodeById = new Map(diagram.nodes.map((n) => [n.id, n]));

  const backgroundRect =
    options.background != null ? `<rect x="0" y="0" width="${q(width)}" height="${q(height)}" fill="${q(options.background)}" />` : "";

  const pageColor = options.background ?? diagram.background ?? "#ffffff";
  const frame = options.frame;
  const edgeParts = diagram.edges.map((e) => ({ id: e.id, ...renderEdge(e, nodeById, offsetX, offsetY, pageColor, frame) }));
  const edgeMarkup = edgeParts
    .map(({ id, line }) => staged(id, "edge", frame, options.annotateIds && line ? `<g data-edge-id="${escapeXml(id)}">${line}</g>` : line))
    .join("\n");
  const edgeLabelMarkup = edgeParts
    .filter((p) => p.label)
    .map(({ id, label }) => staged(id, "edge", frame, options.annotateIds ? `<g data-edge-label-id="${escapeXml(id)}">${label}</g>` : label))
    .join("\n");
  const nodeMarkup = [...diagram.nodes]
    .sort((a, b) => a.z - b.z)
    .map((n) => {
      const markup = renderNode(n, offsetX, offsetY, options);
      // Every node renderer opens with its own <g>, so the id goes on that rather than on a
      // wrapper, which would change the structure the sweep reads.
      return staged(n.id, "node", frame, options.annotateIds && markup ? markup.replace(/^<g /, `<g data-node-id="${escapeXml(n.id)}" `) : markup);
    })
    .join("\n");

  const fontStyle = options.fontCss ? `<style>${q(options.fontCss)}</style>` : "";
  // A frame carries the canvas's own animation rules, paused at its moment (G1, D131).
  const motionStyle = frame ? `<style><![CDATA[${frameCss(frame.t)}]]></style>${GLOW_BLUR}` : "";
  const walkDot = frame?.walkDot
    ? `<circle cx="${q(Math.round((frame.walkDot.x + offsetX) * 10) / 10)}" cy="${q(Math.round((frame.walkDot.y + offsetY) * 10) / 10)}" r="7" fill="${NEST_ACCENT}" stroke="#ffffff" stroke-width="2" />`
    : "";
  const stepMarkup = walkthroughBadges(diagram, nodeById, offsetX, offsetY);

  // The animated icons' accents are theme tokens on screen; a picture gets their colours (D124).
  return resolveIconTokens([
    `<svg xmlns="http://www.w3.org/2000/svg" width="${q(width)}" height="${q(height)}" viewBox="0 0 ${q(width)} ${q(height)}">`,
    `<defs>${fontStyle}${motionStyle}${MARKER_DEFS}${SHADOW_FILTER_SVG}</defs>`,
    backgroundRect,
    edgeMarkup,
    walkDot,
    nodeMarkup,
    edgeLabelMarkup,
    stepMarkup,
    "</svg>",
  ]
    .filter(Boolean)
    .join("\n"));
}

/** Pulse's glow in a frame: the canvas blurs it 3px. */
const GLOW_BLUR = `<filter id="nd-glow-blur" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="3" /></filter>`;

/**
 * A node or line as a frame shows it (G1, D131): left out while Build has not reached it, stepped
 * back while Spotlight is elsewhere — as the canvas dims it. Untouched outside a frame.
 */
function staged(id: string, kind: "node" | "edge", frame: MotionFrame | undefined, markup: string): string {
  if (!frame || !markup) return markup;
  if (frame.hidden?.has(id)) return "";
  if (frame.lit) {
    const on = kind === "node" ? frame.lit.nodes.has(id) : frame.lit.edges.has(id);
    if (!on) return `<g opacity="${q(kind === "node" ? 0.15 : 0.1)}">${markup}</g>`;
  }
  return markup;
}

/**
 * Walkthrough rests as its numbered steps (A6, D123), on top of everything, where the canvas puts
 * them. Build and Spotlight rest as the complete, undimmed diagram, so they add nothing here.
 */
function walkthroughBadges(diagram: Diagram, nodeById: Map<string, DNode>, offsetX: number, offsetY: number): string {
  if (diagram.motion?.presentation?.mode !== "walkthrough") return "";
  return effectiveOrder(diagram)
    .map((id, i) => {
      const node = nodeById.get(id);
      if (node) return stepBadgeSvg(i + 1, stepCentre({ x: node.position.x + offsetX, y: node.position.y + offsetY }), EXPORT_FONT_STACK);
      const edge = diagram.edges.find((e) => e.id === id);
      const input = edge && edgePathInput(edge, nodeById, offsetX, offsetY);
      if (!edge || !input) return "";
      return stepBadgeSvg(i + 1, lineStepCentre(buildEdgePath(input).midPos, !!edge.label?.text), EXPORT_FONT_STACK);
    })
    .join("");
}

/**
 * The export entry point every consumer should use: the same SVG, with IBM Plex Sans embedded.
 *
 * Async only because the font is fetched and base64'd on first use (and cached after), which
 * keeps ~60 KB of woff2 out of the main bundle for everyone who never exports. `diagramToSvg`
 * stays synchronous underneath it for tests and for callers that already hold the font CSS.
 */
export async function renderDiagramSvg(diagram: Diagram, options: SvgExportOptions = {}): Promise<string> {
  return diagramToSvg(diagram, { ...options, fontCss: options.fontCss ?? (await loadExportFontCss()) });
}

/**
 * A moving icon in a frame gets its own 0..100 viewport, as each canvas glyph is its own <svg>:
 * its rules turn parts about `50px 50px` of the view box, which must be the icon's, not the page's.
 */
function movingBody(body: string, own: boolean): string {
  return own ? `<svg width="100" height="100" viewBox="0 0 100 100" overflow="visible">${body}</svg>` : body;
}
