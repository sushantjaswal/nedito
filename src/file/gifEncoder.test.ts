// The GIF encoder (G1, D131), checked by decoding what it writes with a reader written from the
// GIF89a spec — not from the encoder — so the two cannot share a mistake.
import { describe, expect, it } from "vitest";
import { encodeGif, gifPalette, GifStreamEncoder, lzwBlocks, medianCut, type GifFrame } from "./gifEncoder";

/** LZW decode of one image's sub-blocks, per GIF89a appendix F. */
function lzwDecode(bytes: Uint8Array, at: number, minCodeSize: number, count: number): { out: Uint8Array; end: number } {
  const data: number[] = [];
  let p = at;
  for (let n = bytes[p++]; n > 0; n = bytes[p++]) {
    for (let i = 0; i < n; i++) data.push(bytes[p++]);
  }
  const clear = 1 << minCodeSize;
  const eoi = clear + 1;
  let size = minCodeSize + 1;
  let dict: number[][] = [];
  const reset = () => {
    dict = [];
    for (let i = 0; i < clear; i++) dict[i] = [i];
    dict[clear] = [];
    dict[eoi] = [];
    size = minCodeSize + 1;
  };
  reset();
  const out: number[] = [];
  let prev: number[] | null = null;
  let bitPos = 0;
  const read = () => {
    let code = 0;
    for (let i = 0; i < size; i++) {
      const bit = (data[(bitPos + i) >> 3] >> ((bitPos + i) & 7)) & 1;
      code |= bit << i;
    }
    bitPos += size;
    return code;
  };
  while (bitPos + size <= data.length * 8) {
    const code = read();
    if (code === clear) {
      reset();
      prev = null;
      continue;
    }
    if (code === eoi) break;
    let entry: number[];
    if (code < dict.length) entry = dict[code];
    else if (prev) entry = [...prev, prev[0]];
    else throw new Error("bad code");
    out.push(...entry);
    if (prev) dict.push([...prev, entry[0]]);
    if (dict.length === 1 << size && size < 12) size++;
    prev = entry;
  }
  expect(out.length).toBe(count);
  return { out: Uint8Array.from(out), end: p };
}

interface Decoded {
  width: number;
  height: number;
  palette: number[][];
  loops: boolean;
  frames: { rect: { x: number; y: number; w: number; h: number }; delay: number; indices: Uint8Array }[];
}

function decode(bytes: Uint8Array): Decoded {
  expect(String.fromCharCode(...bytes.slice(0, 6))).toBe("GIF89a");
  const word = (i: number) => bytes[i] | (bytes[i + 1] << 8);
  const width = word(6);
  const height = word(8);
  expect(bytes[10] & 0x80).toBe(0x80);
  const size = 2 << (bytes[10] & 7);
  const palette: number[][] = [];
  let p = 13;
  for (let i = 0; i < size; i++, p += 3) palette.push([bytes[p], bytes[p + 1], bytes[p + 2]]);
  const frames: Decoded["frames"] = [];
  let loops = false;
  let delay = 0;
  while (bytes[p] !== 0x3b) {
    if (bytes[p] === 0x21) {
      const label = bytes[p + 1];
      if (label === 0xf9) delay = word(p + 4);
      if (label === 0xff) loops = String.fromCharCode(...bytes.slice(p + 3, p + 14)) === "NETSCAPE2.0";
      p += 2;
      for (let n = bytes[p++]; n > 0; n = bytes[p++]) p += n;
    } else if (bytes[p] === 0x2c) {
      const rect = { x: word(p + 1), y: word(p + 3), w: word(p + 5), h: word(p + 7) };
      const min = bytes[p + 10];
      const { out, end } = lzwDecode(bytes, p + 11, min, rect.w * rect.h);
      frames.push({ rect, delay, indices: out });
      p = end;
    } else {
      throw new Error(`unexpected byte ${bytes[p]} at ${p}`);
    }
  }
  return { width, height, palette, loops, frames };
}

function solid(w: number, h: number, rgb: [number, number, number], paint?: (x: number, y: number) => [number, number, number] | null): Uint8ClampedArray {
  const d = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const c = paint?.(x, y) ?? rgb;
      d.set([...c, 255], (y * w + x) * 4);
    }
  return d;
}

/** The picture a decoded GIF shows after its nth frame, as palette colours. */
function composite(g: Decoded, upTo: number): number[][] {
  const canvas = new Array(g.width * g.height).fill(0);
  for (let f = 0; f <= upTo; f++) {
    const { rect, indices } = g.frames[f];
    for (let y = 0; y < rect.h; y++) for (let x = 0; x < rect.w; x++) canvas[(rect.y + y) * g.width + rect.x + x] = indices[y * rect.w + x];
  }
  return canvas.map((i) => g.palette[i]);
}

describe("encodeGif", () => {
  it("writes a still GIF for one frame: no loop block, the picture exact", () => {
    const w = 20;
    const h = 10;
    const rgba = solid(w, h, [255, 255, 255], (x) => (x < 10 ? [30, 39, 51] : null));
    const g = decode(encodeGif([{ rgba, delayMs: 100 }], w, h));
    expect(g).toMatchObject({ width: 20, height: 10, loops: false });
    expect(g.frames).toHaveLength(1);
    const pic = composite(g, 0);
    expect(pic[0]).toEqual([30, 39, 51]);
    expect(pic[15]).toEqual([255, 255, 255]);
  });

  it("loops, stores only the rectangle that changed, and lengthens a frame that did not change", () => {
    const w = 40;
    const h = 30;
    const dot = (cx: number) => solid(w, h, [246, 247, 249], (x, y) => (Math.abs(x - cx) < 3 && Math.abs(y - 15) < 3 ? [109, 90, 230] : null));
    const frames: GifFrame[] = [
      { rgba: dot(10), delayMs: 80 },
      { rgba: dot(20), delayMs: 80 },
      { rgba: dot(20), delayMs: 80 },
      { rgba: dot(30), delayMs: 80 },
    ];
    const g = decode(encodeGif(frames, w, h));
    expect(g.loops).toBe(true);
    expect(g.frames).toHaveLength(3);
    expect(g.frames.map((f) => f.delay)).toEqual([8, 16, 8]);
    expect(g.frames[0].rect).toEqual({ x: 0, y: 0, w: 40, h: 30 });
    // Only the dot's old and new places.
    expect(g.frames[1].rect).toEqual({ x: 8, y: 13, w: 15, h: 5 });
    const last = composite(g, 2);
    expect(last[15 * w + 30]).toEqual([109, 90, 230]);
    expect(last[15 * w + 10]).toEqual([246, 247, 249]);
  });

  it("survives more than 4096 codes (a clear mid-image) on a noisy picture", () => {
    const w = 120;
    const h = 120;
    let seed = 7;
    const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) % 256;
    const rgba = solid(w, h, [0, 0, 0], () => [rnd() & 0xf0, rnd() & 0xc0, rnd() & 0x80]);
    const g = decode(encodeGif([{ rgba, delayMs: 50 }], w, h));
    expect(g.frames[0].indices).toHaveLength(w * h);
  });
});

describe("lzwBlocks", () => {
  it("round-trips a run, and ends with the block terminator", () => {
    const idx = Uint8Array.from({ length: 1000 }, (_, i) => (i % 7) * 3);
    const blocks = Uint8Array.from(lzwBlocks(idx, 8));
    expect(blocks[blocks.length - 1]).toBe(0);
    expect([...lzwDecode(blocks, 0, 8, 1000).out]).toEqual([...idx]);
  });
});

describe("medianCut", () => {
  it("keeps few colours exact, and caps many at 256", () => {
    const few = medianCut([
      { key: 0, r: 255, g: 255, b: 255, n: 100 },
      { key: 1, r: 30, g: 39, b: 51, n: 10 },
    ]);
    expect(few).toHaveLength(2);
    expect(few).toContainEqual([30, 39, 51]);
    const many = Array.from({ length: 2000 }, (_, i) => ({ key: i, r: i % 256, g: (i * 7) % 256, b: (i * 13) % 256, n: 1 }));
    expect(medianCut(many).length).toBeLessThanOrEqual(256);
  });
});

describe("GifStreamEncoder (D143)", () => {
  it("writes the same file a frame at a time, its palette from a sample of the frames", () => {
    const w = 40;
    const h = 30;
    const dot = (cx: number) => solid(w, h, [246, 247, 249], (x, y) => (Math.abs(x - cx) < 3 && Math.abs(y - 15) < 3 ? [109, 90, 230] : null));
    const frames: GifFrame[] = [10, 20, 20, 30].map((cx) => ({ rgba: dot(cx), delayMs: 40 }));
    const streamed = new GifStreamEncoder(w, h, gifPalette([frames[0], frames[3]], w, h), true);
    for (const f of frames) streamed.addFrame(f);
    const g = decode(streamed.finish());
    expect(g.frames.map((f) => f.delay)).toEqual([4, 8, 4]);
    expect(composite(g, 2)[15 * w + 30]).toEqual([109, 90, 230]);
    expect(encodeGif(frames, w, h).length).toBeGreaterThan(0);
  });
});
