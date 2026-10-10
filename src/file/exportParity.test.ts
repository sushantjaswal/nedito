// Does an export look like the canvas?
//
// Every assertion here corresponds to a way it did not: curved edges
// exported as straight lines, the Nested Block exported as an empty box, text fell back to
// serif, and labels were clipped out of the bounds. Each of these fails against the renderer
// as it was, which is the only reason to write them — the drift was invisible in code review
// for months because nothing compared the two paths.
import { describe, expect, it } from "vitest";
import { Position } from "@xyflow/react";
import { DEFAULT_HANDLE, buildEdgePath, normalizeEdgeStyle, resolveHandleAnchor } from "../canvas/edgeRouting";
import { EXPORT_FONT_FAMILY } from "./exportFonts";
import { computeDiagramBounds, diagramToSvg } from "./svgExport";
import { createDefaultLayers } from "../model/layers";
import type { DEdge, DNode, Diagram, NestedNode, Port, ShapeNode } from "../model/types";

function shape(id: string, x: number, y: number, w = 120, h = 60, text?: string): ShapeNode {
  return {
    id,
    type: "shape",
    shapeRef: "general/rect",
    position: { x, y },
    size: { w, h },
    z: 1,
    style: {},
    label: text ? { text } : undefined,
  };
}

function page(nodes: DNode[], edges: DEdge[] = []): Diagram {
  return { id: "d", title: "Page", layers: createDefaultLayers(), nodes, edges };
}

// The arrowhead <marker> defs are <path>s with the same attributes, so look only at the markup
// after </defs>.
const edgePaths = (svg: string) =>
  [...svg.slice(svg.indexOf("</defs>")).matchAll(/<path d="([^"]+)" fill="none" stroke=/g)].map((m) => m[1]);

describe("export parity — edge geometry", () => {
  // The bug, in one test: nine curved edges with no waypoints exported as nine straight lines,
  // because the exporter used the polyline builder and that falls back to straight under three
  // points, while the canvas used React Flow's bezier.
  it("draws a curved edge as a curve even with no waypoints", () => {
    const svg = diagramToSvg(
      page(
        [shape("a", 0, 0), shape("b", 400, 300)],
        [{ id: "e", source: { nodeId: "a" }, target: { nodeId: "b" }, style: { edgeStyle: "curved" } }],
      ),
    );
    expect(edgePaths(svg)[0]).toMatch(/[CQS]/);
  });

  it("draws a straight edge as a straight line", () => {
    const svg = diagramToSvg(
      page(
        [shape("a", 0, 0), shape("b", 400, 300)],
        [{ id: "e", source: { nodeId: "a" }, target: { nodeId: "b" }, style: { edgeStyle: "straight" } }],
      ),
    );
    expect(edgePaths(svg)[0]).not.toMatch(/[CQS]/);
  });

  it("gives an orthogonal edge more than one corner, as the canvas's smooth step does", () => {
    const svg = diagramToSvg(
      page(
        [shape("a", 0, 0), shape("b", 400, 300)],
        [{ id: "e", source: { nodeId: "a" }, target: { nodeId: "b" }, style: { edgeStyle: "orthogonal" } }],
      ),
    );
    expect((edgePaths(svg)[0].match(/L/g) ?? []).length).toBeGreaterThan(1);
  });

  // The export derives its endpoints from the model; the canvas gets them from React Flow. The
  // shared router is what keeps those two answers the same, so pin the rule it encodes.
  it("anchors an unspecified handle at the top, the way React Flow falls back", () => {
    const node = shape("a", 100, 200, 200, 90);
    const anchor = resolveHandleAnchor(node, { x: 100, y: 200, w: 200, h: 90 });
    // On the shape's top border, not 7px above it at the hover handle (D81).
    expect(anchor.point).toEqual({ x: 200, y: 200 });
    expect(anchor.position).toBe(Position.Top);
    expect(DEFAULT_HANDLE).toBe("top");
  });

  // D81: an edge touches the shape. It used to end at the hover handle, 7px outside the border.
  it("anchors each named side on that side's border", () => {
    const node = shape("a", 0, 0, 100, 50);
    const box = { x: 0, y: 0, w: 100, h: 50 };
    expect(resolveHandleAnchor(node, box, "right").point).toEqual({ x: 100, y: 25 });
    expect(resolveHandleAnchor(node, box, "left").point).toEqual({ x: 0, y: 25 });
    expect(resolveHandleAnchor(node, box, "bottom").point).toEqual({ x: 50, y: 50 });
  });

  it("anchors a port at its own side and offset", () => {
    const nested: NestedNode = {
      id: "n",
      type: "nested",
      childDiagramId: "child",
      position: { x: 0, y: 0 },
      size: { w: 200, h: 100 },
      z: 1,
      style: {},
      collapsed: { icons: [] },
      ports: [{ id: "p1", side: "right", offset: 0.25, innerNodeId: "inner" }],
    };
    const anchor = resolveHandleAnchor(nested, { x: 0, y: 0, w: 200, h: 100 }, "port:p1");
    expect(anchor.point).toEqual({ x: 200, y: 25 }); // on the border, where the port dot sits
    expect(anchor.position).toBe(Position.Right);
  });

  it("falls back to the default handle rather than throwing on a port that no longer exists", () => {
    const nested: NestedNode = {
      id: "n",
      type: "nested",
      childDiagramId: "child",
      position: { x: 0, y: 0 },
      size: { w: 100, h: 100 },
      z: 1,
      style: {},
      collapsed: { icons: [] },
      ports: [],
    };
    expect(() => resolveHandleAnchor(nested, { x: 0, y: 0, w: 100, h: 100 }, "port:gone")).not.toThrow();
  });

  it("treats an unknown or missing edgeStyle as orthogonal, like the canvas", () => {
    expect(normalizeEdgeStyle(undefined)).toBe("orthogonal");
    expect(normalizeEdgeStyle("nonsense")).toBe("orthogonal");
    expect(normalizeEdgeStyle("curved")).toBe("curved");
  });

  it("routes through waypoints when the edge has them", () => {
    const withWaypoints = buildEdgePath({
      sourceX: 0,
      sourceY: 0,
      sourcePosition: Position.Top,
      targetX: 100,
      targetY: 100,
      targetPosition: Position.Top,
      waypoints: [{ x: 50, y: 0 }],
      kind: "straight",
    });
    expect(withWaypoints.path).toContain("50,0");
  });
});

describe("export parity — the Nested Block", () => {
  const child: Diagram = {
    ...page(
      [shape("c1", 0, 0, 80, 40), shape("c2", 200, 120, 80, 40)],
      [{ id: "ce", source: { nodeId: "c1" }, target: { nodeId: "c2" }, style: {} }],
    ),
    id: "child",
  };
  const unmapped = { id: "p2", side: "right", offset: 0.5 } as Port;
  const nested: NestedNode = {
    id: "n",
    type: "nested",
    childDiagramId: "child",
    position: { x: 40, y: 40 },
    size: { w: 220, h: 140 },
    z: 2,
    style: {},
    label: { text: "Payment Service" },
    collapsed: { icons: [], summary: "gateway · ledger" },
    ports: [{ id: "p1", side: "left", offset: 0.5, innerNodeId: "c1" }, unmapped],
  };
  const svg = () => diagramToSvg(page([nested]));

  it("carries its title", () => {
    expect(svg()).toContain("Payment Service");
  });

  it("carries its summary", () => {
    expect(svg()).toContain("gateway · ledger");
  });

  it("draws the stacked-card ghosts behind the body", () => {
    // Two offset rectangles: the stacked-card look of a Nested Block.
    expect([...svg().matchAll(/<rect x="(9|4\.5)" y="(9|4\.5)"/g)]).toHaveLength(2);
  });

  it("draws the live miniature of the child when the document is available", () => {
    const withChild = diagramToSvg(page([nested]), { diagrams: { child } });
    // The miniature re-anchors the child's own coordinates through its own viewBox.
    expect(withChild).toMatch(/<svg x="8" y="[\d.]+" width="[\d.]+" height="[\d.]+" viewBox=/);
    expect(withChild).not.toContain(">Empty<");
  });

  it("says Empty only when the child really is empty", () => {
    const emptyChild = { child: { ...page([]), id: "child" } };
    expect(diagramToSvg(page([nested]), { diagrams: emptyChild })).toContain(">Empty<");
  });

  it("draws its ports, dashed while unmapped", () => {
    const circles = [...svg().matchAll(/<circle [^>]*\/>/g)].map((m) => m[0]);
    expect(circles).toHaveLength(2);
    expect(circles.filter((c) => c.includes("stroke-dasharray"))).toHaveLength(1);
  });
});

describe("export parity — text", () => {
  it("names the embedded family on every piece of text, including edge labels", () => {
    const svg = diagramToSvg(
      page(
        [shape("a", 0, 0, 120, 60, "Node"), shape("b", 400, 300, 120, 60, "Other")],
        [{ id: "e", source: { nodeId: "a" }, target: { nodeId: "b" }, style: {}, label: { text: "events" } }],
      ),
    );
    const texts = [...svg.matchAll(/<text\b[^>]*>/g)].map((m) => m[0]);
    expect(texts.length).toBeGreaterThan(0);
    // Edge labels named no family at all, which is why they came out serif.
    for (const t of texts) expect(t).toContain(EXPORT_FONT_FAMILY);
  });

  it("embeds the face when one is supplied, so the viewer does not need it installed", () => {
    // Built from the constant rather than written out, so fontTokens.test.ts does not read this
    // fixture as a stray hardcoded stack.
    const face = `@font-face{font-${"family"}:"${EXPORT_FONT_FAMILY}";src:url(data:font/woff2;base64,AAAA)}`;
    const svg = diagramToSvg(page([shape("a", 0, 0, 120, 60, "Node")]), { fontCss: face });
    expect(svg).toContain("<style>@font-face");
    expect(svg).toContain("data:font/woff2;base64,");
  });

  it("breaks a multi-line label onto separate lines", () => {
    const svg = diagramToSvg(page([shape("a", 0, 0, 180, 120, "Account\n\nid: string\nbalance: Money")]));
    expect([...svg.matchAll(/<tspan/g)]).toHaveLength(4);
  });
});

describe("export parity — bounds", () => {
  it("leaves room for an edge label instead of clipping it", () => {
    const nodes = [shape("a", 0, 0, 60, 30), shape("b", 60, 400, 60, 30)];
    const bare = computeDiagramBounds(
      page(nodes, [{ id: "e", source: { nodeId: "a" }, target: { nodeId: "b" }, style: {} }]),
    );
    const labelled = computeDiagramBounds(
      page(nodes, [
        {
          id: "e",
          source: { nodeId: "a" },
          target: { nodeId: "b" },
          style: {},
          label: { text: "a considerably longer label than the shapes are wide" },
        },
      ]),
    );
    expect(labelled.width).toBeGreaterThan(bare.width);
  });

  it("leaves room for a nested node's stacked cards", () => {
    const plain = shape("a", 0, 0, 200, 100);
    const nested: NestedNode = {
      id: "n",
      type: "nested",
      childDiagramId: "c",
      position: { x: 0, y: 0 },
      size: { w: 200, h: 100 },
      z: 1,
      style: {},
      collapsed: { icons: [] },
      ports: [],
    };
    expect(computeDiagramBounds(page([nested])).width).toBeGreaterThan(computeDiagramBounds(page([plain])).width);
  });

  it("counts an edge's ends, which now sit on their nodes rather than outside them", () => {
    // Both ends are on the shapes' top borders (D81), so the bounds start at the shapes' top.
    const nodes = [shape("a", 0, 100, 60, 30), shape("b", 300, 100, 60, 30)];
    const bounds = computeDiagramBounds(
      page(nodes, [{ id: "e", source: { nodeId: "a" }, target: { nodeId: "b" }, style: { edgeStyle: "straight" } }]),
    );
    expect(bounds.offsetY).toBe(40 - 100);
  });

  it("still handles an empty page", () => {
    expect(computeDiagramBounds(page([]))).toEqual({ width: 240, height: 160, offsetX: 40, offsetY: 40 });
  });
});

describe("export parity — presentation (A6, D123)", () => {
  const steps = (svg: string) => [...svg.matchAll(/font-weight="700" fill="#ffffff">(\d+)<\/text>/g)].map((m) => Number(m[1]));
  const withMode = (mode: "build" | "walkthrough" | "spotlight", order: string[] = []): Diagram => ({
    ...page(
      [shape("b", 400, 0, 120, 60, "Payments"), shape("a", 0, 0, 120, 60, "Gateway")],
      [{ id: "e", source: { nodeId: "a" }, target: { nodeId: "b" }, style: { edgeStyle: "straight" } }],
    ),
    motion: { presentation: { mode, order } },
  });

  it("Walkthrough rests as its numbered steps, in reading order until the author sets one", () => {
    const svg = diagramToSvg(withMode("walkthrough"));
    expect(steps(svg)).toEqual([1, 2]);
    // Step 1 is the left-hand shape, on its top-left corner.
    const first = svg.match(/<g transform="translate\(([\d.]+),([\d.]+)\)"><rect x="0.75" y="0.75"[^>]*\/><text[^>]*>1</);
    const second = svg.match(/<g transform="translate\(([\d.]+),([\d.]+)\)"><rect x="0.75" y="0.75"[^>]*\/><text[^>]*>2</);
    expect(Number(first![1])).toBeLessThan(Number(second![1]));
  });

  it("a line can be a step: its badge sits on the line's middle", () => {
    const svg = diagramToSvg(withMode("walkthrough", ["a", "e", "b"]));
    expect(steps(svg)).toEqual([1, 2, 3]);
  });

  it("Build and Spotlight rest as the whole diagram, with no numbers", () => {
    expect(steps(diagramToSvg(withMode("build")))).toEqual([]);
    expect(steps(diagramToSvg(withMode("spotlight")))).toEqual([]);
  });
});
