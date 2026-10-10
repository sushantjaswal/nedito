// Minimal, dependency-free PNG chunk read/write — just enough to embed and recover a single
// iTXt (UTF-8 text) chunk carrying the full .nedito document, the same "editable image"
// trick draw.io uses for its own PNG export (a PNG with the document's JSON
// embedded in a metadata chunk). Pure Uint8Array in and out, so this is unit-testable under Node/jsdom
// without a real <canvas>; see editablePngFormat.ts for the browser-only glue that actually
// rasterizes a diagram and calls these.

// Deliberately NOT tied to BRAND.formatId — this is a low-level binary container key, not
// user-facing text, and must stay stable across a product rename so a PNG exported before the
// rename can still be read after it. The actual format identification and version live inside
// the embedded JSON's own "format"/"formatVersion" fields, which decodeDoc() already checks.
// Matches the project's established `dd-` neutral-prefix convention used for
// exactly this rename-indirection purpose.
const CHUNK_KEYWORD = "dd-doc";

// Standard PNG/zlib CRC-32 (ISO 3309 / ITU-T V.42), precomputed table — every PNG chunk is
// followed by a CRC-32 of its type+data, and readers reject chunks that don't match.
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function u32be(n: number): Uint8Array {
  return Uint8Array.of((n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff);
}

function readU32(bytes: Uint8Array, offset: number): number {
  return ((bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3]) >>> 0;
}

function buildChunk(type: string, data: Uint8Array): Uint8Array {
  const typeBytes = Uint8Array.from(type, (c) => c.charCodeAt(0));
  const typeAndData = new Uint8Array(typeBytes.length + data.length);
  typeAndData.set(typeBytes, 0);
  typeAndData.set(data, typeBytes.length);
  const out = new Uint8Array(4 + typeAndData.length + 4);
  out.set(u32be(data.length), 0);
  out.set(typeAndData, 4);
  out.set(u32be(crc32(typeAndData)), 4 + typeAndData.length);
  return out;
}

// iTXt layout: keyword \0 compressionFlag compressionMethod languageTag \0 translatedKeyword \0 text
// — the one PNG text chunk type that specifies UTF-8 text (tEXt/zTXt are Latin-1 only), needed
// since shape labels can contain arbitrary Unicode.
function buildITXtChunk(keyword: string, text: string): Uint8Array {
  const keywordBytes = Uint8Array.from(keyword, (c) => c.charCodeAt(0));
  const textBytes = new TextEncoder().encode(text);
  const data = new Uint8Array(keywordBytes.length + 5 + textBytes.length);
  let o = 0;
  data.set(keywordBytes, o);
  o += keywordBytes.length;
  data[o++] = 0; // keyword null separator
  data[o++] = 0; // compression flag: uncompressed
  data[o++] = 0; // compression method (unused, uncompressed)
  data[o++] = 0; // language tag (empty) + its null terminator
  data[o++] = 0; // translated keyword (empty) + its null terminator
  data.set(textBytes, o);
  return data;
}

function insertAfterIhdr(pngBytes: Uint8Array, chunk: Uint8Array): Uint8Array {
  // IHDR is always the very first chunk, with a fixed 13-byte payload — insert right after its
  // closing CRC: signature(8) + [length(4)+type(4)] + IHDR data + crc(4).
  const ihdrLength = readU32(pngBytes, 8);
  const insertAt = 8 + 8 + ihdrLength + 4;

  const out = new Uint8Array(pngBytes.length + chunk.length);
  out.set(pngBytes.subarray(0, insertAt), 0);
  out.set(chunk, insertAt);
  out.set(pngBytes.subarray(insertAt), insertAt + chunk.length);
  return out;
}

/** Inserts an iTXt chunk carrying `text` into `pngBytes`, right after IHDR (before any IDAT). */
export function embedTextChunk(pngBytes: Uint8Array, text: string): Uint8Array {
  return insertAfterIhdr(pngBytes, buildChunk("iTXt", buildITXtChunk(CHUNK_KEYWORD, text)));
}

/** True when the PNG already carries a chunk of this type before its image data. */
function hasChunkBeforeIdat(pngBytes: Uint8Array, wanted: string): boolean {
  let offset = 8;
  while (offset + 8 <= pngBytes.length) {
    const length = readU32(pngBytes, offset);
    const type = String.fromCharCode(...pngBytes.subarray(offset + 4, offset + 8));
    if (type === wanted) return true;
    if (type === "IDAT" || type === "IEND") return false;
    offset += 12 + length;
  }
  return false;
}

/**
 * Declares the pixel density the image was rendered at, in a pHYs chunk. A 2x export with none
 * is taken as 96 dpi and shown at twice its size: pasted into PowerPoint, the "Copy image with
 * live link" picture ran half off the slide (D74). With it, Office shows the diagram at its real
 * size and keeps the extra pixels for sharpness. PNG allows one pHYs, so an existing one wins.
 */
export function embedResolution(pngBytes: Uint8Array, dpi: number): Uint8Array {
  if (hasChunkBeforeIdat(pngBytes, "pHYs")) return pngBytes;
  const pixelsPerMetre = Math.round(dpi / 0.0254);
  const data = new Uint8Array(9);
  data.set(u32be(pixelsPerMetre), 0);
  data.set(u32be(pixelsPerMetre), 4);
  data[8] = 1; // unit: the metre
  return insertAfterIhdr(pngBytes, buildChunk("pHYs", data));
}

/** Recovers the text embedded by embedTextChunk from a PNG, or null if this PNG has none. */
export function extractTextChunk(pngBytes: Uint8Array): string | null {
  let offset = 8; // past the 8-byte PNG signature
  while (offset + 8 <= pngBytes.length) {
    const length = readU32(pngBytes, offset);
    const type = String.fromCharCode(
      pngBytes[offset + 4],
      pngBytes[offset + 5],
      pngBytes[offset + 6],
      pngBytes[offset + 7],
    );
    const dataStart = offset + 8;
    const data = pngBytes.subarray(dataStart, dataStart + length);

    if (type === "iTXt") {
      const text = readITXt(data);
      if (text !== null) return text;
    }
    if (type === "IEND") break;
    offset = dataStart + length + 4; // skip the trailing CRC
  }
  return null;
}

function readITXt(data: Uint8Array): string | null {
  const nul1 = data.indexOf(0);
  if (nul1 === -1) return null;
  const keyword = String.fromCharCode(...data.subarray(0, nul1));
  if (keyword !== CHUNK_KEYWORD) return null;

  const compressionFlag = data[nul1 + 1];
  if (compressionFlag !== 0) return null; // we only ever write uncompressed iTXt

  const langEnd = data.indexOf(0, nul1 + 3);
  if (langEnd === -1) return null;
  const transEnd = data.indexOf(0, langEnd + 1);
  if (transEnd === -1) return null;

  return new TextDecoder("utf-8").decode(data.subarray(transEnd + 1));
}
