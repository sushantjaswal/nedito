// An edge's colour when its style leaves it unset.
//
// Nedito's own look draws new edges in the ink, black like shape outlines (D96; slate in D95); an edge marked `look: "classic"` (made before
// R6, or from a template — see model/look.ts) keeps the theme's muted grey, which follows dark
// mode on screen. Exports have no theme, so each look has a fixed colour there, and the colour
// pickers need a literal too (a native <input type="color"> rejects var()).
import { isClassicLook } from "../model/look";
import type { StyleMap } from "../model/types";

// Exactly the literal the exporter always wrote, case included: a classic export stays byte for byte.
export const CLASSIC_EDGE_COLOR = "#66707D";
export const EDGE_COLOR = "#1e2733";

/** The colour the canvas draws the edge in: its own, or its look's theme-aware default. */
export function edgeColorOnCanvas(style: StyleMap): string {
  if (typeof style.stroke === "string") return style.stroke;
  return isClassicLook(style) ? "var(--nd-color-muted)" : "var(--nd-color-edge)";
}

/** The colour an export draws it in. */
export function edgeColorLiteral(style: StyleMap): string {
  if (typeof style.stroke === "string") return style.stroke;
  return isClassicLook(style) ? CLASSIC_EDGE_COLOR : EDGE_COLOR;
}

/** The value a colour picker shows for it: a native colour input wants lower case. */
export function edgeColorForPicker(style: StyleMap): string {
  return typeof style.stroke === "string" ? style.stroke : edgeColorLiteral(style).toLowerCase();
}
