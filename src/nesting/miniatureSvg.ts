// The live thumbnail of a child diagram, as pure SVG markup.
//
// Extracted from NestedMiniature.tsx so an export can draw the *same* thumbnail the canvas
// draws. Before this, svgExport's nested node was three empty rectangles and a summary line —
// no title, no miniature, no ports — so a Nested Block pasted into Word looked like a blank
// box (CLAUDE_HISTORY.md D67).
//
// Colours are parameters rather than CSS classes because an exported SVG is read outside the
// app, where no stylesheet and no custom properties exist.
import { fitStencilBody } from "../library/stencils/fitBody";
import { stillBody } from "../library/stencils/animatedBodies";
import { getStencil } from "../library/stencils";
import { getStencilDefaultStyle, stencilBody } from "../library/stencils/defaultStyle";
import { isClassicLook } from "../model/look";
import { assetDataUrl, isImageNode } from "../model/assets";
import type { Diagram, DNode, ImageAsset } from "../model/types";

const PAD = 12;

export interface MiniatureColors {
  edge: string;
  tile: string;
  tileStroke: string;
  nestedStroke: string;
  nestedFill: string;
}

/** The on-canvas palette, resolved to literals. Mirrors NestedMiniature.module.css. */
export const MINIATURE_COLORS: MiniatureColors = {
  edge: "#B4BAC4",
  tile: "#FFFFFF",
  tileStroke: "#98A1AD",
  nestedStroke: "#6D5AE6",
  nestedFill: "#EEEBFC",
};

export interface MiniatureSvg {
  viewBox: string;
  /** The `<svg>` element's children, as markup. */
  body: string;
}

function bounds(nodes: DNode[], points: { x: number; y: number }[] = []) {
  const xs = [...nodes.flatMap((n) => [n.position.x, n.position.x + n.size.w]), ...points.map((p) => p.x)];
  const ys = [...nodes.flatMap((n) => [n.position.y, n.position.y + n.size.h]), ...points.map((p) => p.y)];
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  return { minX, minY, w: Math.max(1, Math.max(...xs) - minX), h: Math.max(1, Math.max(...ys) - minY) };
}

/**
 * Builds the miniature, or null when there is nothing inside to draw.
 *
 * `useClasses` picks how the pieces are styled: the React component passes its CSS module class
 * names so the thumbnail still follows the app's theme on screen, while an export passes none
 * and gets literal colours baked in.
 */
export function buildMiniatureSvg(
  diagram: Diagram,
  classes?: { edge: string; tile: string; nestedBox: string },
  /** The document's pictures, so an image inside the child shows in its parent's thumbnail. */
  assets?: Record<string, ImageAsset>,
): MiniatureSvg | null {
  // Group frames are skipped: they're invisible containers on the real canvas, and including
  // them would inflate the bounds without drawing anything the viewer recognises.
  const nodes = diagram.nodes.filter((n) => n.type !== "group");
  // A line's free ends are part of the picture too: a child holding only lines is not empty.
  const freePoints = diagram.edges.flatMap((e) => [e.source.point, e.target.point]).filter((p): p is { x: number; y: number } => !!p);
  if (nodes.length === 0 && freePoints.length === 0) return null;

  const b = bounds(nodes, freePoints);
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const center = (n: DNode) => ({ x: n.position.x + n.size.w / 2, y: n.position.y + n.size.h / 2 });
  const c = MINIATURE_COLORS;

  const edgeAttrs = classes
    ? `class="${classes.edge}"`
    : `stroke="${c.edge}" stroke-width="1.5" fill="none"`;
  const tileAttrs = classes ? `class="${classes.tile}"` : `fill="${c.tile}" stroke="${c.tileStroke}" stroke-width="1.5"`;
  const nestedAttrs = classes
    ? `class="${classes.nestedBox}"`
    : `fill="${c.nestedFill}" stroke="${c.nestedStroke}" stroke-width="1.5"`;

  const parts: string[] = [];

  for (const e of diagram.edges) {
    // A free end (a line from the Lines section) is drawn at its own point.
    const s = e.source.nodeId ? byId.get(e.source.nodeId) : undefined;
    const t = e.target.nodeId ? byId.get(e.target.nodeId) : undefined;
    const a = s ? center(s) : e.source.point;
    const z = t ? center(t) : e.target.point;
    if (!a || !z) continue;
    // Straight centre-to-centre regardless of the edge's real routing: at thumbnail scale the
    // difference is a pixel or two, and it avoids re-deriving waypoint geometry here.
    parts.push(
      `<line x1="${a.x}" y1="${a.y}" x2="${z.x}" y2="${z.y}" ${edgeAttrs} vector-effect="non-scaling-stroke" />`,
    );
  }

  for (const n of nodes) {
    if (n.type === "nested") {
      parts.push(
        `<rect x="${n.position.x}" y="${n.position.y}" width="${n.size.w}" height="${n.size.h}" rx="6" ${nestedAttrs} vector-effect="non-scaling-stroke" />`,
      );
      continue;
    }

    // A picture of the user's own draws as itself, so a logo inside a nested diagram shows on its
    // box (D79). The href is a data: URL built from a validated asset — nothing is fetched.
    if (isImageNode(n)) {
      const asset = assets?.[n.imageId];
      parts.push(
        asset
          ? `<image x="${n.position.x}" y="${n.position.y}" width="${n.size.w}" height="${n.size.h}" href="${assetDataUrl(asset)}" preserveAspectRatio="none" />`
          : `<rect x="${n.position.x}" y="${n.position.y}" width="${n.size.w}" height="${n.size.h}" rx="3" ${tileAttrs} vector-effect="non-scaling-stroke" />`,
      );
      continue;
    }

    const stencil = getStencil(n.shapeRef);

    // Vendor icon packs (Azure/AWS/GCP) carry their own full <svg> with its own viewBox, so a
    // <g transform> cannot re-anchor them — but a *nested* <svg> can, because x/y/width/height
    // on it establish a new viewport the inner viewBox scales into. That is what ShapeNode and
    // svgExport already do for these icons.
    //
    // This used to fall through to the plain tile below, which made a cloud architecture's
    // thumbnail a grid of empty rectangles — worst exactly where the miniature earns its keep,
    // since an Azure landing zone's spokes are Nested Blocks full of vendor icons.
    if (stencil?.raw) {
      parts.push(
        `<svg x="${n.position.x}" y="${n.position.y}" width="${n.size.w}" height="${n.size.h}" overflow="visible">${stencil.raw}</svg>`,
      );
      continue;
    }

    // An unresolved shapeRef still stands in as a tile: better an honest placeholder than
    // nothing at all where a shape should be.
    if (!stencil) {
      parts.push(
        `<rect x="${n.position.x}" y="${n.position.y}" width="${n.size.w}" height="${n.size.h}" rx="3" ${tileAttrs} vector-effect="non-scaling-stroke" />`,
      );
      continue;
    }

    const classic = isClassicLook(n.style);
    const defaults = getStencilDefaultStyle(stencil, classic);
    const fill = (n.style.fill as string) ?? defaults.fill;
    const stroke = (n.style.stroke as string) ?? defaults.stroke;
    const fillOpacity = n.style.fillOpacity as number | undefined;
    parts.push(
      // svgBody is authored against a fixed 0-100 box, so this maps it onto the node's real
      // position and size — the same square-to-rect stretch ShapeNode applies.
      // An animated icon stands still in a miniature (D124): only the open level moves.
      `<g transform="translate(${n.position.x} ${n.position.y}) scale(${n.size.w / 100} ${n.size.h / 100})" fill="${fill}"${stencil.pictogram ? ` color="${fill}"` : ""}${fillOpacity === undefined ? "" : ` fill-opacity="${fillOpacity}"`} stroke="${stroke}" stroke-width="${defaults.strokeWidth}">${fitStencilBody(stillBody(stencilBody(stencil, classic)), n.size.w, n.size.h, { stroke, strokeWidth: defaults.strokeWidth })}</g>`,
    );
  }

  return {
    viewBox: `${b.minX - PAD} ${b.minY - PAD} ${b.w + PAD * 2} ${b.h + PAD * 2}`,
    body: parts.join(""),
  };
}
