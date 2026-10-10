import { describe, expect, it } from "vitest";
import { expandLines, headSize } from "./lineBody";
import { fitStencilBody } from "./fitBody";

const PAINT = { stroke: "#ff0000", strokeWidth: 1 };

/** The transform of the first arrowhead group, as numbers. */
function headTransform(svg: string) {
  const t = /<g transform="translate\(([-\d.]+) ([-\d.]+)\) scale\(([-\d.]+) ([-\d.]+)\) rotate\(([-\d.]+)\) scale\(([-\d.]+)\)/.exec(svg);
  if (!t) throw new Error(`no head in ${svg}`);
  const [, tx, ty, ux, uy, deg, s] = t.map(Number);
  return { tx, ty, ux, uy, deg, s };
}

describe("expandLines", () => {
  it("leaves a body without line elements untouched", () => {
    const body = '<rect x="1" y="1" width="98" height="98" />';
    expect(expandLines(body, 200, 50, PAINT)).toBe(body);
  });

  it("draws a plain line as an unfilled line", () => {
    expect(expandLines('<nd-line points="0,50 100,50" />', 160, 40, PAINT)).toBe('<line x1="0" y1="50" x2="100" y2="50" fill="none" />');
  });

  // The point of the element: a head authored in 0..100 units was squashed flat on a long thin
  // box. Undoing the stretch inside the head's own transform keeps it at true proportions.
  it("draws the arrowhead at true proportions however the line is stretched", () => {
    for (const [w, h] of [
      [160, 40],
      [600, 10],
      [40, 300],
    ]) {
      const t = headTransform(expandLines('<nd-line points="0,50 100,50" end="classic" />', w, h, PAINT));
      expect(t.ux * (w / 100)).toBeCloseTo(1);
      expect(t.uy * (h / 100)).toBeCloseTo(1);
      expect(t.s).toBeCloseTo(headSize(1) / 10);
      expect([t.tx, t.ty]).toEqual([100, 50]);
    }
  });

  it("points each head along its end of the line, in screen space", () => {
    const right = headTransform(expandLines('<nd-line points="0,50 100,50" end="classic" />', 160, 40, PAINT));
    expect(right.deg).toBeCloseTo(0);
    const left = headTransform(expandLines('<nd-line points="0,50 100,50" start="classic" />', 160, 40, PAINT));
    expect(Math.abs(left.deg)).toBeCloseTo(180);
    // A diagonal across a wide box is shallow on screen, not 45°.
    const diag = headTransform(expandLines('<nd-line points="0,100 100,0" end="classic" />', 300, 100, PAINT));
    expect(diag.deg).toBeCloseTo((Math.atan2(-100, 300) * 180) / Math.PI);
  });

  it("stops the line inside a closed head rather than running to its tip", () => {
    const svg = expandLines('<nd-line points="0,50 100,50" end="classic" />', 100, 40, PAINT);
    const x2 = Number(/x2="([-\d.]+)"/.exec(svg)![1]);
    expect(x2).toBeLessThan(100);
    expect(x2).toBeCloseTo(100 - (2 * headSize(1)) / 10);
  });

  it("fills a solid head with the line's colour and a hollow one with paper", () => {
    expect(expandLines('<nd-line points="0,50 100,50" end="classic" />', 100, 40, PAINT)).toContain('fill="#ff0000" stroke="none"');
    const hollow = expandLines('<nd-line points="0,50 100,50" end="triangle" />', 100, 40, PAINT);
    expect(hollow).toContain('fill="#ffffff" stroke="#ff0000"');
  });

  it("never dashes an arrowhead, even on a dashed line", () => {
    expect(expandLines('<nd-line points="0,50 100,50" end="triangle" />', 100, 40, PAINT)).toContain('stroke-dasharray="none"');
  });

  it("draws a curve as a cubic path and an elbow as a polyline", () => {
    expect(expandLines('<nd-line points="0,90 55,90 45,10 100,10" curve="1" />', 160, 80, PAINT)).toMatch(/^<path d="M0,90 C55,90 45,10 100,10" fill="none" \/>$/);
    expect(expandLines('<nd-line points="0,10 50,10 50,90 100,90" />', 160, 80, PAINT)).toContain('<polyline points="0,10 50,10 50,90 100,90"');
  });

  it("draws a double line as two strokes a fixed pixel gap apart", () => {
    const svg = expandLines('<nd-line points="0,50 100,50" double="1" />', 160, 40, PAINT);
    const ys = [...svg.matchAll(/y1="([-\d.]+)"/g)].map((m) => Number(m[1]));
    expect(ys).toHaveLength(2);
    // 2.5px either side of centre, in a 40px-tall box.
    expect(Math.abs(ys[0] - ys[1]) * 0.4).toBeCloseTo(5);
  });

  it("ignores an arrowhead it does not know", () => {
    expect(expandLines('<nd-line points="0,50 100,50" end="bogus" />', 100, 40, PAINT)).not.toContain("<g");
  });

  it("is applied by fitStencilBody, which keeps the line's stroke weight even", () => {
    const out = fitStencilBody('<nd-line points="0,50 100,50" />', 160, 40, PAINT);
    expect(out).toContain('<line x1="0" y1="50" x2="100" y2="50" fill="none"  vector-effect="non-scaling-stroke"');
  });
});
