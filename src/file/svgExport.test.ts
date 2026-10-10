import { describe, expect, it } from "vitest";
import { cacheStencils } from "../library/stencils";
import generalSection from "../library/stencils/general";
import type { Diagram, ShapeNode } from "../model/types";
import { computeDiagramBounds, diagramToSvg } from "./svgExport";

cacheStencils(generalSection.shapes);

function shape(id: string, overrides: Partial<ShapeNode> = {}): ShapeNode {
  return {
    id,
    type: "shape",
    shapeRef: "general/rect",
    position: { x: 0, y: 0 },
    size: { w: 100, h: 60 },
    z: 1,
    style: {},
    ...overrides,
  };
}

function diagram(overrides: Partial<Diagram> = {}): Diagram {
  return { id: "d1", title: "Diagram", nodes: [], edges: [], ...overrides };
}

describe("computeDiagramBounds", () => {
  it("returns a fixed default size for an empty diagram", () => {
    const bounds = computeDiagramBounds(diagram());
    expect(bounds.width).toBeGreaterThan(0);
    expect(bounds.height).toBeGreaterThan(0);
  });

  it("frames all nodes with padding on every side", () => {
    const d = diagram({ nodes: [shape("a", { position: { x: 10, y: 20 } })] });
    const bounds = computeDiagramBounds(d, 40);
    expect(bounds.width).toBe(100 + 80);
    expect(bounds.height).toBe(60 + 80);
    expect(bounds.offsetX).toBe(30); // 40 - 10
    expect(bounds.offsetY).toBe(20); // 40 - 20
  });
});

describe("diagramToSvg", () => {
  it("produces a well-formed svg root with computed dimensions", () => {
    const d = diagram({ nodes: [shape("a")] });
    const svg = diagramToSvg(d);
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg.trim().endsWith("</svg>")).toBe(true);
    expect(svg).toMatch(/width="\d+(\.\d+)?"/);
  });

  it("inlines the stencil body for a shape node", () => {
    const d = diagram({ nodes: [shape("a")] });
    const svg = diagramToSvg(d);
    expect(svg).toContain("<rect"); // general/rect's stencil body
  });

  it("renders a node label as escaped text", () => {
    const d = diagram({ nodes: [shape("a", { label: { text: "A & B < C" } })] });
    const svg = diagramToSvg(d);
    expect(svg).toContain("A &amp; B &lt; C");
  });

  it("puts a top-aligned label at the head of the shape, as the canvas does", () => {
    const d = diagram({ nodes: [shape("a", { size: { w: 100, h: 200 }, style: { verticalAlign: "top" }, label: { text: "Lane" } })] });
    // 6px padding + half a 15px line, under the 40px export margin.
    expect(diagramToSvg(d, { padding: 0 })).toContain('y="13.5">Lane');
  });

  it("draws edge labels after the shapes, so no shape covers one", () => {
    const d = diagram({
      nodes: [shape("a", { position: { x: 0, y: 0 } }), shape("b", { position: { x: 300, y: 0 } })],
      edges: [{ id: "e1", source: { nodeId: "a" }, target: { nodeId: "b" }, style: {}, label: { text: "calls" } }],
    });
    const svg = diagramToSvg(d);
    expect(svg.indexOf(">calls<")).toBeGreaterThan(svg.lastIndexOf("<g transform="));
  });

  it("renders an edge as a path referencing an arrow marker by default", () => {
    const d = diagram({
      nodes: [shape("a", { position: { x: 0, y: 0 } }), shape("b", { position: { x: 300, y: 0 } })],
      edges: [{ id: "e1", source: { nodeId: "a" }, target: { nodeId: "b" }, style: { endArrow: "classic" } }],
    });
    const svg = diagramToSvg(d);
    expect(svg).toContain("<path");
    expect(svg).toContain("marker-end=\"url(#nd-arrow-classic)\"");
  });

  it("skips edges with a missing endpoint instead of throwing", () => {
    const d = diagram({
      nodes: [shape("a")],
      edges: [{ id: "e1", source: { nodeId: "a" }, target: { nodeId: "ghost" }, style: {} }],
    });
    expect(() => diagramToSvg(d)).not.toThrow();
  });

  it("includes a background rect only when a background color is given", () => {
    const d = diagram({ nodes: [shape("a")] });
    expect(diagramToSvg(d, { background: "#ffffff" })).toContain('fill="#ffffff"');
    expect(diagramToSvg(d, {})).not.toContain("<rect x=\"0\" y=\"0\" width=");
  });

  it("renders custom fill/stroke/strokeWidth/opacity from a node's style", () => {
    const d = diagram({ nodes: [shape("a", { style: { fill: "#ff0000", stroke: "#00ff00", strokeWidth: 5, opacity: 0.5 } })] });
    const svg = diagramToSvg(d);
    expect(svg).toContain('fill="#ff0000"');
    expect(svg).toContain('stroke="#00ff00"');
    expect(svg).toContain('stroke-width="5"');
    expect(svg).toContain('opacity="0.5"');
  });

  it("renders custom stroke/strokeWidth from an edge's style", () => {
    const d = diagram({
      nodes: [shape("a", { position: { x: 0, y: 0 } }), shape("b", { position: { x: 300, y: 0 } })],
      edges: [{ id: "e1", source: { nodeId: "a" }, target: { nodeId: "b" }, style: { stroke: "#123456", strokeWidth: 4 } }],
    });
    const svg = diagramToSvg(d);
    expect(svg).toContain('stroke="#123456" stroke-width="4"');
  });

  it("renders an edge label's bold/italic/color/fontSize", () => {
    const d = diagram({
      nodes: [shape("a", { position: { x: 0, y: 0 } }), shape("b", { position: { x: 300, y: 0 } })],
      edges: [
        {
          id: "e1",
          source: { nodeId: "a" },
          target: { nodeId: "b" },
          style: {},
          label: { text: "flows", bold: true, italic: true, color: "#ff00ff", fontSize: 20 },
        },
      ],
    });
    const svg = diagramToSvg(d);
    expect(svg).toContain(">flows<");
    expect(svg).toContain('font-weight="700"');
    expect(svg).toContain('font-style="italic"');
    expect(svg).toContain('fill="#ff00ff"');
    expect(svg).toContain('font-size="20"');
  });

  it("nests a raw vendor icon's own markup, sized to the node, instead of the themed scale/fill wrapper", () => {
    const d = diagram({
      nodes: [shape("a", { shapeRef: "vendor/icon", style: { fill: "#ff0000" }, size: { w: 40, h: 40 } })],
    });
    cacheStencils([
      { id: "vendor/icon", label: "Vendor Icon", defaultSize: { w: 40, h: 40 }, svgBody: "", raw: '<svg><circle r="1"/></svg>' },
    ]);
    const svg = diagramToSvg(d);
    expect(svg).toContain('<svg x="0" y="0" width="40" height="40"><svg><circle r="1"/></svg></svg>');
    expect(svg).not.toContain("fill=\"#ff0000\""); // never themed
    cacheStencils(generalSection.shapes); // restore for later tests in this file
  });

  it("renders a nested node as a stacked-card group with its summary text", () => {
    const d = diagram({
      nodes: [
        {
          id: "n1",
          type: "nested",
          position: { x: 0, y: 0 },
          size: { w: 200, h: 140 },
          z: 1,
          style: {},
          childDiagramId: "child",
          collapsed: { icons: [], summary: "Payment flow" },
          ports: [],
        },
      ],
    });
    const svg = diagramToSvg(d);
    expect(svg).toContain("Payment flow");
  });
});

describe("shape line pattern and shadow", () => {
  it("draws a dashed outline and a shadow, as the canvas does", () => {
    const d = diagram({ nodes: [shape("a", { style: { dash: "dashed", shadow: true } })] });
    const svg = diagramToSvg(d);
    expect(svg).toContain('stroke-dasharray="6 4"');
    expect(svg).toContain('filter="url(#nd-shadow)"');
    expect(svg).toContain('<filter id="nd-shadow"');
  });

  it("draws a plain shape solid and unshadowed", () => {
    const svg = diagramToSvg(diagram({ nodes: [shape("a")] }));
    expect(svg).not.toContain("stroke-dasharray");
    expect(svg).not.toContain('filter="url(#nd-shadow)"');
  });
});
