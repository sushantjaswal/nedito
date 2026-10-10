// A shape's line pattern and its shadow: the values the canvas and every export both draw from.
//
// Shapes never drew a dashed outline, though the model has carried `style.dash` on nodes since
// the draw.io importer (D44) and the cloud templates set it on their zones — they came out solid.
// And draw.io's Shadow toggle had no counterpart at all. One definition of each, here, so the
// two renderers cannot drift (CLAUDE_HISTORY D67).
import type { StyleMap } from "../model/types";

/** Dash patterns, in screen pixels (shape outlines do not scale with the shape, fitBody.ts). */
export const DASH_PATTERNS: Record<string, string> = { dashed: "6 4", dotted: "1.5 4" };

export function shapeDash(style: StyleMap): string | undefined {
  return DASH_PATTERNS[style.dash as string];
}

export function hasShadow(style: StyleMap): boolean {
  return style.shadow === true || style.shadow === 1 || style.shadow === "1";
}

/** The canvas's shadow, as a CSS filter on the drawn shape (not its label). */
export const SHADOW_CSS = "drop-shadow(2px 3px 2px rgba(0, 0, 0, 0.25))";

/** The same shadow for an exported SVG, referenced as url(#nd-shadow). */
export const SHADOW_FILTER_SVG =
  '<filter id="nd-shadow" x="-20%" y="-20%" width="150%" height="150%"><feDropShadow dx="2" dy="3" stdDeviation="1" flood-color="#000000" flood-opacity="0.25"/></filter>';
