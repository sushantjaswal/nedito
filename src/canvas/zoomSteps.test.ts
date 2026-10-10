import { describe, expect, it } from "vitest";
import { nextSteppedZoom } from "./zoomSteps";

describe("nextSteppedZoom", () => {
  it("steps up/down by 25 percentage points from a value already on the grid", () => {
    expect(nextSteppedZoom(1.0, 1)).toBeCloseTo(1.25);
    expect(nextSteppedZoom(1.0, -1)).toBeCloseTo(0.75);
  });

  it("from an off-grid zoom, moves to the nearest grid line in the requested direction", () => {
    expect(nextSteppedZoom(1.37, 1)).toBeCloseTo(1.5); // up to next line above
    expect(nextSteppedZoom(1.37, -1)).toBeCloseTo(1.25); // down to next line below
  });

  it("jumps a continuous-zoom value below the step floor up to 25% on zoom-in", () => {
    expect(nextSteppedZoom(0.1, 1)).toBeCloseTo(0.25);
  });

  it("clamps at the 25% floor and 400% ceiling", () => {
    expect(nextSteppedZoom(0.25, -1)).toBeCloseTo(0.25);
    expect(nextSteppedZoom(4.0, 1)).toBeCloseTo(4.0);
  });
});
