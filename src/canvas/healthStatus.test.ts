// Health (A4, D120): the badge an export draws — one colour and one symbol per state.
import { describe, expect, it } from "vitest";
import { HEALTH_HEX, HEALTH_SYMBOL, healthBadgeSvg, healthCentre } from "./healthStatus";

describe("the Health badge", () => {
  it("sits on the shape's top-right corner", () => {
    expect(healthCentre({ x: 100, y: 50, w: 160 })).toEqual({ x: 257, y: 53 });
  });

  it("each state has its own colour and its own symbol, so it never rests on colour alone", () => {
    expect(new Set(Object.values(HEALTH_HEX)).size).toBe(3);
    expect(new Set(Object.values(HEALTH_SYMBOL)).size).toBe(3);
    for (const state of ["healthy", "degraded", "down"] as const) {
      const svg = healthBadgeSvg(state, { x: 20, y: 20 });
      expect(svg).toContain(`fill="${HEALTH_HEX[state]}"`);
      expect(svg).toContain(`d="${HEALTH_SYMBOL[state]}"`);
      // The white ring that marks it as drawn, not live.
      expect(svg).toContain('stroke="#ffffff" stroke-width="1.5"');
    }
  });
});
