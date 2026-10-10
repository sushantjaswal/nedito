// The GIF size choice (G3, D141): three longest sides, scaled down to fit, never up; remembered.
import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_GIF_SIZE, GIF_SIZES, gifPixels, maxSideOf, readGifSize, writeGifSize } from "./gifSize";

describe("GIF sizes", () => {
  afterEach(() => localStorage.clear());

  it("are 600, 900, 1200 and 2400 pixels on the longest side, Large until changed", () => {
    expect(GIF_SIZES.map((s) => s.maxSide)).toEqual([600, 900, 1200, 2400]);
    expect(readGifSize()).toBe(DEFAULT_GIF_SIZE);
    expect(maxSideOf(DEFAULT_GIF_SIZE)).toBe(1200);
  });

  it("scale a picture to fit, keeping its shape, and up to twice its own size (D143)", () => {
    expect(gifPixels({ width: 2400, height: 1200 }, 600)).toEqual({ w: 600, h: 300 });
    expect(gifPixels({ width: 800, height: 1600 }, 900)).toEqual({ w: 450, h: 900 });
    // A small diagram gains detail at a larger size, up to twice its own...
    expect(gifPixels({ width: 500, height: 200 }, 900)).toEqual({ w: 900, h: 360 });
    // ...and no further.
    expect(gifPixels({ width: 500, height: 200 }, 2400)).toEqual({ w: 1000, h: 400 });
  });

  it("remember the last choice, and ignore anything that is not one", () => {
    writeGifSize("small");
    expect(readGifSize()).toBe("small");
    localStorage.setItem([...Object.keys(localStorage)][0], "huge");
    expect(readGifSize()).toBe(DEFAULT_GIF_SIZE);
  });
});

describe("GIF frame rates (G4, D142)", () => {
  afterEach(() => localStorage.clear());

  it("are Smooth at 25 frames a second and Lighter at 12.5, Smooth until changed, remembered", async () => {
    const { GIF_RATES, readGifRate, writeGifRate, frameMsOf, DEFAULT_GIF_RATE } = await import("./gifSize");
    expect(GIF_RATES.map((r) => r.frameMs)).toEqual([40, 80]);
    expect(readGifRate()).toBe(DEFAULT_GIF_RATE);
    expect(frameMsOf(DEFAULT_GIF_RATE)).toBe(40);
    writeGifRate("light");
    expect(readGifRate()).toBe("light");
  });

  it("a lighter rate keeps the loop's length with half the frames", async () => {
    const { gifPlan } = await import("./gifExport");
    const { createDefaultLayers } = await import("../model/layers");
    const d = {
      id: "d",
      title: "P",
      layers: createDefaultLayers(),
      nodes: [{ id: "a", type: "shape" as const, shapeRef: "general/rect", position: { x: 0, y: 0 }, size: { w: 100, h: 50 }, z: 1, style: {}, motion: { pulse: {} } }],
      edges: [],
    };
    const smooth = gifPlan(d, 40);
    const light = gifPlan(d, 80);
    expect(light.frameMs).toBe(80);
    expect(light.times.length * 2).toBe(smooth.times.length);
    expect(light.times.length * light.frameMs).toBe(smooth.times.length * smooth.frameMs);
  });
});
