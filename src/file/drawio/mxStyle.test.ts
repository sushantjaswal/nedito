import { describe, expect, it } from "vitest";
import { parseMxStyle, toEdgeStyle, toNodeStyle, toShapeRef } from "./mxStyle";

describe("parseMxStyle", () => {
  it("splits bare shape names from key=value pairs", () => {
    const style = parseMxStyle("ellipse;whiteSpace=wrap;html=1;fillColor=#dae8fc;");
    expect(style.names).toContain("ellipse");
    expect(style.keys.fillColor).toBe("#dae8fc");
    expect(style.keys.html).toBe("1");
  });

  it("copes with an empty, absent or trailing-semicolon style", () => {
    expect(parseMxStyle("").names).toEqual([]);
    expect(parseMxStyle(null).keys).toEqual({});
    expect(parseMxStyle(";;rounded=1;;").keys.rounded).toBe("1");
  });

  it("lets a repeated key win last, the way draw.io resolves it", () => {
    expect(parseMxStyle("fillColor=#fff;fillColor=#000").keys.fillColor).toBe("#000");
  });
});

describe("toShapeRef", () => {
  it("maps draw.io's default cell to a rectangle, rounded or not", () => {
    expect(toShapeRef(parseMxStyle("rounded=0;whiteSpace=wrap;html=1;"))).toMatchObject({
      shapeRef: "general/rect",
      matched: true,
    });
    expect(toShapeRef(parseMxStyle("rounded=1;whiteSpace=wrap;html=1;"))).toMatchObject({
      shapeRef: "general/rounded-rect",
      matched: true,
    });
  });

  it("maps bare shape names", () => {
    expect(toShapeRef(parseMxStyle("ellipse;")).shapeRef).toBe("general/ellipse");
    expect(toShapeRef(parseMxStyle("rhombus;")).shapeRef).toBe("general/diamond");
    expect(toShapeRef(parseMxStyle("triangle;")).shapeRef).toBe("general/triangle");
    expect(toShapeRef(parseMxStyle("hexagon;")).shapeRef).toBe("general/hexagon");
  });

  it("prefers an explicit shape= key over a bare name", () => {
    expect(toShapeRef(parseMxStyle("ellipse;shape=cylinder3;")).shapeRef).toBe("general/cylinder");
  });

  it("maps draw.io's own flowchart stencil library", () => {
    expect(toShapeRef(parseMxStyle("shape=mxgraph.flowchart.decision;")).shapeRef).toBe("flowchart/decision");
    expect(toShapeRef(parseMxStyle("shape=mxgraph.flowchart.manual_input;")).shapeRef).toBe("flowchart/manual-input");
  });

  // The honest fallback: a rectangle the user can see beats a shape silently dropped, and the
  // requested name comes back so the import can say what it substituted.
  it("falls back to a rectangle and reports what it could not draw", () => {
    const result = toShapeRef(parseMxStyle("shape=mxgraph.azure.some_very_specific_icon;"));
    expect(result.shapeRef).toBe("general/rect");
    expect(result.matched).toBe(false);
    expect(result.requested).toBe("mxgraph.azure.some_very_specific_icon");
  });
});

describe("toNodeStyle", () => {
  it("carries fill, stroke, width and dash across", () => {
    const style = toNodeStyle(parseMxStyle("fillColor=#d5e8d4;strokeColor=#82b366;strokeWidth=3;dashed=1;"));
    expect(style).toMatchObject({ fill: "#d5e8d4", stroke: "#82b366", strokeWidth: 3, dash: "dashed" });
  });

  it("distinguishes dotted from dashed by draw.io's dash pattern", () => {
    expect(toNodeStyle(parseMxStyle("dashed=1;dashPattern=1 4;")).dash).toBe("dotted");
  });

  it("keeps a deliberately borderless shape borderless", () => {
    // Dropping the key instead would let the stencil default paint the border back on.
    expect(toNodeStyle(parseMxStyle("strokeColor=none;")).stroke).toBe("none");
  });

  it("carries where the label sits: vertical alignment, turned text, outside the shape", () => {
    const style = toNodeStyle(parseMxStyle("swimlane;horizontal=0;verticalAlign=top;"));
    expect(style).toMatchObject({ horizontal: 0, verticalAlign: "top" });
    expect(toNodeStyle(parseMxStyle("ellipse;verticalLabelPosition=bottom;")).verticalLabelPosition).toBe("bottom");
    // draw.io's defaults (middle, horizontal, inside) add nothing.
    expect(toNodeStyle(parseMxStyle("verticalAlign=middle;horizontal=1;"))).toEqual({});
  });

  it("carries draw.io's shadow toggle", () => {
    expect(toNodeStyle(parseMxStyle("rounded=1;shadow=1;")).shadow).toBe(1);
    expect(toNodeStyle(parseMxStyle("shadow=0;")).shadow).toBeUndefined();
  });

  it("rescales opacity from draw.io's 0-100 to the model's 0-1", () => {
    expect(toNodeStyle(parseMxStyle("opacity=50;")).opacity).toBe(0.5);
  });

  it("ignores values that aren't numbers rather than writing NaN into the document", () => {
    const style = toNodeStyle(parseMxStyle("strokeWidth=thick;opacity=lots;"));
    expect(style.strokeWidth).toBeUndefined();
    expect(style.opacity).toBeUndefined();
  });
});

describe("toEdgeStyle", () => {
  it("keeps the routing the diagram was drawn with, not our own default", () => {
    expect(toEdgeStyle(parseMxStyle("edgeStyle=orthogonalEdgeStyle;")).edgeStyle).toBe("orthogonal");
    expect(toEdgeStyle(parseMxStyle("curved=1;")).edgeStyle).toBe("curved");
    expect(toEdgeStyle(parseMxStyle("edgeStyle=none;")).edgeStyle).toBe("straight");
    // draw.io's own default when the style says nothing.
    expect(toEdgeStyle(parseMxStyle("html=1;")).edgeStyle).toBe("orthogonal");
  });

  it("carries the arrowheads that mean something as themselves, hollow or filled (X2, D133)", () => {
    const end = (s: string) => toEdgeStyle(parseMxStyle(s)).endArrow;
    expect(end("endArrow=none;")).toBe("none");
    expect(end("endArrow=open;")).toBe("open");
    expect(end("endArrow=block;")).toBe("classic");
    // UML: generalisation, composition, aggregation.
    expect(end("endArrow=block;endFill=0;")).toBe("triangle");
    expect(end("endArrow=diamondThin;")).toBe("diamond");
    expect(end("endArrow=diamond;endFill=0;")).toBe("diamond-open");
    // Every crow's-foot end, whatever draw.io's fill flag says (it draws them as lines).
    expect(end("endArrow=ERmany;endFill=0;")).toBe("crows-foot");
    expect(end("endArrow=ERmandOne;")).toBe("er-one");
    expect(end("endArrow=ERone;")).toBe("er-one");
    expect(end("endArrow=ERzeroToOne;")).toBe("er-zero-or-one");
    expect(end("endArrow=ERoneToMany;")).toBe("er-one-or-many");
    expect(end("endArrow=ERzeroToMany;")).toBe("er-zero-or-many");
    expect(toEdgeStyle(parseMxStyle("startArrow=diamondThin;startFill=0;")).startArrow).toBe("diamond-open");
    // A head Nedito lacks keeps the old rule: solid, so classic.
    expect(end("endArrow=oval;")).toBe("classic");
  });

  it("defaults the ends the way draw.io does when the style is silent", () => {
    const style = toEdgeStyle(parseMxStyle("html=1;"));
    expect(style.startArrow).toBe("none");
    expect(style.endArrow).toBe("classic");
  });
});
