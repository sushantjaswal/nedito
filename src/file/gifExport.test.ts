// Animated GIF export (G1, D131): which moments the frames show, and that each frame is the
// ordinary export drawn at that moment — valid SVG, the canvas's own rules paused at t.
import { describe, expect, it } from "vitest";
import { createDefaultLayers } from "../model/layers";
import type { DEdge, Diagram, DNode, ShapeNode } from "../model/types";
import { frameCss } from "./motionFrameCss";
import { frameAt, gifPlan, GIF_FRAME_MS, GIF_LOOP_S, GIF_MAX_FRAMES, moves } from "./gifExport";
import { diagramToSvg } from "./svgExport";

const box = (id: string, x: number, y: number, extra: Partial<ShapeNode> = {}): ShapeNode => ({
  id,
  type: "shape",
  shapeRef: "general/rect",
  position: { x, y },
  size: { w: 120, h: 60 },
  z: 1,
  style: {},
  ...extra,
});

function page(nodes: DNode[], edges: DEdge[] = [], motion?: Diagram["motion"]): Diagram {
  return { id: "d", title: "Page", layers: createDefaultLayers(), nodes, edges, ...(motion ? { motion } : {}) };
}

const line = (id: string, from: string, to: string, motion?: DEdge["motion"]): DEdge => ({
  id,
  source: { nodeId: from },
  target: { nodeId: to },
  style: { edgeStyle: "straight" },
  ...(motion ? { motion } : {}),
});

const valid = (svg: string) => new DOMParser().parseFromString(svg, "image/svg+xml").querySelector("parsererror") === null;

describe("what moves", () => {
  it("a still diagram is one frame; any motion, icon or presentation is a loop", () => {
    const still = page([box("a", 0, 0), box("b", 300, 0)], [line("e", "a", "b")]);
    expect(moves(still)).toBe(false);
    expect(gifPlan(still).times).toEqual([0]);
    expect(moves(page([box("a", 0, 0), box("b", 300, 0)], [line("e", "a", "b", { kind: "flow" })]))).toBe(true);
    expect(moves(page([box("a", 0, 0, { motion: { pulse: {} } })]))).toBe(true);
    expect(moves(page([box("a", 0, 0, { motion: { health: "healthy" } })]))).toBe(false);
    expect(moves(page([box("a", 0, 0, { shapeRef: "animated/processing" })]))).toBe(true);
    expect(moves(page([box("a", 0, 0)], [], { presentation: { mode: "build", order: [] } }))).toBe(true);
  });

  it("continuous motion loops for one whole cycle of every icon, 25 frames a second", () => {
    expect(GIF_FRAME_MS).toBe(40);
    const plan = gifPlan(page([box("a", 0, 0, { motion: { pulse: {} } })]));
    expect(plan.frameMs).toBe(GIF_FRAME_MS);
    expect(plan.times).toHaveLength(Math.round((GIF_LOOP_S * 1000) / GIF_FRAME_MS));
  });

  it("a long animation keeps its length with fewer frames a second, never more than the cap", () => {
    const nodes = Array.from({ length: 10 }, (_, i) => box(`n${i}`, i * 200, 0));
    const plan = gifPlan(page(nodes, [], { presentation: { mode: "spotlight", order: [] } }));
    expect(plan.times.length).toBeLessThanOrEqual(GIF_MAX_FRAMES);
    // In whole hundredths of a second, as the GIF stores each frame's time.
    expect(plan.frameMs % 10).toBe(0);
    expect(plan.times[plan.times.length - 1] + plan.frameMs / 1000).toBeCloseTo(26, 0);
  });
});

describe("frames of a presentation", () => {
  const three = [box("a", 0, 0), box("b", 300, 0), box("c", 600, 0)];

  it("Build shows the steps arriving, and the whole diagram by the end", () => {
    const d = page(three, [line("ab", "a", "b")], { presentation: { mode: "build", order: [] } });
    expect([...frameAt(d, 0).hidden!].sort()).toEqual(["a", "ab", "b", "c"]);
    expect(frameAt(d, 0.5).hidden!.has("a")).toBe(false);
    const plan = gifPlan(d);
    expect(frameAt(d, plan.times[plan.times.length - 1]).hidden!.size).toBe(0);
  });

  it("Spotlight lights one step at a time", () => {
    const d = page(three, [], { presentation: { mode: "spotlight", order: [] } });
    expect(frameAt(d, 0).lit!.nodes).toEqual(new Set(["a"]));
    expect(frameAt(d, 2.7).lit!.nodes).toEqual(new Set(["b"]));
  });

  it("Walkthrough's dot starts at the first step and travels to the next", () => {
    const d = page(three, [], { presentation: { mode: "walkthrough", order: [] } });
    expect(frameAt(d, 0).walkDot).toEqual({ x: 60, y: 30 });
    const later = frameAt(d, 1.2).walkDot!;
    expect(later.x).toBeGreaterThan(60);
    expect(later.y).toBeCloseTo(30);
  });
});

describe("a frame", () => {
  const d = page(
    [box("a", 0, 0, { motion: { pulse: { ripple: true }, health: "down" }, shapeRef: "general/diamond" }), box("b", 300, 0), box("c", 600, 0)],
    [line("ab", "a", "b", { kind: "flow" }), line("bc", "b", "c", { kind: "packets" })],
  );

  it("is valid SVG carrying the canvas's own rules, paused at its moment, with nothing that would break the markup", () => {
    const svg = diagramToSvg(d, { frame: { t: 0.5 } });
    expect(valid(svg)).toBe(true);
    expect(svg).toContain("<![CDATA[");
    expect(svg).toContain("@keyframes nd-flow");
    expect(svg).toContain("animation-play-state:paused");
    expect(svg).toContain(".nd-anim{animation-delay:-0.5s!important}");
    // Flow marches by the canvas's rule; Pulse glows and ripples on the diamond's own outline.
    expect(svg).toMatch(/class="nd-anim nd-flow" style="--nd-flow-shift:/);
    expect(svg).toContain("nd-outline-glow");
    expect(svg).toContain("nd-ripple nd-outline-svg");
    expect(svg).toContain('class="nd-anim nd-health-blink" data-health="down"');
  });

  it("moves the packet from one moment to the next", () => {
    const dot = (t: number) => diagramToSvg(d, { frame: { t } }).match(/<circle cx="([\d.]+)" cy="([\d.]+)" r="[\d.]+" fill=/)!.slice(1, 3).join(",");
    expect(dot(0.1)).not.toBe(dot(0.9));
  });

  it("keeps each late starter's lateness: an icon part due 0.45s in is 0.45s behind", () => {
    const css = frameCss(1);
    expect(css).toContain(".nd-ic-later.nd-anim{animation-delay:-0.55s!important}");
    expect(css).not.toContain("prefers-reduced-motion");
    expect(css).not.toMatch(/\/\*/);
  });

  it("leaves Build's hidden steps out and steps Spotlight's others back", () => {
    const svg = diagramToSvg(page([box("a", 0, 0), box("b", 300, 0)]), { annotateIds: true, frame: { t: 0, hidden: new Set(["b"]) } });
    expect(svg).toContain('data-node-id="a"');
    expect(svg).not.toContain('data-node-id="b"');
    const lit = diagramToSvg(page([box("a", 0, 0), box("b", 300, 0)]), { annotateIds: true, frame: { t: 0, lit: { nodes: new Set(["a"]), edges: new Set() } } });
    expect(lit).toMatch(/<g opacity="0.15"><g data-node-id="b"/);
  });

  it("is not what a still export draws: without a frame, nothing moves and no rules are carried", () => {
    const svg = diagramToSvg(d);
    expect(svg).not.toContain("nd-anim");
    expect(svg).not.toContain("<style>");
  });
});
