import { describe, expect, it } from "vitest";
import { embedResolution, embedTextChunk, extractTextChunk } from "./pngChunks";
import { crc32 } from "../export/pptx/zip";

const SIGNATURE = Uint8Array.of(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);

function u32be(n: number): Uint8Array {
  return Uint8Array.of((n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff);
}

// A bare-bones chunk builder for test fixtures only — CRC is never checked by our reader
// (extractTextChunk doesn't validate it), so it's left as zero here; only length/type/data
// framing needs to be correct for these tests.
function makeChunk(type: string, data: Uint8Array): Uint8Array {
  const typeBytes = Uint8Array.from(type, (c) => c.charCodeAt(0));
  const out = new Uint8Array(8 + data.length + 4);
  out.set(u32be(data.length), 0);
  out.set(typeBytes, 4);
  out.set(data, 8);
  out.set(u32be(0), 8 + data.length);
  return out;
}

function concat(chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((sum, c) => sum + c.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.length;
  }
  return out;
}

// A PNG with only IHDR + IEND — no real image data. embedTextChunk only reads IHDR's declared
// length to find the insertion point, and extractTextChunk just walks chunk framing until it
// finds an iTXt or hits IEND, so neither needs (or decodes) real pixel data.
function buildMinimalPng(): Uint8Array {
  const ihdr = makeChunk("IHDR", new Uint8Array(13));
  const iend = makeChunk("IEND", new Uint8Array(0));
  return concat([SIGNATURE, ihdr, iend]);
}

// D74: Office sizes a pasted or inserted PNG from pHYs; without it a 2x export shows at 2x size.
describe("embedResolution", () => {
  const physAt33 = (png: Uint8Array) => {
    const view = new DataView(png.buffer, png.byteOffset);
    return {
      type: String.fromCharCode(...png.subarray(37, 41)),
      length: view.getUint32(33),
      x: view.getUint32(41),
      y: view.getUint32(45),
      unit: png[49],
    };
  };

  it("writes a pHYs chunk right after IHDR, in pixels per metre", () => {
    const chunk = physAt33(embedResolution(buildMinimalPng(), 192));
    expect(chunk).toEqual({ type: "pHYs", length: 9, x: 7559, y: 7559, unit: 1 });
  });

  it("gives the chunk a CRC a strict reader accepts", () => {
    const png = embedResolution(buildMinimalPng(), 192);
    const typeAndData = png.subarray(37, 37 + 4 + 9);
    const stored = new DataView(png.buffer, png.byteOffset).getUint32(37 + 4 + 9);
    expect(stored).toBe(crc32(typeAndData)); // the zip writer's CRC-32, an independent copy
  });

  it("leaves a PNG that already declares its resolution alone, since PNG allows one pHYs", () => {
    const once = embedResolution(buildMinimalPng(), 192);
    expect(embedResolution(once, 96)).toBe(once);
  });

  it("keeps the document chunk readable when both are present", () => {
    const png = embedTextChunk(embedResolution(buildMinimalPng(), 192), '{"format":"nedito"}');
    expect(extractTextChunk(png)).toBe('{"format":"nedito"}');
  });
});

describe("pngChunks", () => {
  it("extractTextChunk returns null for a PNG with no embedded document", () => {
    expect(extractTextChunk(buildMinimalPng())).toBeNull();
  });

  it("round-trips ASCII text through embedTextChunk/extractTextChunk", () => {
    const png = buildMinimalPng();
    const withDoc = embedTextChunk(png, '{"format":"nedito","formatVersion":1}');
    expect(extractTextChunk(withDoc)).toBe('{"format":"nedito","formatVersion":1}');
  });

  it("round-trips Unicode text (the point of using iTXt over tEXt/zTXt)", () => {
    const png = buildMinimalPng();
    const text = JSON.stringify({ label: "Café ☕ 日本語 emoji: 🎉" });
    const withDoc = embedTextChunk(png, text);
    expect(extractTextChunk(withDoc)).toBe(text);
  });

  it("inserts the iTXt chunk immediately after IHDR, before IEND", () => {
    const png = buildMinimalPng();
    const withDoc = embedTextChunk(png, "hello");
    // signature(8) + IHDR chunk(8 + 13 + 4 = 25) = 33
    const ihdrEnd = 8 + 8 + 13 + 4;
    const chunkType = String.fromCharCode(withDoc[ihdrEnd + 4], withDoc[ihdrEnd + 5], withDoc[ihdrEnd + 6], withDoc[ihdrEnd + 7]);
    expect(chunkType).toBe("iTXt");
  });

  it("leaves the original PNG bytes untouched (embedTextChunk doesn't mutate its input)", () => {
    const png = buildMinimalPng();
    const original = png.slice();
    embedTextChunk(png, "hello");
    expect(png).toEqual(original);
  });

  it("extractTextChunk ignores an iTXt chunk under a different keyword", () => {
    // Build a foreign iTXt chunk by hand (keyword "other", not our "nd-doc").
    const keyword = Uint8Array.from("other", (c) => c.charCodeAt(0));
    const text = new TextEncoder().encode("not ours");
    const data = new Uint8Array(keyword.length + 5 + text.length);
    let o = 0;
    data.set(keyword, o);
    o += keyword.length;
    data[o++] = 0;
    data[o++] = 0;
    data[o++] = 0;
    data[o++] = 0;
    data[o++] = 0;
    data.set(text, o);
    const foreignChunk = makeChunk("iTXt", data);

    const ihdr = makeChunk("IHDR", new Uint8Array(13));
    const iend = makeChunk("IEND", new Uint8Array(0));
    const withForeignChunk = concat([SIGNATURE, ihdr, foreignChunk, iend]);

    expect(extractTextChunk(withForeignChunk)).toBeNull();
  });

  it("extractTextChunk finds our chunk even when other ancillary chunks are present", () => {
    const png = buildMinimalPng();
    const withDoc = embedTextChunk(png, "payload");
    // Splice in an unrelated tEXt chunk right before IEND to simulate a PNG with other metadata.
    const foreign = makeChunk("tEXt", Uint8Array.from("Comment\0hi", (c) => c.charCodeAt(0)));
    const iendStart = withDoc.length - makeChunk("IEND", new Uint8Array(0)).length;
    const combined = concat([withDoc.slice(0, iendStart), foreign, withDoc.slice(iendStart)]);
    expect(extractTextChunk(combined)).toBe("payload");
  });
});
