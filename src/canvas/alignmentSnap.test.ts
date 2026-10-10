import { describe, expect, it } from "vitest";
import { computeSnap } from "./alignmentSnap";

describe("computeSnap", () => {
  it("snaps left edges when within threshold", () => {
    const dragged = { x: 103, y: 500, w: 100, h: 50 };
    const others = [{ x: 100, y: 0, w: 100, h: 50 }];
    const result = computeSnap(dragged, others);
    expect(result.dx).toBe(-3);
    expect(result.verticalGuideX).toBe(100);
  });

  it("snaps centers when centers are the closest match", () => {
    const dragged = { x: 148, y: 500, w: 100, h: 50 }; // center at 198
    const others = [{ x: 150, y: 0, w: 100, h: 50 }]; // center at 200
    const result = computeSnap(dragged, others);
    expect(result.dx).toBe(2);
  });

  it("does not snap when nothing is within threshold", () => {
    const dragged = { x: 500, y: 500, w: 100, h: 50 };
    const others = [{ x: 0, y: 0, w: 100, h: 50 }];
    const result = computeSnap(dragged, others);
    expect(result.dx).toBe(0);
    expect(result.dy).toBe(0);
    expect(result.verticalGuideX).toBeUndefined();
  });

  it("snaps y independently of x", () => {
    const dragged = { x: 500, y: 202, w: 100, h: 50 };
    const others = [{ x: 0, y: 200, w: 100, h: 50 }];
    const result = computeSnap(dragged, others);
    expect(result.dy).toBe(-2);
    expect(result.horizontalGuideY).toBe(200);
    expect(result.dx).toBe(0);
  });
});
