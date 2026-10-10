import { describe, expect, it } from "vitest";
import { outlineFromSvgBody } from "../../canvas/shapeOutline";
import { loadSection } from "./index";

describe("General's Half Circle", () => {
  it("is a true semicircle at its default size, filling its box from top to bottom", async () => {
    const section = await loadSection("general");
    const half = section!.shapes.find((s) => s.id === "general/half-circle")!;
    const { w, h } = half.defaultSize;
    expect(w).toBe(2 * h);

    // The outline in the stencil's 0..100 space, stretched to the box as the canvas stretches it.
    const points = outlineFromSvgBody(half.svgBody)!.map((p) => ({ x: (p.x * w) / 100, y: (p.y * h) / 100 }));
    const ys = points.map((p) => p.y);
    expect(Math.min(...ys)).toBeCloseTo(0.02 * h, 0); // the dome reaches the top of the box…
    expect(Math.max(...ys)).toBeCloseTo(0.98 * h, 0); // …and the flat edge sits at the bottom

    // Every point on the curve is one radius from the middle of the flat edge: a circle, not an
    // ellipse.
    const centre = { x: w / 2, y: 0.98 * h };
    const radius = 0.48 * w;
    for (const p of points.filter((q) => q.y < centre.y - 0.5)) {
      expect(Math.hypot(p.x - centre.x, p.y - centre.y)).toBeCloseTo(radius, 0);
    }
  });
});
