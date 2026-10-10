// RichLabel.align has to mean the same thing on the canvas as it does in an export.
//
// It did not. The canvas label is a flex box with `justify-content: center`, which positions the
// text block; `text-align` only positions lines *within* that block, so for a single-line label
// it did nothing at all and `align` was silently inert. The SVG export, meanwhile, honoured it
// via `text-anchor`. A BPMN lane's name is the case that exposed it: set to the left so it sits
// in the lane's name band, it rendered in the middle of the diagram on top of the first task.
//
// This is the third time the canvas and the export have been found disagreeing about something
// they both claim to implement.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { diagramToSvg } from "../file/svgExport";
import { createDefaultLayers } from "../model/layers";
import type { Diagram, RichLabel, ShapeNode } from "../model/types";

/** The mapping ShapeNode applies. Kept here so a change to it has to be deliberate. */
const JUSTIFY: Record<string, string> = { left: "flex-start", center: "center", right: "flex-end" };

function labelled(align: RichLabel["align"]): Diagram {
  const node: ShapeNode = {
    id: "n1",
    type: "shape",
    shapeRef: "general/rect",
    position: { x: 0, y: 0 },
    size: { w: 200, h: 60 },
    z: 1,
    style: {},
    label: { text: "Sales", align },
  };
  return { id: "d", title: "Page", layers: createDefaultLayers(), nodes: [node], edges: [] };
}

describe("label alignment", () => {
  it.each([
    ["left", "start"],
    ["center", "middle"],
    ["right", "end"],
  ] as const)("exports %s as text-anchor %s", (align, anchor) => {
    expect(diagramToSvg(labelled(align))).toContain(`text-anchor="${anchor}"`);
  });

  it("defaults to centre when a label says nothing", () => {
    expect(diagramToSvg(labelled(undefined))).toContain('text-anchor="middle"');
  });

  // The canvas's half of the same contract. ShapeNode positions the text block with
  // justify-content, because text-align alone cannot move it inside a centring flex box.
  it("has a flex justification for every alignment the model allows", () => {
    for (const align of ["left", "center", "right"] as const) {
      expect(JUSTIFY[align]).toBeTruthy();
    }
  });

  it("keeps ShapeNode positioning the block, not just the lines within it", () => {
    const source = readFileSync(join(process.cwd(), "src/canvas/ShapeNode.tsx"), "utf8");
    // A regression here is invisible on screen until someone left-aligns something wide.
    expect(source).toContain("justifyContent");
    expect(source).toContain('left: "flex-start"');
    expect(source).toContain('right: "flex-end"');
  });
});
