// D81: an edge ends on the shape's own outline, not at its handle or its bounding box.
import { beforeAll, describe, expect, it } from "vitest";
import { cacheStencils, getStencil, loadSection, type SectionId } from "../library/stencils";
import { isIconStyleStencil } from "../library/stencils/defaultStyle";
import type { ShapeNode } from "../model/types";
import { resolveHandleAnchor } from "./edgeRouting";
import { outlineFromSvgBody, pathOutline, pointOnOutline, stencilOutline } from "./shapeOutline";

const close = (a: number, b: number, tol = 0.6) => Math.abs(a - b) <= tol;

beforeAll(async () => {
  for (const id of ["general", "basic", "flowchart", "advanced"] as SectionId[]) {
    const s = await loadSection(id);
    if (s) cacheStencils(s.shapes);
  }
});

function node(shapeRef: string, w: number, h: number, rotation = 0): ShapeNode {
  return { id: "n", type: "shape", shapeRef, position: { x: 0, y: 0 }, size: { w, h }, z: 1, style: {}, rotation };
}

describe("where an edge meets a shape", () => {
  // The stencil draws its border 1% inside the box (x=1, width=98), and the edge meets the line
  // as drawn — which is what "touching" means on screen.
  it("meets a rectangle exactly on its drawn border", () => {
    const rect = node("general/rect", 160, 80);
    const box = { x: 0, y: 0, w: 160, h: 80 };
    const right = resolveHandleAnchor(rect, box, "right").point;
    expect(close(right.x, 160 * 0.99, 0.01) && right.y === 40).toBe(true);
    const top = resolveHandleAnchor(rect, box, "top").point;
    expect(close(top.y, 80 * 0.01, 0.01) && top.x === 80).toBe(true);
  });

  // The user's report: the arrow into a triangle stopped at the bounding box, in mid-air.
  it("meets a triangle on its slanted side, not its bounding box", () => {
    const tri = node("general/triangle", 120, 120);
    const p = resolveHandleAnchor(tri, { x: 0, y: 0, w: 120, h: 120 }, "left").point;
    expect(p.y).toBe(60);
    // Half way down an apex-up triangle, the left side is a quarter of the way across.
    expect(p.x).toBeGreaterThan(25);
    expect(p.x).toBeLessThan(35);
  });

  it("meets an ellipse on its curve, including from a corner handle", () => {
    const ell = node("general/ellipse", 200, 100);
    const box = { x: 0, y: 0, w: 200, h: 100 };
    const side = resolveHandleAnchor(ell, box, "left").point;
    expect(close(side.x, 2, 0.01) && close(side.y, 50)).toBe(true); // the curve, drawn 1% inside the box
    // A corner of the box is empty space; the edge must come in to the curve.
    const corner = resolveHandleAnchor(ell, box, "top-left").point;
    // The stencil's ellipse has radii of 49% of the box.
    const onCurve = ((corner.x - 100) / 98) ** 2 + ((corner.y - 50) / 49) ** 2;
    expect(close(onCurve, 1, 0.05)).toBe(true);
  });

  it("meets a diamond at its point", () => {
    const dia = node("general/diamond", 120, 80);
    const p = resolveHandleAnchor(dia, { x: 0, y: 0, w: 120, h: 80 }, "right").point;
    expect(close(p.x, 119, 2) && close(p.y, 40)).toBe(true);
  });

  // A square turned 45° pokes past its bounding box, so the handle's point on the box lies inside
  // the drawn shape. The edge must still reach the shape's outer corner, not stop inside it.
  it("follows a rotated shape's outline, even where it pokes past the box", () => {
    const sq = node("general/rect", 100, 100, 45);
    const p = resolveHandleAnchor(sq, { x: 0, y: 0, w: 100, h: 100 }, "right").point;
    // The drawn square is 98 wide, so its turned corner sits 49·√2 from the centre.
    expect(close(p.x, 50 + 49 * Math.SQRT2, 0.01)).toBe(true);
    expect(close(p.y, 50, 0.01)).toBe(true);
  });

  it("keeps a picture, a nested block or an icon at its bounding box", () => {
    const img = { ...node("image", 100, 50), imageId: "a" };
    expect(resolveHandleAnchor(img, { x: 0, y: 0, w: 100, h: 50 }, "right").point).toEqual({ x: 100, y: 25 });
  });
});

describe("reading an outline", () => {
  it("reads rect, circle, ellipse and polygon", () => {
    expect(outlineFromSvgBody('<rect x="1" y="2" width="98" height="96" />')).toHaveLength(4);
    expect(outlineFromSvgBody('<circle cx="50" cy="50" r="49" />')!.length).toBeGreaterThan(30);
    expect(outlineFromSvgBody('<ellipse cx="50" cy="50" rx="49" ry="30" />')!.length).toBeGreaterThan(30);
    expect(outlineFromSvgBody('<polygon points="50,2 98,98 2,98" />')).toEqual([
      { x: 50, y: 2 },
      { x: 98, y: 98 },
      { x: 2, y: 98 },
    ]);
  });

  it("reads the first subpath of a path, sampling arcs and curves", () => {
    const half = pathOutline("M 2,98 A 48,48 0 0 1 98,98 Z")!;
    expect(half.length).toBeGreaterThan(10);
    // The arc bulges up to y = 50 at its top.
    expect(Math.min(...half.map((p) => p.y))).toBeLessThan(51);
    const curve = pathOutline("M0,0 C 0,50 100,50 100,0 L 100,100 L 0,100 Z")!;
    expect(curve.length).toBeGreaterThan(10);
    // Relative commands and H/V.
    expect(pathOutline("m10,10 h80 v80 h-80 z")).toEqual([
      { x: 10, y: 10 },
      { x: 90, y: 10 },
      { x: 90, y: 90 },
      { x: 10, y: 90 },
    ]);
  });

  it("gives up on anything that is not a plain first shape", () => {
    expect(outlineFromSvgBody('<g transform="matrix(1,0,0,1,0,0)"><path d="M0,0 L1,1"/></g>')).toBeNull();
    expect(outlineFromSvgBody("<text>hi</text>")).toBeNull();
  });

  it("falls back to the start point when a ray meets nothing", () => {
    const from = { x: 5, y: 5 };
    expect(pointOnOutline({ x: 0, y: 0, w: 10, h: 10 }, [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }], 0, from)).toEqual(
      pointOnOutline({ x: 0, y: 0, w: 10, h: 10 }, [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }], 0, from),
    );
  });
});

// Every outline shape in the main sections: the anchor for each side lands inside the box and on
// the shape's outline, never past it. A stencil whose outline reads wrongly fails here, by name.
describe("every authored shape", () => {
  it("anchors every side on its outline, inside its box", async () => {
    const problems: string[] = [];
    for (const section of ["general", "basic", "flowchart", "advanced"] as SectionId[]) {
      const s = await loadSection(section);
      for (const stencil of s!.shapes) {
        if (!getStencil(stencil.id)) continue;
        const outline = stencilOutline(stencil, isIconStyleStencil(stencil));
        const box = { x: 0, y: 0, w: 120, h: 80 };
        for (const side of ["top", "right", "bottom", "left"]) {
          const p = resolveHandleAnchor(node(stencil.id, 120, 80), box, side).point;
          const inside = p.x >= -0.01 && p.x <= 120.01 && p.y >= -0.01 && p.y <= 80.01;
          if (!inside) problems.push(`${stencil.id} ${side}: (${p.x.toFixed(1)}, ${p.y.toFixed(1)}) outside its box`);
        }
        if (outline) {
          for (const p of outline) {
            if (p.x < -1 || p.x > 101 || p.y < -1 || p.y > 101) {
              problems.push(`${stencil.id}: outline point (${p.x}, ${p.y}) outside 0..100`);
              break;
            }
          }
        }
      }
    }
    expect(problems).toEqual([]);
  });
});

describe("a fixed connection point", () => {
  it("ends exactly at the point, not on the outline, and leaves through the nearest side", () => {
    // A lifeline's outline is its head box; a message must meet the stem at its own height.
    const lifeline = node("general/rect", 100, 400);
    const a = resolveHandleAnchor(lifeline, { x: 10, y: 20, w: 100, h: 400 }, "right", { x: 0.5, y: 0.4 });
    expect(a.point).toEqual({ x: 60, y: 180 });
    expect(a.position).toBe("left");
    const b = resolveHandleAnchor(lifeline, { x: 0, y: 0, w: 100, h: 400 }, "left", { x: 0.9, y: 0.5 });
    expect(b.position).toBe("right");
  });
});
