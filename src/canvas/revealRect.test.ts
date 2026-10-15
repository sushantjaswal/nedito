// revealRect has two jobs now, and the first one must not have noticed the second arriving.
//
// Without `reserve` it pans at the zoom it has and does nothing when the rect is already in view —
// what every existing caller has always relied on. With `reserve` it frames: fits the rect into
// whatever part of the canvas is left once a note's card and the pager have taken theirs.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { revealRect, setCanvasInstance, type CanvasApi } from "./canvasApi";

const CANVAS = { width: 1000, height: 600 };

let viewport = { x: 0, y: 0, zoom: 1 };
let setViewport: ReturnType<typeof vi.fn>;

beforeEach(() => {
  viewport = { x: 0, y: 0, zoom: 1 };
  setViewport = vi.fn((v: typeof viewport) => void (viewport = v));
  const canvas = document.createElement("div");
  canvas.setAttribute("data-testid", "nd-canvas");
  canvas.getBoundingClientRect = () => ({ ...CANVAS, x: 0, y: 0, top: 0, left: 0, right: CANVAS.width, bottom: CANVAS.height, toJSON: () => "" });
  document.body.append(canvas);
  setCanvasInstance({
    getViewport: () => viewport,
    setViewport,
    fitView: vi.fn(),
    screenToFlowPosition: (p: { x: number; y: number }) => p,
  } as unknown as CanvasApi);
});

afterEach(() => {
  setCanvasInstance(null);
  document.body.innerHTML = "";
});

/** Where a diagram rect lands on screen under the viewport the last call set. */
const onScreen = (rect: { x: number; y: number; w: number; h: number }) => ({
  left: rect.x * viewport.zoom + viewport.x,
  top: rect.y * viewport.zoom + viewport.y,
  right: (rect.x + rect.w) * viewport.zoom + viewport.x,
  bottom: (rect.y + rect.h) * viewport.zoom + viewport.y,
});

describe("without a reserve, exactly as before", () => {
  it("does nothing at all when the rect is already in view", () => {
    revealRect({ x: 100, y: 100, w: 100, h: 60 });
    expect(setViewport).not.toHaveBeenCalled();
  });

  it("pans just enough to bring an off-screen rect in, and never changes the zoom", () => {
    viewport = { x: 0, y: 0, zoom: 0.5 };
    revealRect({ x: 4000, y: 40, w: 100, h: 60 });
    expect(setViewport).toHaveBeenCalledTimes(1);
    expect(viewport.zoom).toBe(0.5);
    const box = onScreen({ x: 4000, y: 40, w: 100, h: 60 });
    expect(box.right).toBeLessThanOrEqual(CANVAS.width);
    expect(box.left).toBeGreaterThanOrEqual(0);
  });
});

describe("with a reserve, it frames", () => {
  const rect = { x: 0, y: 0, w: 400, h: 200 };

  it("keeps the reserved side clear, and centres the rect in what is left", () => {
    revealRect(rect, 40, { side: "right", px: 312 });
    const box = onScreen(rect);
    // Nothing of the rect reaches under the card.
    expect(box.right).toBeLessThanOrEqual(CANVAS.width - 312);
    // Centred in the part that is left: equal space either side of it.
    expect(box.left - 0).toBeCloseTo(CANVAS.width - 312 - box.right, 5);
  });

  it("does the same on the other side", () => {
    revealRect(rect, 40, { side: "left", px: 312 });
    const box = onScreen(rect);
    expect(box.left).toBeGreaterThanOrEqual(312);
    expect(box.left - 312).toBeCloseTo(CANVAS.width - box.right, 5);
  });

  it("keeps the foot clear for the pager", () => {
    revealRect(rect, 40, { bottomPx: 54 });
    expect(onScreen(rect).bottom).toBeLessThanOrEqual(CANVAS.height - 54);
  });

  it("moves even when the rect was already on screen, because under the card is not in view", () => {
    revealRect({ x: 10, y: 10, w: 50, h: 30 }, 40, { side: "right", px: 312 });
    expect(setViewport).toHaveBeenCalledTimes(1);
  });

  it("zooms out to fit something larger than the canvas", () => {
    const big = { x: 0, y: 0, w: 4000, h: 2000 };
    revealRect(big, 40, { side: "right", px: 312 });
    expect(viewport.zoom).toBeLessThan(1);
    const box = onScreen(big);
    expect(box.right).toBeLessThanOrEqual(CANVAS.width - 312);
    expect(box.bottom).toBeLessThanOrEqual(CANVAS.height);
  });

  it("does not zoom in past natural size for one small shape", () => {
    revealRect({ x: 0, y: 0, w: 60, h: 40 }, 40, { side: "right", px: 312 });
    // A note is read in context: throwing the reader to 400% would lose every landmark around it.
    expect(viewport.zoom).toBe(1);
  });

  it("stops at the canvas's zoom floor, and centres what cannot fit rather than going below it", () => {
    const enormous = { x: 0, y: 0, w: 2_000_000, h: 2_000_000 };
    revealRect(enormous, 40, { side: "right", px: 312 });
    // A diagram this large does not fit at 10%, and the canvas does not zoom out further; it is
    // centred in the space the card leaves, which is the most that can honestly be done.
    expect(viewport.zoom).toBe(0.1);
    const box = onScreen(enormous);
    expect((box.left + box.right) / 2).toBeCloseTo((CANVAS.width - 312) / 2, 5);
  });

  it("still frames something when the canvas is too small for the margins asked of it", () => {
    revealRect(rect, 400, { side: "right", px: 900 });
    expect(setViewport).toHaveBeenCalledTimes(1);
    expect(Number.isFinite(viewport.x)).toBe(true);
    expect(viewport.zoom).toBeGreaterThan(0);
  });
});
