// A stencil body fitted to the box it is drawn in.
//
// Bodies are authored in a 0..100 square and stretched to the node's real size, which distorts
// two things a viewer reads as "badly drawn":
//   - the outline: a 2px stroke on a 240×80 box came out 4.8px on the sides and 1.6px top and
//     bottom; and
//   - rounded corners: rx="12" became 29×10px ellipses, squashed flat on wide boxes.
// Every element whose stroke follows the shape's own setting gets a non-scaling stroke, so the
// outline is the same weight all round; elements that set their own stroke-width keep it relative
// to the body (the BPMN end event's thick ring is drawn that way on purpose). Rounded rectangles
// get radii pre-divided by the stretch, so their corners stay circular.
//
// Canvas, exports and miniatures all draw through this, so they cannot drift apart.

import { escapeMarkup as q } from "../../model/escapeMarkup";
import { expandLines, type LinePaint } from "./lineBody";

const STROKED = /<(rect|circle|ellipse|path|polygon|polyline|line)\b([^>]*?)(\/?)>/gi;

function attr(attrs: string, name: string): number | undefined {
  const m = new RegExp(`\\b${name}="([-\\d.]+)"`).exec(attrs);
  return m ? Number(m[1]) : undefined;
}

function withAttr(attrs: string, name: string, value: string): string {
  const re = new RegExp(`\\s${name}="[^"]*"`);
  return re.test(attrs) ? attrs.replace(re, ` ${name}="${q(value)}"`) : `${attrs} ${name}="${q(value)}"`;
}

const round = (n: number) => String(Math.round(n * 1000) / 1000);

const DEFAULT_PAINT: LinePaint = { stroke: "#1e2733", strokeWidth: 1 };

/**
 * `svgBody` (authored in 0..100) ready to be drawn stretched to `w`×`h`. `paint` is the stroke
 * the shape is drawn with, which a line stencil's arrowheads are filled with (lineBody.ts).
 */
export function fitStencilBody(svgBody: string, w: number, h: number, paint: LinePaint = DEFAULT_PAINT): string {
  const sx = w > 0 ? w / 100 : 1;
  const sy = h > 0 ? h / 100 : 1;
  return expandLines(svgBody, w, h, paint).replace(STROKED, (whole, tag: string, attrs: string, selfClose: string) => {
    let out = attrs;
    if (!/\bstroke-width=/.test(out) && !/\bvector-effect=/.test(out)) {
      out = `${out} vector-effect="non-scaling-stroke"`;
    }
    if (tag.toLowerCase() === "rect") {
      // A rectangle drawn edge to edge (x=1, width=98) is inset by 1% of the box: a pixel on a
      // normal shape, but 14px on a 1400px container, which put its own title outside it. Keep
      // the inset at one pixel whatever the size.
      const x = attr(out, "x");
      const y = attr(out, "y");
      const rw = attr(out, "width");
      const rh = attr(out, "height");
      if (x !== undefined && rw !== undefined && x <= 2 && x + rw >= 98 && sx > 1) {
        out = withAttr(withAttr(out, "x", round(1 / sx)), "width", round(100 - 2 / sx));
      }
      if (y !== undefined && rh !== undefined && y <= 2 && y + rh >= 98 && sy > 1) {
        out = withAttr(withAttr(out, "y", round(1 / sy)), "height", round(100 - 2 / sy));
      }
    }
    if (tag.toLowerCase() === "rect" && sx !== sy) {
      const rx = attr(out, "rx");
      const ry = attr(out, "ry");
      const r = rx ?? ry;
      if (r !== undefined && r > 0) {
        // The radius the author drew, measured against the short side, kept round.
        const screen = Math.min((rx ?? r) * sx, (ry ?? r) * sy);
        out = withAttr(withAttr(out, "rx", round(screen / sx)), "ry", round(screen / sy));
      }
    }
    return out === attrs ? whole : `<${tag}${out}${selfClose}>`;
  });
}
