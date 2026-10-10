// D82: draw.io's pictures arrive as real image nodes; linked ones are never fetched.
import { describe, expect, it } from "vitest";
import { decodeDoc, encodeDoc } from "../documentFormat";
import { imageSizeFromBytes } from "../imageImport";
import { validateDoc } from "../../model/validate";
import type { ShapeNode } from "../../model/types";
import { imageRefFromStyle, isImageCell, readDrawioPicture } from "./drawioImages";
import { decodeDrawio } from "./drawioImport";
import { parseMxStyle } from "./mxStyle";

// A real 1×1 PNG, and its base64.
const PNG_B64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==";
const SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="32"><rect width="64" height="32"/></svg>';
const SVG_B64 = btoa(SVG);

function cell(id: string, style: string, value = "", x = 40) {
  return `<mxCell id="${id}" value="${value}" style="${style}" vertex="1" parent="1"><mxGeometry x="${x}" y="40" width="80" height="40" as="geometry" /></mxCell>`;
}

function file(...cells: string[]) {
  return `<mxfile host="app.diagrams.net"><diagram id="p" name="Pictures"><mxGraphModel><root><mxCell id="0" /><mxCell id="1" parent="0" />${cells.join("")}</root></mxGraphModel></diagram></mxfile>`;
}

describe("reading draw.io's picture styles", () => {
  it("recognises an image cell by shape key or bare name", () => {
    expect(isImageCell(parseMxStyle("shape=image;html=1;image=data:image/png,AAA"))).toBe(true);
    expect(isImageCell(parseMxStyle("image;html=1;image=img/lib/a.svg"))).toBe(true);
    expect(isImageCell(parseMxStyle("ellipse;html=1"))).toBe(false);
  });

  it("finds the picture in the raw style, including a ;base64 the parser would split", () => {
    expect(imageRefFromStyle(`shape=image;image=data:image/png,${PNG_B64};aspect=fixed;`)).toBe(`data:image/png,${PNG_B64}`);
    expect(imageRefFromStyle(`shape=image;image=data:image/png;base64,${PNG_B64};`)).toBe(`data:image/png;base64,${PNG_B64}`);
    expect(imageRefFromStyle("shape=image;image=https://example.com/logo.png;")).toBe("https://example.com/logo.png");
    expect(imageRefFromStyle("shape=image;html=1")).toBeNull();
  });

  it("reads embedded pictures, refuses to fetch links, and spots junk", () => {
    expect(readDrawioPicture(`data:image/png,${PNG_B64}`).kind).toBe("embedded");
    expect(readDrawioPicture(`data:image/svg+xml,${SVG_B64}`).kind).toBe("embedded");
    expect(readDrawioPicture(`data:image/svg+xml,${encodeURIComponent(SVG)}`).kind).toBe("embedded");
    expect(readDrawioPicture("https://example.com/logo.png").kind).toBe("linked");
    expect(readDrawioPicture("img/lib/clip_art/computers/Server.svg").kind).toBe("linked");
    expect(readDrawioPicture("data:image/png,not-an-image!!").kind).toBe("unreadable");
    // Claims to be PNG, is not: the bytes decide.
    expect(readDrawioPicture(`data:image/png,${btoa("hello world, not a picture")}`).kind).toBe("unreadable");
  });
});

describe("importing a draw.io file with pictures", () => {
  it("turns embedded pictures into image nodes, each picture stored once", async () => {
    const result = await decodeDrawio(
      file(
        cell("a", `shape=image;html=1;image=data:image/png,${PNG_B64};`, "Logo"),
        cell("b", `image;html=1;image=data:image/png;base64,${PNG_B64};`, "", 200),
        cell("c", `shape=image;html=1;image=data:image/svg+xml,${SVG_B64};`, "", 360),
      ),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const page = result.doc.diagrams[result.doc.rootDiagramIds[0]];
    const images = page.nodes.filter((n): n is ShapeNode => n.type === "shape" && n.shapeRef === "image");
    expect(images).toHaveLength(3);
    // The same PNG twice is one asset; the SVG is another.
    expect(Object.keys(result.doc.assets ?? {})).toHaveLength(2);
    expect(images[0].label?.text).toBe("Logo");
    const svgAsset = result.doc.assets![images[2].imageId!];
    expect(svgAsset).toMatchObject({ mime: "image/svg+xml", width: 64, height: 32 });
    expect(result.notices).toEqual([]);
    expect(validateDoc(result.doc)).toEqual([]);

    // And it saves and reopens as any document would.
    const reopened = decodeDoc(encodeDoc(result.doc));
    expect(reopened.ok).toBe(true);
  });

  it("never fetches a linked picture: a rectangle, and a notice that selects it", async () => {
    const result = await decodeDrawio(file(cell("a", "shape=image;html=1;image=https://example.com/logo.png;")));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const page = result.doc.diagrams[result.doc.rootDiagramIds[0]];
    expect(page.nodes[0]).toMatchObject({ shapeRef: "general/rect" });
    expect(result.doc.assets).toBeUndefined();
    expect(result.notices).toHaveLength(1);
    expect(result.notices[0].message).toMatch(/linked from the web.*never goes online/);
    expect(result.notices[0].nodeIds).toEqual([page.nodes[0].id]);
  });

  it("says so when an embedded picture cannot be read", async () => {
    const result = await decodeDrawio(file(cell("a", "shape=image;html=1;image=data:image/png,%%%;")));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.notices[0].message).toMatch(/couldn't be read/);
  });
});

describe("imageSizeFromBytes", () => {
  const bytes = (...b: number[]) => Uint8Array.from(b);

  it("reads PNG and GIF headers", () => {
    expect(imageSizeFromBytes(Uint8Array.from(atob(PNG_B64), (c) => c.charCodeAt(0)), "image/png")).toEqual({ width: 1, height: 1 });
    expect(imageSizeFromBytes(Uint8Array.from("GIF89a\x40\x01\xf0\x00", (c) => c.charCodeAt(0)), "image/gif")).toEqual({ width: 320, height: 240 });
  });

  it("walks JPEG markers to the frame header", () => {
    // SOI, an APP0 segment of length 4, then SOF0: length, precision, height 480, width 640.
    const jpeg = bytes(0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x00, 0x00, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x01, 0xe0, 0x02, 0x80, 0x03);
    expect(imageSizeFromBytes(jpeg, "image/jpeg")).toEqual({ width: 640, height: 480 });
  });

  it("reads the WebP extended header", () => {
    const head = Uint8Array.from("RIFF\0\0\0\0WEBPVP8X", (c) => c.charCodeAt(0));
    const webp = new Uint8Array(30);
    webp.set(head);
    webp.set([0x3f, 0x01, 0x00], 24); // width - 1 = 319
    webp.set([0xef, 0x00, 0x00], 27); // height - 1 = 239
    expect(imageSizeFromBytes(webp, "image/webp")).toEqual({ width: 320, height: 240 });
  });

  it("reads an SVG's own size", () => {
    expect(imageSizeFromBytes(new TextEncoder().encode(SVG), "image/svg+xml")).toEqual({ width: 64, height: 32 });
  });

  it("gives up rather than guessing on a truncated header", () => {
    expect(imageSizeFromBytes(bytes(0x89, 0x50), "image/png")).toBeNull();
  });
});
