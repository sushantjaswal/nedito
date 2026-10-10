import { memo } from "react";
import { StencilGlyph } from "../library/stencils/StencilGlyph";

/**
 * A shape's own outline, drawn over or behind it in the accent (D130): the selection, a trace's
 * focus, Pulse's glow and its ripple follow the shape — a diamond is outlined as a diamond, not
 * as the box it sits in. Paint comes from CSS (styles/motion.css, ShapeNode.module.css), which
 * outranks a body's own colours, so a pictogram's filled parts outline too.
 */
export const ShapeHalo = memo(function ShapeHalo({ body, size, className }: { body: string; size: { w: number; h: number }; className: string }) {
  return (
    <span className={`nd-outline ${className}`} aria-hidden="true">
      <StencilGlyph svgBody={body} fill="none" stroke="var(--nd-color-nest-accent)" strokeWidth={2} preserveAspectRatio="none" size={size} />
    </span>
  );
});
