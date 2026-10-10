import type { StencilSection } from "./types";

// The sidebar's lines, which place real lines, as draw.io's do: an edge with both ends free that
// can be bent, restyled from its toolbar, and dropped onto a shape at either end to connect it
// (StencilDef.line; store.addShapeNode places it). Each entry's svgBody is only the picker's
// picture of it, drawn with `<nd-line>` (see lineBody.ts) so its arrowheads read at tile size.
// A diagram saved while these were boxes keeps drawing them as boxes from the same svgBody.
// Original geometry; nothing taken from another product.
//
// The set: the plain line in its three standard patterns, doubled, and as a curve; the annotation
// arrows (one-way, two-way, open, dashed, curved, elbow, block); the four UML class relationships;
// and the three crow's-foot cardinalities a data model is read by. The wavy line is a line too,
// drawn as a wave along its route (canvas/edgeShapes.ts).

const line = (points: string, extra = "") => `<nd-line points="${points}"${extra} />`;
const H = "0,50 100,50";
const WIDE = { w: 160, h: 40 };
const NONE = "none";

/** A line across the stencil's box, left to right through the middle — the default for most. */
const across = (w: number, h: number) => ({ from: { x: 0, y: h / 2 }, to: { x: w, y: h / 2 } });
const ACROSS = across(WIDE.w, WIDE.h);
const straight = (style: Record<string, string> = {}) => ({ ...ACROSS, style: { edgeStyle: "straight", ...style } });

const section: StencilSection = {
  id: "lines",
  name: "Lines",
  shapes: [
    {
      id: "lines/line",
      label: "Line",
      keywords: ["straight", "horizontal", "divider", "separator", "rule", "solid"],
      defaultSize: WIDE,
      svgBody: line(H),
      defaultFill: NONE,
      line: straight(),
    },
    {
      id: "lines/line-vertical",
      label: "Vertical Line",
      keywords: ["divider", "separator", "rule", "column"],
      defaultSize: { w: 40, h: 160 },
      svgBody: line("50,0 50,100"),
      defaultFill: NONE,
      line: { from: { x: 20, y: 0 }, to: { x: 20, y: 160 }, style: { edgeStyle: "straight" } },
    },
    {
      id: "lines/line-diagonal",
      label: "Diagonal Line",
      keywords: ["slant", "slash", "angled"],
      defaultSize: { w: 120, h: 120 },
      svgBody: line("0,100 100,0"),
      defaultFill: NONE,
      line: { from: { x: 0, y: 120 }, to: { x: 120, y: 0 }, style: { edgeStyle: "straight" } },
    },
    {
      id: "lines/dashed",
      label: "Dashed Line",
      keywords: ["dash", "broken", "boundary", "optional"],
      defaultSize: WIDE,
      svgBody: line(H),
      defaultFill: NONE,
      line: straight({ dash: "dashed" }),
      defaultStyle: { dash: "dashed" },
    },
    {
      id: "lines/dotted",
      label: "Dotted Line",
      keywords: ["dot", "dots", "leader"],
      defaultSize: WIDE,
      svgBody: line(H),
      defaultFill: NONE,
      line: straight({ dash: "dotted" }),
      defaultStyle: { dash: "dotted" },
    },
    {
      id: "lines/double",
      label: "Double Line",
      keywords: ["parallel", "twin", "equals", "underline"],
      defaultSize: WIDE,
      svgBody: line(H, ' double="1"'),
      defaultFill: NONE,
      line: straight({ edgeShape: "double" }),
    },
    {
      id: "lines/wavy",
      label: "Wavy Line",
      keywords: ["wave", "squiggle", "break", "sine", "zigzag"],
      defaultSize: WIDE,
      svgBody: '<path d="M0,50 C12.5,5 12.5,5 25,50 S37.5,95 50,50 S62.5,5 75,50 S87.5,95 100,50" fill="none" />',
      defaultFill: NONE,
      line: straight({ edgeShape: "wavy" }),
    },
    {
      id: "lines/curve",
      label: "Curve",
      keywords: ["curved", "bezier", "s-curve", "smooth"],
      defaultSize: { w: 160, h: 80 },
      svgBody: line("0,90 55,90 45,10 100,10", ' curve="1"'),
      defaultFill: NONE,
      line: { from: { x: 0, y: 70 }, to: { x: 160, y: 10 }, style: { edgeStyle: "curved" } },
    },
    {
      id: "lines/arrow",
      label: "Arrow",
      keywords: ["pointer", "direction", "flow", "next", "callout"],
      defaultSize: WIDE,
      svgBody: line(H, ' end="classic"'),
      defaultFill: NONE,
      line: straight({ endArrow: "classic" }),
    },
    {
      id: "lines/arrow-double",
      label: "Double Arrow",
      keywords: ["bidirectional", "two-way", "both", "sync", "exchange", "dimension"],
      defaultSize: WIDE,
      svgBody: line(H, ' start="classic" end="classic"'),
      defaultFill: NONE,
      line: straight({ startArrow: "classic", endArrow: "classic" }),
    },
    {
      id: "lines/arrow-open",
      label: "Open Arrow",
      keywords: ["chevron", "association", "navigable", "pointer"],
      defaultSize: WIDE,
      svgBody: line(H, ' end="open"'),
      defaultFill: NONE,
      line: straight({ endArrow: "open" }),
    },
    {
      id: "lines/arrow-dashed",
      label: "Dashed Arrow",
      keywords: ["dependency", "async", "asynchronous", "return", "reply", "message", "uses"],
      defaultSize: WIDE,
      svgBody: line(H, ' end="open"'),
      defaultFill: NONE,
      line: straight({ endArrow: "open", dash: "dashed" }),
      defaultStyle: { dash: "dashed" },
    },
    {
      id: "lines/arrow-curved",
      label: "Curved Arrow",
      keywords: ["arc", "bend", "loop", "callout", "annotation"],
      defaultSize: { w: 160, h: 80 },
      svgBody: line("0,95 20,0 80,0 100,95", ' curve="1" end="classic"'),
      defaultFill: NONE,
      line: { from: { x: 0, y: 76 }, to: { x: 160, y: 76 }, waypoints: [{ x: 80, y: 6 }], style: { edgeStyle: "curved", endArrow: "classic" } },
    },
    {
      id: "lines/arrow-elbow",
      label: "Elbow Arrow",
      keywords: ["orthogonal", "step", "right angle", "connector", "bent"],
      defaultSize: { w: 160, h: 80 },
      svgBody: line("0,10 50,10 50,90 100,90", ' end="classic"'),
      defaultFill: NONE,
      line: { from: { x: 0, y: 8 }, to: { x: 160, y: 72 }, style: { edgeStyle: "orthogonal", endArrow: "classic" } },
    },
    {
      id: "lines/arrow-block",
      label: "Block Arrow",
      keywords: ["flex arrow", "thick arrow", "hollow arrow", "big arrow", "process arrow"],
      defaultSize: WIDE,
      svgBody: '<path d="M0,38 L72,38 L72,15 L100,50 L72,85 L72,62 L0,62 Z" fill="none" stroke-linejoin="round" />',
      defaultFill: NONE,
      line: straight({ edgeShape: "arrow", endArrow: "classic" }),
    },

    // UML class relationships, as UML 2.5 draws them.
    {
      id: "lines/inheritance",
      label: "Inheritance",
      keywords: ["generalization", "extends", "subclass", "uml", "is-a"],
      defaultSize: WIDE,
      svgBody: line(H, ' end="triangle"'),
      defaultFill: NONE,
      line: straight({ endArrow: "triangle" }),
    },
    {
      id: "lines/realization",
      label: "Realization",
      keywords: ["implements", "interface", "implementation", "uml"],
      defaultSize: WIDE,
      svgBody: line(H, ' end="triangle"'),
      defaultFill: NONE,
      line: straight({ endArrow: "triangle", dash: "dashed" }),
      defaultStyle: { dash: "dashed" },
    },
    {
      id: "lines/composition",
      label: "Composition",
      keywords: ["owns", "part of", "whole", "filled diamond", "uml"],
      defaultSize: WIDE,
      svgBody: line(H, ' start="diamond"'),
      defaultFill: NONE,
      line: straight({ startArrow: "diamond" }),
    },
    {
      id: "lines/aggregation",
      label: "Aggregation",
      keywords: ["has-a", "contains", "hollow diamond", "uml"],
      defaultSize: WIDE,
      svgBody: line(H, ' start="diamond-open"'),
      defaultFill: NONE,
      line: straight({ startArrow: "diamond-open" }),
    },

    // Crow's-foot cardinality (Information Engineering notation).
    {
      id: "lines/one-to-one",
      label: "One to One",
      keywords: ["1:1", "cardinality", "relationship", "erd", "crow's foot"],
      defaultSize: WIDE,
      svgBody: line(H, ' start="er-one" end="er-one"'),
      defaultFill: NONE,
      line: straight({ startArrow: "er-one", endArrow: "er-one" }),
    },
    {
      id: "lines/one-to-many",
      label: "One to Many",
      keywords: ["1:n", "1:m", "cardinality", "relationship", "erd", "crow's foot"],
      defaultSize: WIDE,
      svgBody: line(H, ' start="er-one" end="er-one-or-many"'),
      defaultFill: NONE,
      line: straight({ startArrow: "er-one", endArrow: "er-one-or-many" }),
    },
    {
      id: "lines/many-to-many",
      label: "Many to Many",
      keywords: ["m:n", "n:m", "cardinality", "relationship", "erd", "crow's foot", "junction"],
      defaultSize: WIDE,
      svgBody: line(H, ' start="er-one-or-many" end="er-one-or-many"'),
      defaultFill: NONE,
      line: straight({ startArrow: "er-one-or-many", endArrow: "er-one-or-many" }),
    },
  ],
};

export default section;
