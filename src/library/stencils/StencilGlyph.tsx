import { SHADOW_CSS } from "../../canvas/shapeEffects";
import { fitStencilBody } from "./fitBody";

interface StencilGlyphProps {
  svgBody: string;
  raw?: string;
  fill?: string;
  /**
   * Translucency of the *fill* only, leaving the border and the label solid.
   *
   * Distinct from the node's own `opacity`, which fades everything including the text. A Venn
   * diagram is the case that needs the difference: the overlaps have to blend while the outlines
   * and labels stay crisp.
   */
  fillOpacity?: number;
  stroke?: string;
  strokeWidth?: number;
  className?: string;
  // Picker/preview contexts (sidebar, scratchpad, format-panel chips) default to preserving the
  // shape's own proportions — a fixed-size preview slot has no reason to distort it. The one
  // exception is the actual canvas ShapeNode, which passes "none": a placed shape is meant to
  // stretch to fill whatever box the user resizes it to.
  preserveAspectRatio?: string;
  // Outline shapes (Rectangle, Parallelogram, ...) are all authored as a path filling the same
  // square 0-100 viewBox — the canvas is what gives them their real proportions, by stretching
  // that square non-uniformly into the node's actual w×h (see ShapeNode's own
  // preserveAspectRatio="none"). Without this, every such shape's *preview* — square viewBox,
  // "meet" fit, no stretch — looks like its own square silhouette regardless of its intended
  // shape: Rectangle's preview was indistinguishable from Square's. Passing the stencil's own
  // defaultSize.w/h here reproduces the same non-uniform stretch inside the preview (scaling
  // the drawn content around its own center, not the viewBox), so a wide shape reads as wide
  // even inside a square preview slot — matching what actually appears once placed. Icon-style
  // pictograms (Material Symbols) are deliberately excluded by callers, since those are 1:1 by
  // design and stretching one would distort it.
  aspectRatio?: number;
  /**
   * The size the glyph is drawn at, when stretched to a node's box. Keeps the outline one weight
   * all round and rounded corners round (see fitBody.ts); previews derive it from aspectRatio.
   */
  size?: { w: number; h: number };
  /** An outline dash pattern (canvas/shapeEffects.ts); undefined draws it solid. */
  dash?: string;
  /** Draws the shape with a soft drop shadow. */
  shadow?: boolean;
}

// svgBody/raw are static, authored-in-repo markup (see StencilDef) — never user input — so
// dangerouslySetInnerHTML here carries no injection risk.
export function StencilGlyph({
  svgBody,
  raw,
  fill = "#ffffff",
  fillOpacity,
  stroke = "#1e2733",
  strokeWidth = 2,
  className,
  preserveAspectRatio = "xMidYMid meet",
  aspectRatio,
  size,
  dash,
  shadow,
}: StencilGlyphProps) {
  // raw vendor icons carry their own viewBox/colors and are never themed — see StencilDef.
  if (raw) {
    return <div className={className} style={shadow ? { filter: SHADOW_CSS } : undefined} dangerouslySetInnerHTML={{ __html: raw }} />;
  }
  // Scale the drawn content (not the viewBox) around its own center: a ratio > 1 (wider than
  // tall) compresses the Y axis, a ratio < 1 (taller than wide) compresses the X axis — the
  // same non-uniform stretch preserveAspectRatio="none" applies on canvas, reproduced here so
  // it still shows correctly once the outer "meet" fit places it back into a square slot.
  const contentTransform =
    aspectRatio && aspectRatio > 0 && aspectRatio !== 1
      ? `translate(50 50) scale(${aspectRatio > 1 ? 1 : aspectRatio} ${aspectRatio > 1 ? 1 / aspectRatio : 1}) translate(-50 -50)`
      : undefined;
  const fitted =
    size ??
    (aspectRatio && aspectRatio > 0
      ? { w: aspectRatio > 1 ? 100 : 100 * aspectRatio, h: aspectRatio > 1 ? 100 / aspectRatio : 100 }
      : { w: 100, h: 100 });
  return (
    <svg
      viewBox="0 0 100 100"
      className={className}
      preserveAspectRatio={preserveAspectRatio}
      style={shadow ? { filter: SHADOW_CSS, overflow: "visible" } : undefined}
    >
      <g transform={contentTransform}>
        <g
          fill={fill}
          // currentColor is the fill: an original pictogram's line work follows it (D124).
          color={fill}
          fillOpacity={fillOpacity}
          stroke={stroke}
          strokeWidth={strokeWidth}
          strokeDasharray={dash}
          dangerouslySetInnerHTML={{ __html: fitStencilBody(svgBody, fitted.w, fitted.h, { stroke, strokeWidth, headScale: size ? 1 : 2.2 }) }}
        />
      </g>
    </svg>
  );
}
