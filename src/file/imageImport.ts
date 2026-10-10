// Turning a file the user picked, dropped or pasted into an ImageAsset (CLAUDE_HISTORY.md D79).
//
// The format is read from the bytes, never from the file name or the browser's guess: a file is
// data from anywhere, and an asset that claims to be a PNG must be one (model/assets.ts checks
// the same on open). Large images are shrunk to a 2,048 px long edge — the user chose this over
// asking each time — because the document lives in browser storage for autosave and in a single
// JSON file, and one phone photo would otherwise outgrow both.
//
// Split in two: the decisions (what format, how big, what to write) are pure and unit-tested;
// only decoding and redrawing need a real browser, and those are covered end to end.
import type { ImageAsset } from "../model/types";

/** Longest edge an inserted image keeps, in pixels. */
export const MAX_IMAGE_EDGE = 2048;
/** Largest image kept after shrinking, in bytes. */
export const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
/** Refused before decoding at all: no point spending memory on a file we will not keep. */
export const MAX_SOURCE_BYTES = 40 * 1024 * 1024;
/** JPEG quality for photos re-encoded after shrinking. */
export const JPEG_QUALITY = 0.85;

type Mime = ImageAsset["mime"];

/** The image format these bytes really are, or null for anything we do not accept. */
export function sniffImageType(bytes: Uint8Array): Mime | null {
  const at = (i: number, sig: number[]) => sig.every((b, k) => bytes[i + k] === b);
  if (at(0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (at(0, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (at(0, [0x47, 0x49, 0x46, 0x38]) && (bytes[4] === 0x37 || bytes[4] === 0x39) && bytes[5] === 0x61) return "image/gif";
  if (at(0, [0x52, 0x49, 0x46, 0x46]) && at(8, [0x57, 0x45, 0x42, 0x50])) return "image/webp";
  // SVG is text: an optional BOM and whitespace, maybe an XML declaration or comments, then <svg.
  const head = new TextDecoder().decode(bytes.subarray(0, 1024)).replace(/^\uFEFF/, "").trimStart();
  if (head.startsWith("<") && /<svg[\s>]/i.test(head)) return "image/svg+xml";
  return null;
}

/**
 * An SVG's size from its own attributes: width/height when absolute, else the viewBox, else the
 * browser's default for an unsized replaced element (300×150).
 */
export function svgIntrinsicSize(text: string): { width: number; height: number } {
  const root = /<svg\b[^>]*>/i.exec(text)?.[0] ?? "";
  const attr = (name: string) => new RegExp(`\\s${name}\\s*=\\s*["']([^"']+)["']`, "i").exec(root)?.[1];
  const length = (v: string | undefined) => {
    if (!v) return null;
    const m = /^\s*([\d.]+)\s*(px)?\s*$/.exec(v); // percentages and relative units give no size
    return m && parseFloat(m[1]) > 0 ? parseFloat(m[1]) : null;
  };
  const w = length(attr("width"));
  const h = length(attr("height"));
  const box = attr("viewBox")
    ?.trim()
    .split(/[\s,]+/)
    .map(Number);
  const vb = box && box.length === 4 && box[2] > 0 && box[3] > 0 ? { width: box[2], height: box[3] } : null;
  if (w && h) return { width: w, height: h };
  if (vb && w) return { width: w, height: (w * vb.height) / vb.width };
  if (vb && h) return { width: (h * vb.width) / vb.height, height: h };
  if (vb) return vb;
  return { width: 300, height: 150 };
}

/**
 * An image's pixel size read straight from its header, without decoding it — for importers that
 * run where no browser decoder is available. Null when the header cannot be read.
 */
export function imageSizeFromBytes(bytes: Uint8Array, mime: Mime): { width: number; height: number } | null {
  const be16 = (i: number) => (bytes[i] << 8) | bytes[i + 1];
  const be32 = (i: number) => ((bytes[i] << 24) | (bytes[i + 1] << 16) | (bytes[i + 2] << 8) | bytes[i + 3]) >>> 0;
  const le16 = (i: number) => bytes[i] | (bytes[i + 1] << 8);
  const le24 = (i: number) => bytes[i] | (bytes[i + 1] << 8) | (bytes[i + 2] << 16);
  const ok = (w: number, h: number) => (w > 0 && h > 0 ? { width: w, height: h } : null);
  switch (mime) {
    case "image/png":
      return bytes.length >= 24 ? ok(be32(16), be32(20)) : null;
    case "image/gif":
      return bytes.length >= 10 ? ok(le16(6), le16(8)) : null;
    case "image/jpeg": {
      // Walk the markers to the first start-of-frame; its height and width follow the precision byte.
      let i = 2;
      while (i + 9 < bytes.length) {
        if (bytes[i] !== 0xff) return null;
        const marker = bytes[i + 1];
        if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
          return ok(be16(i + 7), be16(i + 5));
        }
        i += 2 + be16(i + 2);
      }
      return null;
    }
    case "image/webp": {
      const chunk = String.fromCharCode(...bytes.subarray(12, 16));
      if (chunk === "VP8X" && bytes.length >= 30) return ok(le24(24) + 1, le24(27) + 1);
      if (chunk === "VP8 " && bytes.length >= 30) return ok(le16(26) & 0x3fff, le16(28) & 0x3fff);
      if (chunk === "VP8L" && bytes.length >= 25) {
        const b = bytes.subarray(21, 25);
        return ok(1 + (((b[1] & 0x3f) << 8) | b[0]), 1 + (((b[3] & 0x0f) << 10) | (b[2] << 2) | ((b[1] & 0xc0) >> 6)));
      }
      return null;
    }
    case "image/svg+xml": {
      const s = svgIntrinsicSize(new TextDecoder().decode(bytes));
      return ok(Math.round(s.width), Math.round(s.height));
    }
  }
}

/** The size to keep: unchanged if it fits, else scaled so the long edge is MAX_IMAGE_EDGE. */
export function fitWithin(width: number, height: number, maxEdge = MAX_IMAGE_EDGE): { width: number; height: number; shrunk: boolean } {
  const longest = Math.max(width, height);
  if (longest <= maxEdge) return { width, height, shrunk: false };
  const scale = maxEdge / longest;
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)), shrunk: true };
}

/**
 * How the image is stored. SVG is kept as written (it scales without shrinking). A GIF is always
 * redrawn to a PNG, keeping only its first frame: an animated picture in a diagram would move in
 * the editor and freeze in every export. Anything shrunk is re-encoded — a photo as JPEG, and
 * anything with transparency as PNG, since JPEG would paint it black.
 */
export function outputPlan(mime: Mime, shrunk: boolean, hasAlpha: boolean): { redraw: boolean; mime: Mime } {
  if (mime === "image/svg+xml") return { redraw: false, mime };
  if (mime === "image/gif") return { redraw: true, mime: "image/png" };
  if (!shrunk) return { redraw: false, mime };
  return { redraw: true, mime: hasAlpha || mime === "image/png" ? "image/png" : "image/jpeg" };
}

function formatName(mime: Mime): string {
  return { "image/png": "PNG", "image/jpeg": "JPEG", "image/gif": "GIF", "image/webp": "WebP", "image/svg+xml": "SVG" }[mime];
}

export type ImageImportResult =
  | { ok: true; asset: ImageAsset; notice?: string }
  | { ok: false; error: string };

const MB = (n: number) => `${(n / 1024 / 1024).toFixed(1)} MB`;

export function tooLargeError(name: string, bytes: number): string {
  return `"${name}" is too large to put in a diagram (${MB(bytes)}; the limit is ${MB(MAX_IMAGE_BYTES)}). Try a smaller or more compressed image.`;
}

function bytesToBase64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

/** Whether any pixel is not fully opaque. */
function canvasHasAlpha(ctx: CanvasRenderingContext2D, width: number, height: number): boolean {
  const data = ctx.getImageData(0, 0, width, height).data;
  for (let i = 3; i < data.length; i += 4) if (data[i] < 255) return true;
  return false;
}

async function decodeRaster(blob: Blob): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === "function") return createImageBitmap(blob);
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Reads a user's image file into an asset, shrinking and re-encoding as the plan says. Never throws. */
export async function importImageFile(file: Blob & { name?: string }): Promise<ImageImportResult> {
  const name = file.name || "image";
  if (file.size > MAX_SOURCE_BYTES) return { ok: false, error: tooLargeError(name, file.size) };

  const bytes = new Uint8Array(await file.arrayBuffer());
  const mime = sniffImageType(bytes);
  if (!mime) {
    return { ok: false, error: `"${name}" isn't an image this app can use. Use a PNG, JPEG, GIF, WebP or SVG file.` };
  }

  if (mime === "image/svg+xml") {
    if (bytes.length > MAX_IMAGE_BYTES) return { ok: false, error: tooLargeError(name, bytes.length) };
    const size = svgIntrinsicSize(new TextDecoder().decode(bytes));
    return { ok: true, asset: { mime, data: bytesToBase64(bytes), width: Math.round(size.width), height: Math.round(size.height), name } };
  }

  let source: ImageBitmap | HTMLImageElement;
  try {
    source = await decodeRaster(new Blob([bytes], { type: mime }));
  } catch {
    return { ok: false, error: `"${name}" couldn't be read — the file may be damaged.` };
  }
  const naturalW = "naturalWidth" in source ? source.naturalWidth : source.width;
  const naturalH = "naturalHeight" in source ? source.naturalHeight : source.height;
  const target = fitWithin(naturalW, naturalH);

  let out: { mime: Mime; bytes: Uint8Array } = { mime, bytes };
  const needsRedraw = target.shrunk || mime === "image/gif";
  if (needsRedraw) {
    const canvas = document.createElement("canvas");
    canvas.width = target.width;
    canvas.height = target.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return { ok: false, error: `"${name}" couldn't be processed in this browser.` };
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(source, 0, 0, target.width, target.height);
    const hasAlpha = canvasHasAlpha(ctx, target.width, target.height);
    const encode = async (as: Mime) => {
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, as, as === "image/jpeg" ? JPEG_QUALITY : undefined),
      );
      return blob ? { mime: as, bytes: new Uint8Array(await blob.arrayBuffer()) } : null;
    };
    let encoded = await encode(outputPlan(mime, target.shrunk, hasAlpha).mime);
    // A photo saved as PNG can stay too big even at 2,048 px; with no transparency to lose, a
    // JPEG keeps it rather than refusing it.
    if (encoded && encoded.bytes.length > MAX_IMAGE_BYTES && !hasAlpha && encoded.mime === "image/png") {
      encoded = (await encode("image/jpeg")) ?? encoded;
    }
    if (!encoded) return { ok: false, error: `"${name}" couldn't be processed in this browser.` };
    out = encoded;
  }
  if ("close" in source) source.close();

  if (out.bytes.length > MAX_IMAGE_BYTES) return { ok: false, error: tooLargeError(name, out.bytes.length) };

  const notice = target.shrunk
    ? `"${name}" was resized from ${naturalW}×${naturalH} to ${target.width}×${target.height} to keep the diagram small.`
    : mime === "image/gif"
      ? `"${name}" is a GIF: only its first frame is kept, as a ${formatName(out.mime)}.`
      : undefined;

  return {
    ok: true,
    asset: { mime: out.mime, data: bytesToBase64(out.bytes), width: target.width, height: target.height, name },
    ...(notice ? { notice } : {}),
  };
}
