// Style presets (CLAUDE_HISTORY.md D99): draw.io's row of ready-made styles, a shape's fill and
// outline set together in one click. Our own palette — light fills with a deeper outline in the
// same hue, plus a dark one — not draw.io's. A preset sets fill and outline only: the label's
// colour already follows the fill (D78), so text stays readable on every preset, the dark one
// included. "Default" clears both, so the shape takes the standard look again.
export interface StylePreset {
  id: string;
  name: string;
  /** Null for Default: the fill and outline are removed rather than set. */
  fill: string | null;
  stroke: string | null;
}

export const STYLE_PRESETS: readonly StylePreset[] = [
  { id: "default", name: "Default", fill: null, stroke: null },
  { id: "blue", name: "Blue", fill: "#e3edfb", stroke: "#3b6fb6" },
  { id: "green", name: "Green", fill: "#e4f3e5", stroke: "#3f8a4a" },
  { id: "amber", name: "Amber", fill: "#fdf0d5", stroke: "#b8800f" },
  { id: "red", name: "Red", fill: "#fbe3e1", stroke: "#c0453a" },
  { id: "violet", name: "Violet", fill: "#eeebfc", stroke: "#6d5ae6" },
  { id: "grey", name: "Grey", fill: "#eef0f3", stroke: "#66707d" },
  { id: "dark", name: "Dark", fill: "#1e2733", stroke: "#1e2733" },
];

/** The preset a style currently matches, if any — what the swatch row shows as chosen. */
export function presetOf(style: Record<string, unknown>): StylePreset | undefined {
  const fill = typeof style.fill === "string" ? style.fill.toLowerCase() : null;
  const stroke = typeof style.stroke === "string" ? style.stroke.toLowerCase() : null;
  return STYLE_PRESETS.find((p) => p.fill === fill && p.stroke === stroke);
}
