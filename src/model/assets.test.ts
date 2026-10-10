// Images in the model and the file format (D79): the asset table, v3, pruning and validation.
import { describe, expect, it } from "vitest";
import { CURRENT_FORMAT_VERSION, decodeDoc, encodeDoc } from "../file/documentFormat";
import { assetProblem, IMAGE_SHAPE_REF, prunedAssets, referencedAssetIds } from "./assets";
import type { DiagramDocument, ImageAsset, ShapeNode } from "./types";
import { validateDoc } from "./validate";
import { stampClassicLook } from "./look";

// A real 1x1 PNG, and the leading bytes of each other format (enough for the signature check).
const PNG_1PX =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==";
const b64 = (bytes: number[]) => btoa(String.fromCharCode(...bytes, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0).slice(0, 12));
const JPEG = b64([0xff, 0xd8, 0xff, 0xe0]);
const GIF = btoa("GIF89a\x01\x00\x01\x00\x00\x00");
const WEBP = btoa("RIFF\x00\x00\x00\x00WEBP");
const SVG = btoa('<svg xmlns="http://www.w3.org/2000/svg"/>');

const png = (extra: Partial<ImageAsset> = {}): ImageAsset => ({ mime: "image/png", data: PNG_1PX, width: 1, height: 1, ...extra });

function image(id: string, imageId: string): ShapeNode {
  return { id, type: "shape", shapeRef: IMAGE_SHAPE_REF, imageId, position: { x: 0, y: 0 }, size: { w: 40, h: 40 }, z: 0, style: {} };
}

function doc(nodes: ShapeNode[], assets?: Record<string, ImageAsset>): DiagramDocument {
  return {
    formatVersion: 3,
    meta: { title: "Pictures", created: "2026-09-28T00:00:00.000Z", modified: "2026-09-28T00:00:00.000Z", appVersion: "0.0.1" },
    rootDiagramIds: ["page"],
    diagrams: { page: { id: "page", title: "Page 1", nodes, edges: [] } },
    ...(assets ? { assets } : {}),
  };
}

describe("the file format with images", () => {
  it("round-trips a document with images byte for byte", () => {
    const text = encodeDoc(doc([image("a", "logo"), image("b", "logo")], { logo: png({ name: "logo.png" }) }));
    const decoded = decodeDoc(text);
    expect(decoded.ok).toBe(true);
    if (decoded.ok) expect(encodeDoc(decoded.doc)).toBe(text);
  });

  it("stores a picture once however many nodes show it", () => {
    const text = encodeDoc(doc([image("a", "logo"), image("b", "logo"), image("c", "logo")], { logo: png() }));
    expect(text.split(PNG_1PX).length - 1).toBe(1);
  });

  // In the classic look, so that only the image decides the version: anything drawn in Nedito's
  // own look is v5 whatever else it holds (R6, D95).
  it("writes v3 only when there is an image, so a plain diagram still opens in an older app", () => {
    expect(JSON.parse(encodeDoc(stampClassicLook(doc([image("a", "logo")], { logo: png() })))).formatVersion).toBe(3);
    const plain = JSON.parse(encodeDoc(doc([])));
    expect(plain.formatVersion).toBe(2);
    expect(plain).not.toHaveProperty("assets");
  });

  it("drops a deleted image's picture from the file, though it stays in memory for undo", () => {
    const inMemory = doc([image("a", "kept")], { kept: png(), orphan: png() });
    const file = JSON.parse(encodeDoc(inMemory));
    expect(Object.keys(file.assets)).toEqual(["kept"]);
    expect(inMemory.assets).toHaveProperty("orphan");
    // Once nothing shows any picture, the file carries no assets and drops back to v2.
    const none = JSON.parse(encodeDoc(doc([], { orphan: png() })));
    expect(none).not.toHaveProperty("assets");
    expect(none.formatVersion).toBe(2);
  });

  it("writes the assets last, keys sorted, so the diagrams read first", () => {
    const text = encodeDoc(doc([image("a", "zeta"), image("b", "alpha")], { zeta: png(), alpha: png() }));
    expect(Object.keys(JSON.parse(text))).toEqual(["format", "formatVersion", "meta", "rootDiagramIds", "diagrams", "assets"]);
    expect(Object.keys(JSON.parse(text).assets)).toEqual(["alpha", "zeta"]);
  });

  it("still opens a v2 file, unchanged", () => {
    const v2 = encodeDoc(doc([]));
    const decoded = decodeDoc(v2);
    expect(decoded.ok).toBe(true);
    if (decoded.ok) expect(encodeDoc(decoded.doc)).toBe(v2);
  });

  it("refuses a file from a newer app with the upgrade message, not a guess", () => {
    const future = JSON.stringify({ ...JSON.parse(encodeDoc(doc([]))), formatVersion: CURRENT_FORMAT_VERSION + 1 });
    const decoded = decodeDoc(future);
    expect(decoded.ok).toBe(false);
    if (!decoded.ok) expect(decoded.error).toMatch(/newer version/);
  });

  // A share link states the version outside the payload; it must match what the payload is, or
  // an older app would refuse a link to a diagram without images that it can read.
  it("gives a share link the version its payload was written as", async () => {
    const { encodeDocToFragment } = await import("../share/urlCodec");
    expect(await encodeDocToFragment(doc([]))).toMatch(/&v=2$/);
    expect(await encodeDocToFragment(stampClassicLook(doc([image("a", "logo")], { logo: png() })))).toMatch(/&v=3$/);
    expect(await encodeDocToFragment(doc([image("a", "logo")], { logo: png() }))).toMatch(/&v=5$/);
  });

  it("refuses a malformed image table", () => {
    const bad = JSON.stringify({ ...JSON.parse(encodeDoc(doc([]))), formatVersion: 3, assets: [] });
    expect(decodeDoc(bad).ok).toBe(false);
  });
});

describe("validation", () => {
  it("reports an image whose picture is not in the file", () => {
    const codes = validateDoc(doc([image("a", "gone")], {})).map((e) => e.code);
    expect(codes).toContain("MISSING_ASSET");
  });

  it("reports an image node with no imageId at all", () => {
    const node = { ...image("a", "x"), imageId: undefined };
    expect(validateDoc(doc([node], {})).map((e) => e.code)).toContain("MISSING_ASSET");
  });

  it("rejects a file whose image is missing, with a readable reason", () => {
    const text = encodeDoc(doc([image("a", "logo")], { logo: png() })).replace('"logo": {', '"other": {');
    const decoded = decodeDoc(text);
    expect(decoded.ok).toBe(false);
    if (!decoded.ok) expect(decoded.error).toMatch(/picture that isn't in the file/);
  });

  it("counts asset ids in the document's one id space", () => {
    expect(validateDoc(doc([image("same", "same")], { same: png() })).map((e) => e.code)).toContain("DUPLICATE_ID");
  });
});

describe("assetProblem", () => {
  it("accepts each supported format when its bytes match", () => {
    expect(assetProblem(png())).toBeNull();
    expect(assetProblem({ mime: "image/jpeg", data: JPEG, width: 1, height: 1 })).toBeNull();
    expect(assetProblem({ mime: "image/gif", data: GIF, width: 1, height: 1 })).toBeNull();
    expect(assetProblem({ mime: "image/webp", data: WEBP, width: 1, height: 1 })).toBeNull();
    expect(assetProblem({ mime: "image/svg+xml", data: SVG, width: 1, height: 1 })).toBeNull();
  });

  it("refuses bytes that are not the type they claim", () => {
    expect(assetProblem({ ...png(), data: JPEG })).toMatch(/not PNG/);
    expect(assetProblem({ mime: "image/webp", data: btoa("RIFF\x00\x00\x00\x00WAVE"), width: 1, height: 1 })).toMatch(/not WEBP/);
    expect(assetProblem({ mime: "image/svg+xml", data: btoa("hello world!"), width: 1, height: 1 })).toMatch(/not SVG/);
  });

  it("refuses unsupported types, broken base64 and sizeless images", () => {
    expect(assetProblem({ ...png(), mime: "image/bmp" as ImageAsset["mime"] })).toMatch(/unsupported/);
    expect(assetProblem({ ...png(), data: "not base64!" })).toMatch(/base64/);
    expect(assetProblem({ ...png(), data: "" })).toMatch(/base64/);
    expect(assetProblem({ ...png(), width: 0 })).toMatch(/no size/);
  });
});

describe("referencedAssetIds / prunedAssets", () => {
  it("collects only what image nodes show", () => {
    const d = doc([image("a", "one"), image("b", "two")], { one: png(), two: png(), three: png() });
    expect([...referencedAssetIds(d)].sort()).toEqual(["one", "two"]);
    expect(Object.keys(prunedAssets(d)!)).toEqual(["one", "two"]);
  });

  it("is undefined when a document has no pictures", () => {
    expect(prunedAssets(doc([]))).toBeUndefined();
  });
});

describe("insertImages / replaceImage / resetImageSize", () => {
  const photo = (w: number, h: number): ImageAsset => ({ ...png(), width: w, height: h });

  it("adds each picture and its node in one step, sized to the picture and centred", async () => {
    const { insertImages } = await import("./assets");
    const { doc: next, nodeIds } = insertImages(doc([]), "page", [photo(640, 320)], { x: 500, y: 400 }, "layer-1");
    const node = next.diagrams.page.nodes.find((n) => n.id === nodeIds[0]) as ShapeNode;
    expect(node).toMatchObject({ shapeRef: IMAGE_SHAPE_REF, size: { w: 320, h: 160 }, position: { x: 340, y: 320 }, layerId: "layer-1" });
    expect(next.assets![node.imageId!]).toEqual(photo(640, 320));
    expect(validateDoc(next)).toEqual([]);
  });

  it("keeps a small picture at its own size, and staggers several so they don't pile up", async () => {
    const { insertImages } = await import("./assets");
    const { doc: next, nodeIds } = insertImages(doc([]), "page", [photo(40, 30), photo(40, 30)], { x: 0, y: 0 });
    const [a, b] = nodeIds.map((id) => next.diagrams.page.nodes.find((n) => n.id === id)!);
    expect(a.size).toEqual({ w: 40, h: 30 });
    expect(b.position.x - a.position.x).toBe(24);
    expect(b.position.y - a.position.y).toBe(24);
  });

  it("replaces a picture without moving, resizing or restyling the node, and keeps the old one for undo", async () => {
    const { replaceImage } = await import("./assets");
    const start = doc([{ ...image("a", "old"), style: { stroke: "#ff0000" }, label: { text: "Logo" } }], { old: png() });
    const next = replaceImage(start, "page", "a", photo(10, 10));
    const node = next.diagrams.page.nodes[0] as ShapeNode;
    expect(node.imageId).not.toBe("old");
    expect(node).toMatchObject({ position: { x: 0, y: 0 }, size: { w: 40, h: 40 }, style: { stroke: "#ff0000" }, label: { text: "Logo" } });
    expect(next.assets).toHaveProperty("old");
    expect(Object.keys(JSON.parse(encodeDoc(next)).assets)).toEqual([node.imageId]);
  });

  it("restores a stretched picture's proportions around its centre", async () => {
    const { resetImageSize } = await import("./assets");
    const stretched = { ...image("a", "p"), position: { x: 0, y: 0 }, size: { w: 400, h: 50 } };
    const next = resetImageSize(doc([stretched], { p: photo(200, 100) }), "page", "a");
    const node = next.diagrams.page.nodes[0];
    expect(node.size).toEqual({ w: 200, h: 100 });
    expect(node.position).toEqual({ x: 100, y: -25 });
  });
});
