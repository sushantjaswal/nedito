import type { StencilDef } from "./types";

// Material Symbols-sourced pictogram shapes (see general.ts/misc.ts/arrows.ts/network.ts/
// business.ts header comments) are authored as a single filled compound path wrapped in a
// per-icon coordinate-mapping `<g transform="matrix(...)">` — hand-drawn outline shapes
// (rect/ellipse/polygon/path primitives meant to hold a stroke + fillable interior, like a
// flowchart box) never use that wrapper. Detecting it lets every StencilGlyph consumer pick a
// sensible default appearance without hand-tagging 150+ individual shape entries.
export function isIconStyleStencil(stencil: StencilDef): boolean {
  return stencil.pictogram === true || stencil.svgBody.includes('<g transform="matrix(');
}

export interface StencilDefaultStyle {
  fill: string;
  stroke: string;
  strokeWidth: number;
}

// Pictogram icons render as a flat, single-color silhouette (solid fill, no border — a stroke
// traced around Material Symbols' intricate compound paths turns fine detail into a blobby
// mess). Outline shapes keep the original draw.io-style default: white fill with a dark 1px
// border, so they read as an empty box ready to hold text. Both the sidebar picker and the
// canvas node fall back to this when the node's own style doesn't set fill/stroke explicitly —
// keeping the two in sync until the user recolors the shape themselves.
//
// strokeWidth is 1, not 2: a newly-placed shape's Style > Line field should read "1" by
// default (user feedback — the original 2px default line looked heavier than intended).
//
// Values here are literal hex, not var(--nd-color-ink): this is the one function export code
// could safely read a concrete color from, and it's what the Fill/Line popovers' <input type="color">
// swatches use (a native color input rejects a var() value outright). Live DOM rendering
// (StencilGlyph in the sidebar/canvas/Favorites/nested-format-panel) wants a theme-aware icon
// fill instead — use getStencilRenderFill() for that, not this fill value directly.
//
// R6 gave new outline shapes Nedito's own look — a faint cool tint and a
// soft slate outline — while anything marked `look: "classic"` (everything made before it, and
// every template; see model/look.ts) keeps the white and ink it was drawn with. `classic` picks the
// table. Widths never change, and a stencil with its own colour (a yellow Note, a BPMN pool) keeps
// it in both looks: only the generic white-and-ink default moved.
export const CLASSIC_SHAPE_FILL = "#ffffff";
export const CLASSIC_SHAPE_STROKE = "#1e2733";
// White, as before: a tint was tried and dropped in review — it added nothing over white.
export const SHAPE_FILL = "#ffffff";
// Black (the ink), as before: the slate outline was dropped in review in favour of black.
export const SHAPE_STROKE = "#1e2733";

export function getStencilDefaultStyle(stencil: StencilDef, classic = false): StencilDefaultStyle {
  if (isIconStyleStencil(stencil)) {
    return { fill: "#1e2733", stroke: "none", strokeWidth: 0 };
  }
  if (classic || stencil.defaultFill) {
    return { fill: stencil.defaultFill ?? CLASSIC_SHAPE_FILL, stroke: CLASSIC_SHAPE_STROKE, strokeWidth: 1 };
  }
  return { fill: SHAPE_FILL, stroke: SHAPE_STROKE, strokeWidth: 1 };
}

/**
 * The style a newly placed shape starts with (R6, D95): its stencil's own defaults, plus a
 * shadow on outline shapes — Nedito's look, asked for in review. Written into the shape rather
 * than resolved at draw time, so nothing already drawn can gain one, and the Shadow control shows
 * it on. Pictograms, vendor icons and lines are left without: a shadow under a silhouette or a
 * line reads as a smudge.
 */
export function newShapeStyle(stencil: StencilDef | undefined): Record<string, string | number | boolean> {
  const style = { ...stencil?.defaultStyle };
  if (stencil && !stencil.raw && !stencil.line && !isIconStyleStencil(stencil)) style.shadow = true;
  return style;
}

/** The body a stencil is drawn with: its own-look variant (R6) where it has one, unless classic. */
export function stencilBody(stencil: StencilDef, classic = false): string {
  return !classic && stencil.lookBody ? stencil.lookBody : stencil.svgBody;
}

// Icon-style fill for on-screen rendering: var(--nd-color-ink) tracks the current theme (near-
// black in light mode, near-white in dark mode — see styles/tokens.css) so pictogram icons stay
// visible against the panel/canvas background in both. Outline shapes are unaffected: their
// white-fill/ink-stroke default is meant to read as "paper" regardless of app theme, matching
// how draw.io and other diagramming tools never re-theme already-drawn shape defaults.
export function getStencilRenderFill(stencil: StencilDef, classic = false): string {
  return isIconStyleStencil(stencil) ? "var(--nd-color-ink)" : getStencilDefaultStyle(stencil, classic).fill;
}

// Preview-only stroke width, for the sidebar picker / Favorites / nested-node icon chips —
// NOT the canvas or Style panel, which stay on getStencilDefaultStyle's strokeWidth (1) per
// explicit user instruction. Outline strokes do not scale with the drawing (fitBody.ts), so this
// is in screen pixels: a touch over 1 keeps a 28px thumbnail's line crisp next to the solid-filled
// pictograms, without the heavy outline a scaled 4-unit stroke used to give a large preview.
export function getStencilPreviewStyle(stencil: StencilDef, classic = false): StencilDefaultStyle {
  const base = getStencilDefaultStyle(stencil, classic);
  if (isIconStyleStencil(stencil)) return base;
  return { ...base, strokeWidth: 1.25 };
}
