import { describe, expect, it } from "vitest";
import { buildOrthogonalPolyline, buildStraightPolyline, centroid, nearestSegmentIndex, pathMidpoint } from "./edgeGeometry";

describe("centroid", () => {
  it("averages all points", () => {
    expect(centroid([{ x: 0, y: 0 }, { x: 10, y: 20 }])).toEqual({ x: 5, y: 10 });
  });
});

describe("buildStraightPolyline", () => {
  it("connects points with M/L commands", () => {
    expect(buildStraightPolyline([{ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 20, y: 0 }])).toBe(
      "M 0,0 L 10,10 L 20,0",
    );
  });
});

describe("buildOrthogonalPolyline", () => {
  it("keeps a single elbow between two axis-misaligned points", () => {
    const d = buildOrthogonalPolyline([{ x: 0, y: 0 }, { x: 100, y: 50 }]);
    expect(d).toBe("M 0,0 L 100,0 L 100,50");
  });

  it("skips the elbow when points already share an axis", () => {
    const d = buildOrthogonalPolyline([{ x: 0, y: 0 }, { x: 100, y: 0 }]);
    expect(d).toBe("M 0,0 L 100,0");
  });
});

describe("nearestSegmentIndex", () => {
  it("picks the closest of multiple segments", () => {
    const points = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }];
    expect(nearestSegmentIndex(points, { x: 50, y: 2 })).toBe(0);
    expect(nearestSegmentIndex(points, { x: 98, y: 50 })).toBe(1);
  });
});

describe("pathMidpoint", () => {
  it("is halfway along a straight line", () => {
    expect(pathMidpoint("M 0,0 L 100,0")).toEqual({ x: 50, y: 0 });
  });

  it("follows an elbow rather than cutting the corner", () => {
    // 100 across then 100 down: halfway is the corner itself, which the centroid (50,50) is not.
    expect(pathMidpoint("M 0,0 L 100,0 L 100,100")).toEqual({ x: 100, y: 0 });
  });

  it("lands on a curve", () => {
    const p = pathMidpoint("M0,0 C0,100 100,100 100,0")!;
    expect(p.x).toBeCloseTo(50, 1);
    expect(p.y).toBeCloseTo(75, 0);
  });
});
