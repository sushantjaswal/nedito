// Animated icons (D124): library entries found beside their still twins, each resting as its own
// meaningful frame — in a still export, in a miniature, and whenever motion is off.
import { describe, expect, it } from "vitest";
import { stencilMatches } from "../stencilSearch";
import { diagramToSvg } from "../../file/svgExport";
import { createDefaultLayers } from "../../model/layers";
import type { Diagram } from "../../model/types";
import { cacheStencils, getStencil, loadSection } from "./index";
import { ICON_TOKEN_HEX, resolveIconTokens, stillBody } from "./animatedBodies";
import { isIconStyleStencil } from "./defaultStyle";

/** The Animated section, and every shape in the sections its still twins live in. */
async function sections() {
  const animated = (await loadSection("animated"))!;
  cacheStencils(animated.shapes);
  const others = [];
  for (const id of ["misc", "network", "arrows", "c4", "business"] as const) {
    const section = (await loadSection(id))!;
    cacheStencils(section.shapes);
    others.push(...section.shapes);
  }
  return { animated, others };
}

describe("the Animated section", () => {
  it("gives every animated icon a still twin that exists and is offered in the picker", async () => {
    const { animated } = await sections();
    expect(animated.shapes.length).toBeGreaterThan(0);
    for (const icon of animated.shapes) {
      const twin = getStencil(icon.animated!.still);
      expect(twin, `${icon.id}'s still twin ${icon.animated!.still}`).toBeDefined();
      expect(twin!.hidden).toBeFalsy();
      // The icon is a pictogram; its twin may be one, or an outline shape (Database, Message Queue).
      expect(isIconStyleStencil(icon)).toBe(true);
    }
  });

  it("a twin drawn for it is the same drawing at rest", async () => {
    const { animated } = await sections();
    for (const icon of animated.shapes) {
      const twin = getStencil(icon.animated!.still)!;
      if (twin.pictogram) expect(twin.svgBody, twin.id).toBe(stillBody(icon.svgBody));
    }
  });

  it.each([
    ["processing", ["animated/processing", "misc/settings"]],
    ["scaling", ["animated/scaling-out", "misc/scale-out"]],
    ["retry", ["animated/retrying", "misc/retry"]],
    ["running", ["animated/running", "misc/run"]],
    ["database", ["animated/writes", "network/database"]],
    ["sync", ["animated/replicating", "arrows/sync"]],
    ["queue", ["animated/queue", "c4/queue"]],
    ["stream", ["animated/streaming", "misc/stream"]],
    ["upload", ["animated/uploading", "misc/upload"]],
    ["load balancer", ["animated/load-balancing", "network/load-balancer"]],
    ["traffic", ["animated/live-traffic", "misc/traffic"]],
    ["bolt", ["animated/cache-hit", "misc/bolt"]],
    ["healthy", ["animated/healthy", "misc/healthy"]],
    ["warning", ["animated/degraded", "misc/warning"]],
    ["error", ["animated/down", "misc/error"]],
    ["heartbeat", ["animated/heartbeat", "misc/heartbeat"]],
    ["schedule", ["animated/scheduled", "business/schedule"]],
    ["shield", ["animated/protected", "network/security"]],
    ["animated", ["animated/processing", "animated/running", "animated/scaling-out", "animated/retrying"]],
  ])("search for %s finds the animated icon beside its still twin", async (q, ids) => {
    const { animated, others } = await sections();
    const found = [...others, ...animated.shapes].filter((s) => !s.hidden && stencilMatches(s, q)).map((s) => s.id);
    for (const id of ids) expect(found).toContain(id);
  });

  it("moves only through nd-anim classes, which every motion switch stops", async () => {
    const { animated } = await sections();
    for (const icon of animated.shapes) {
      expect(icon.svgBody, icon.id).toMatch(/class="nd-anim /);
      // Nothing is hidden at rest: the pose is the markup, so no part starts invisible.
      expect(icon.svgBody, icon.id).not.toMatch(/opacity="0"|display="none"|visibility="hidden"/);
      expect(stillBody(icon.svgBody)).not.toContain("nd-anim");
    }
  });

  it("hardcodes no colour: line work is currentColor, accents are tokens", async () => {
    const { animated } = await sections();
    for (const icon of animated.shapes) {
      expect(icon.svgBody, icon.id).not.toMatch(/#[0-9a-f]{3,6}\b/i);
      for (const m of icon.svgBody.matchAll(/(?:fill|stroke)="([^"]+)"/g)) {
        expect(["none", "currentColor"].includes(m[1]) || /^var\(--nd-icon-[a-z]+\)$/.test(m[1]), `${icon.id}: ${m[1]}`).toBe(true);
      }
    }
  });
});

describe("a still export", () => {
  const page = (shapeRef: string, style = {}): Diagram => ({
    id: "d",
    title: "Page",
    layers: createDefaultLayers(),
    nodes: [{ id: "n", type: "shape", shapeRef, position: { x: 0, y: 0 }, size: { w: 48, h: 48 }, z: 1, style }],
    edges: [],
  });

  it("draws each icon at rest: no animation classes, no unresolved variables, the line work in the fill", async () => {
    const { animated } = await sections();
    for (const icon of animated.shapes) {
      const svg = diagramToSvg(page(icon.id, { fill: "#B4426A" }));
      expect(svg, icon.id).not.toContain("nd-anim");
      expect(svg, icon.id).not.toContain("var(");
      expect(svg, icon.id).toMatch(/fill="#B4426A" color="#B4426A"/);
    }
  });

  it("gives the accents their light-theme colours", () => {
    expect(resolveIconTokens('<path stroke="var(--nd-icon-accent)" /><circle fill="var(--nd-icon-ok)" />')).toBe(
      `<path stroke="${ICON_TOKEN_HEX["--nd-icon-accent"]}" /><circle fill="${ICON_TOKEN_HEX["--nd-icon-ok"]}" />`,
    );
    // Anything else is left alone.
    expect(resolveIconTokens('fill="var(--nd-color-ink)"')).toBe('fill="var(--nd-color-ink)"');
  });
});
