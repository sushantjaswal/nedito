import { describe, expect, it } from "vitest";
import { captionAbove, labelArea, labelHangsBelow, verticalAlignOf } from "./labelLayout";
import { imageLabelBox } from "./imageGeometry";
import type { StencilDef } from "../library/stencils/types";

const person: StencilDef = {
  id: "t/person",
  label: "Person",
  defaultSize: { w: 100, h: 100 },
  svgBody: "",
  labelBox: { x: 10, y: 50, w: 80, h: 50 },
};

describe("labelArea", () => {
  it("is the whole shape when the stencil names no area", () => {
    expect(labelArea(undefined, 200, 80)).toEqual({ x: 0, y: 0, w: 200, h: 80 });
  });

  it("scales the stencil's own area to the node", () => {
    expect(labelArea(person, 200, 160)).toEqual({ x: 20, y: 80, w: 160, h: 80 });
  });
});

describe("verticalAlignOf", () => {
  it("defaults to the middle and accepts top and bottom", () => {
    expect(verticalAlignOf({})).toBe("middle");
    expect(verticalAlignOf({ verticalAlign: "top" })).toBe("top");
    expect(verticalAlignOf({ verticalAlign: "bottom" })).toBe("bottom");
    expect(verticalAlignOf({ verticalAlign: "sideways" })).toBe("middle");
  });
});

describe("the label style keys", () => {
  it("turns text to read bottom to top with horizontal=0, on any shape", () => {
    expect(labelArea(undefined, 40, 200, { horizontal: false }).vertical).toBe(true);
    expect(labelArea(undefined, 40, 200, { horizontal: "0" }).vertical).toBe(true);
    expect(labelArea(undefined, 40, 200, {}).vertical).toBeUndefined();
  });

  it("hangs a caption above the shape with verticalLabelPosition=top", () => {
    expect(captionAbove({ verticalLabelPosition: "top" })).toBe(true);
    expect(captionAbove({})).toBe(false);
    // Two 12px lines above a 50px shape: they end 4px above its top edge.
    const box = imageLabelBox(50, 2, 12, true);
    expect(box.bottom).toBe(-4);
    expect(box.top).toBe(-34);
  });
});

describe("verticalLabelPosition on any shape", () => {
  it("hangs a plain shape's label outside it when the style asks", () => {
    expect(labelHangsBelow("general/circle", undefined, { verticalLabelPosition: "bottom" })).toBe(true);
    expect(labelHangsBelow("general/circle", undefined, { verticalLabelPosition: "top" })).toBe(true);
    expect(labelHangsBelow("general/circle", undefined, {})).toBe(false);
  });
});

describe("a narrow box's label keeps less to the sides (D139)", () => {
  it("8px on a wide box, a tenth of the width on a narrow one, never under 2px", async () => {
    const { labelSidePad } = await import("./labelLayout");
    expect(labelSidePad(200)).toBe(8);
    expect(labelSidePad(80)).toBe(8);
    expect(labelSidePad(30)).toBe(3);
    expect(labelSidePad(10)).toBe(2);
  });

  it("the export places a left-aligned label in a narrow box by the same rule", async () => {
    const { diagramToSvg } = await import("../file/svgExport");
    const { createDefaultLayers } = await import("../model/layers");
    const svg = diagramToSvg({
      id: "d",
      title: "P",
      layers: createDefaultLayers(),
      nodes: [{ id: "pk", type: "shape", shapeRef: "general/rect", position: { x: 0, y: 0 }, size: { w: 30, h: 30 }, z: 1, style: {}, label: { text: "PK", align: "left" } }],
      edges: [],
    });
    // 3px in from the box's left edge (label coordinates are the shape's own).
    expect(svg).toMatch(/<tspan x="3" /);
  });
});
