// Reading a user's image into an asset (D79). Decoding and redrawing need a real browser and are
// covered end to end; everything that decides *what* happens is pure and tested here.
import { describe, expect, it } from "vitest";
import { assetProblem } from "../model/assets";
import {
  fitWithin,
  importImageFile,
  MAX_IMAGE_BYTES,
  MAX_IMAGE_EDGE,
  MAX_SOURCE_BYTES,
  outputPlan,
  sniffImageType,
  svgIntrinsicSize,
} from "./imageImport";

const bytes = (s: string) => Uint8Array.from(s, (c) => c.charCodeAt(0));
const PNG_1PX = Uint8Array.from(
  atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg=="),
  (c) => c.charCodeAt(0),
);
const file = (content: Uint8Array | string, name: string) =>
  Object.assign(new Blob([typeof content === "string" ? content : (content as BlobPart)]), { name });

describe("sniffImageType", () => {
  it("reads the format from the bytes", () => {
    expect(sniffImageType(PNG_1PX)).toBe("image/png");
    expect(sniffImageType(Uint8Array.of(0xff, 0xd8, 0xff, 0xe0))).toBe("image/jpeg");
    expect(sniffImageType(bytes("GIF89a...."))).toBe("image/gif");
    expect(sniffImageType(bytes("GIF87a...."))).toBe("image/gif");
    expect(sniffImageType(bytes("RIFF\0\0\0\0WEBPVP8 "))).toBe("image/webp");
  });

  it("recognises SVG however it opens", () => {
    expect(sniffImageType(bytes('<svg xmlns="http://www.w3.org/2000/svg"/>'))).toBe("image/svg+xml");
    // A UTF-8 BOM as a real file carries it (EF BB BF), then a declaration and a comment.
    const utf8 = new TextEncoder().encode('﻿  <?xml version="1.0"?>\n<!-- logo -->\n<svg width="10">');
    expect(Array.from(utf8.subarray(0, 3))).toEqual([0xef, 0xbb, 0xbf]);
    expect(sniffImageType(utf8)).toBe("image/svg+xml");
  });

  it("does not trust a name or a near miss", () => {
    expect(sniffImageType(bytes("RIFF\0\0\0\0WAVEfmt "))).toBeNull(); // a WAV, not a WebP
    expect(sniffImageType(bytes("<html><body>not a picture</body></html>"))).toBeNull();
    expect(sniffImageType(bytes("%PDF-1.7"))).toBeNull();
    expect(sniffImageType(new Uint8Array())).toBeNull();
  });
});

describe("svgIntrinsicSize", () => {
  it("uses absolute width and height", () => {
    expect(svgIntrinsicSize('<svg width="120" height="40px">')).toEqual({ width: 120, height: 40 });
  });

  it("falls back to the viewBox, keeping its proportions", () => {
    expect(svgIntrinsicSize('<svg viewBox="0 0 200 100">')).toEqual({ width: 200, height: 100 });
    expect(svgIntrinsicSize('<svg width="50" viewBox="0,0,200,100">')).toEqual({ width: 50, height: 25 });
  });

  it("ignores relative sizes, which give nothing to measure", () => {
    expect(svgIntrinsicSize('<svg width="100%" height="100%" viewBox="0 0 64 32">')).toEqual({ width: 64, height: 32 });
  });

  it("defaults to the browser's own 300×150 when the SVG says nothing", () => {
    expect(svgIntrinsicSize("<svg>")).toEqual({ width: 300, height: 150 });
  });
});

describe("fitWithin", () => {
  it(`leaves an image alone when its long edge is at most ${MAX_IMAGE_EDGE} px`, () => {
    expect(fitWithin(MAX_IMAGE_EDGE, 900)).toEqual({ width: MAX_IMAGE_EDGE, height: 900, shrunk: false });
  });

  it("shrinks a phone photo to the long-edge limit, keeping its proportions", () => {
    expect(fitWithin(4032, 3024)).toEqual({ width: 2048, height: 1536, shrunk: true });
    expect(fitWithin(3024, 4032)).toEqual({ width: 1536, height: 2048, shrunk: true });
  });

  it("never rounds a very thin image to nothing", () => {
    expect(fitWithin(100_000, 10).height).toBe(1);
  });
});

describe("outputPlan", () => {
  it("keeps an image that fits as it is", () => {
    expect(outputPlan("image/jpeg", false, false)).toEqual({ redraw: false, mime: "image/jpeg" });
    expect(outputPlan("image/webp", false, true)).toEqual({ redraw: false, mime: "image/webp" });
  });

  it("re-encodes a shrunk photo as JPEG, and anything transparent as PNG", () => {
    expect(outputPlan("image/jpeg", true, false)).toEqual({ redraw: true, mime: "image/jpeg" });
    expect(outputPlan("image/webp", true, false)).toEqual({ redraw: true, mime: "image/jpeg" });
    expect(outputPlan("image/webp", true, true)).toEqual({ redraw: true, mime: "image/png" });
    expect(outputPlan("image/png", true, false)).toEqual({ redraw: true, mime: "image/png" });
  });

  it("always turns a GIF into a still PNG, so it cannot animate in the editor and freeze in exports", () => {
    expect(outputPlan("image/gif", false, false)).toEqual({ redraw: true, mime: "image/png" });
  });

  it("keeps SVG as written", () => {
    expect(outputPlan("image/svg+xml", true, true)).toEqual({ redraw: false, mime: "image/svg+xml" });
  });
});

describe("importImageFile", () => {
  it("brings in an SVG as it is, sized from its own attributes, as a sound asset", async () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 40"><rect width="80" height="40"/></svg>';
    const result = await importImageFile(file(svg, "logo.svg"));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.asset).toMatchObject({ mime: "image/svg+xml", width: 80, height: 40, name: "logo.svg" });
    expect(atob(result.asset.data)).toBe(svg);
    expect(assetProblem(result.asset)).toBeNull();
    expect(result.notice).toBeUndefined();
  });

  it("refuses a file that is not an image, whatever it is called", async () => {
    const result = await importImageFile(file("%PDF-1.7 ...", "photo.png"));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/isn't an image this app can use/);
  });

  it("refuses a huge file before reading it", async () => {
    const big = Object.assign(new Blob(["x"]), { name: "huge.jpg" });
    Object.defineProperty(big, "size", { value: MAX_SOURCE_BYTES + 1 });
    const result = await importImageFile(big);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/too large/);
  });

  it("refuses an SVG over the size limit, which it cannot shrink", async () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg"><!--${"x".repeat(MAX_IMAGE_BYTES)}--></svg>`;
    const result = await importImageFile(file(svg, "bloated.svg"));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/limit is 2\.0 MB/);
  });
});
