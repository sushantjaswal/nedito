// Fill opacity has to mean the same thing on the canvas and in an export, and it has to stay
// distinct from the node's own opacity.
//
// The distinction is the point. Whole-node opacity fades the shape, its border and its label
// together; fill opacity fades only the interior. A Venn diagram needs the second — the overlaps
// have to blend while the outlines and the text stay crisp — and the Style panel had only the
// first (CLAUDE_HISTORY.md D71).
//
// Added here rather than only in the Venn templates because it is now a style any shape can
// carry, and the canvas/export pair has drifted three times already (D67, D69, D70).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { diagramToSvg } from "../file/svgExport";
import { createDefaultLayers } from "../model/layers";
import type { Diagram, ShapeNode, StyleMap } from "../model/types";

function withStyle(style: StyleMap): Diagram {
  const node: ShapeNode = {
    id: "n1",
    type: "shape",
    shapeRef: "general/ellipse",
    position: { x: 0, y: 0 },
    size: { w: 200, h: 200 },
    z: 1,
    style,
    label: { text: "Set A" },
  };
  return { id: "d", title: "Page", layers: createDefaultLayers(), nodes: [node], edges: [] };
}

describe("fill opacity", () => {
  it("exports as fill-opacity on the shape, not as opacity on the group", () => {
    const svg = diagramToSvg(withStyle({ fill: "#6D5AE6", fillOpacity: 0.4, stroke: "#4B3BC4", strokeWidth: 2 }));
    expect(svg).toContain('fill-opacity="0.4"');
    // The group's own opacity stays 1, so the border and the label are unaffected.
    expect(svg).toContain('opacity="1"');
  });

  it("is left out entirely when a shape does not set it", () => {
    expect(diagramToSvg(withStyle({ fill: "#FFFFFF" }))).not.toContain("fill-opacity");
  });

  it("stays independent of the node's own opacity", () => {
    const svg = diagramToSvg(withStyle({ fill: "#6D5AE6", fillOpacity: 0.4, opacity: 0.5 }));
    expect(svg).toContain('fill-opacity="0.4"');
    expect(svg).toContain('opacity="0.5"');
  });

  it("reaches the canvas through StencilGlyph, not just the export", () => {
    const shapeNode = readFileSync(join(process.cwd(), "src/canvas/ShapeNode.tsx"), "utf8");
    const glyph = readFileSync(join(process.cwd(), "src/library/stencils/StencilGlyph.tsx"), "utf8");
    expect(shapeNode).toContain("fillOpacity={node.style.fillOpacity");
    expect(glyph).toContain("fillOpacity={fillOpacity}");
  });

  it("is offered in the Fill popover (once the Style panel), so a user can draw a Venn by hand", () => {
    const styleTab = readFileSync(join(process.cwd(), "src/format-panel/StyleSections.tsx"), "utf8");
    // The templates spec's hard rule: never use something the app cannot otherwise produce.
    expect(styleTab).toContain('label="Fill opacity"');
    expect(styleTab).toContain("setNodeStyle(nodeIds, { fillOpacity: v })");
  });
});
