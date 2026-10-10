// The colour a shape's label takes when the author has not chosen one.
//
// It follows the fill behind the text, not the app theme. It used to follow the theme, while an
// outline shape's white "paper" fill deliberately does not (defaultStyle.ts) — so in dark mode
// every default shape showed light grey text on white. A label on an opaque fill now contrasts
// with that fill, identically in both themes and in every export, so a drawn diagram looks the
// same wherever it is seen. Only a label with nothing opaque behind it — no fill, a faint one, or
// a pictogram whose colour already tracks the theme — still follows the theme, because what it
// sits on is the canvas. Shared by the canvas and the exporter so the two cannot disagree (D67).

import { getStencilRenderFill } from "../library/stencils/defaultStyle";
import type { StencilDef } from "../library/stencils/types";

/** Dark ink for light fills: the canvas ink token's light-theme value. */
export const LABEL_INK_DARK = "#1E2733";
/** Light ink for dark fills. */
export const LABEL_INK_LIGHT = "#FFFFFF";

/** Below this fill opacity the canvas shows through enough that the canvas decides legibility. */
const MIN_OPAQUE = 0.5;

/** Parses #rgb, #rgba, #rrggbb, #rrggbbaa, rgb() and rgba(); anything else is not a fill we can read. */
function parseColor(value: string): { r: number; g: number; b: number; a: number } | null {
  const v = value.trim().toLowerCase();
  const hex = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/.exec(v);
  if (hex) {
    let h = hex[1];
    if (h.length <= 4) h = [...h].map((c) => c + c).join("");
    const n = (i: number) => parseInt(h.slice(i, i + 2), 16);
    return { r: n(0), g: n(2), b: n(4), a: h.length === 8 ? n(6) / 255 : 1 };
  }
  const fn = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.]+%?))?\s*\)$/.exec(v);
  if (fn) {
    const alpha = fn[4] === undefined ? 1 : fn[4].endsWith("%") ? parseFloat(fn[4]) / 100 : parseFloat(fn[4]);
    return { r: +fn[1], g: +fn[2], b: +fn[3], a: alpha };
  }
  if (v === "white") return { r: 255, g: 255, b: 255, a: 1 };
  if (v === "black") return { r: 0, g: 0, b: 0, a: 1 };
  return null;
}

/** WCAG relative luminance, 0 (black) to 1 (white). */
function luminance({ r, g, b }: { r: number; g: number; b: number }): number {
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function contrast(a: number, b: number): number {
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

/**
 * The fill a shape's label actually sits on, as the canvas draws it; undefined when that is not
 * a fixed colour. A pictogram's default colour follows the theme on screen (it is the fixed ink
 * only in the exporter's own defaults), and a vendor icon paints itself, so neither gives the
 * label a fixed backdrop — using the exporter's value here would put white text on an icon the
 * canvas shows with dark text.
 */
export function labelBackdrop(styleFill: unknown, stencil: StencilDef | undefined, classic = false): string | undefined {
  if (stencil?.raw) return undefined;
  if (typeof styleFill === "string") return styleFill;
  if (!stencil) return "#ffffff"; // the canvas and exporter both draw an unknown shape on white
  const fill = getStencilRenderFill(stencil, classic);
  return fill.startsWith("var(") ? undefined : fill;
}

/**
 * The default label colour for text drawn over `fill`, or null when there is no opaque fill
 * behind it — in which case the caller uses the theme's ink on screen and its usual ink in an
 * export.
 */
export function defaultLabelColor(fill: string | undefined, fillOpacity?: number): string | null {
  if (!fill) return null;
  const color = parseColor(fill);
  if (!color) return null; // "none", "transparent", a CSS variable: nothing fixed to contrast with
  if (color.a * (fillOpacity ?? 1) < MIN_OPAQUE) return null;
  const l = luminance(color);
  // Whichever ink reads better on this fill.
  return contrast(l, luminance(parseColor(LABEL_INK_DARK)!)) >= contrast(l, 1) ? LABEL_INK_DARK : LABEL_INK_LIGHT;
}
