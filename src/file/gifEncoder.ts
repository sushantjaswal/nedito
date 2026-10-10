// An animated GIF encoder, written here rather than added as a
// dependency: the format is small and old, and a diagram's frames are kind to it — flat colours,
// antialiased edges, and from one frame to the next only the moving parts change.
//
//   - One palette for the whole animation (median cut over the frames' colours), so a colour never
//     shifts between frames.
//   - Each frame after the first stores only the rectangle that changed, over the previous frame
//     ("do not dispose"); a frame with no change lengthens the one before instead of being stored.
//   - LZW as GIF89a specifies it, with the variable code size and a clear at 4096 codes.

export interface GifFrame {
  /** RGBA, as a canvas's getImageData gives it; alpha is ignored (frames are drawn on a background). */
  rgba: Uint8ClampedArray;
  /** How long it shows, in milliseconds (GIF keeps hundredths of a second). */
  delayMs: number;
}

// ---- Palette: median cut over 5-bit-per-channel buckets.

interface Bucket {
  key: number;
  r: number;
  g: number;
  b: number;
  n: number;
}

/** Counts colours across the frames, sampling large ones, in 5-bit-per-channel buckets. */
function histogram(frames: GifFrame[], pixels: number): Bucket[] {
  const counts = new Uint32Array(32768);
  const sums = new Float64Array(32768 * 3);
  const step = Math.max(1, Math.floor((pixels * frames.length) / 400000));
  for (const f of frames) {
    const d = f.rgba;
    for (let p = 0; p < pixels; p += step) {
      const i = p * 4;
      const key = ((d[i] >> 3) << 10) | ((d[i + 1] >> 3) << 5) | (d[i + 2] >> 3);
      counts[key]++;
      sums[key * 3] += d[i];
      sums[key * 3 + 1] += d[i + 1];
      sums[key * 3 + 2] += d[i + 2];
    }
  }
  const out: Bucket[] = [];
  for (let key = 0; key < 32768; key++) {
    const n = counts[key];
    if (n) out.push({ key, r: sums[key * 3] / n, g: sums[key * 3 + 1] / n, b: sums[key * 3 + 2] / n, n });
  }
  return out;
}

/** Up to 256 colours that cover the buckets well: split the widest box at its weighted median. */
export function medianCut(buckets: Bucket[], size = 256): [number, number, number][] {
  if (buckets.length === 0) return [[255, 255, 255]];
  let boxes: Bucket[][] = [buckets];
  const range = (box: Bucket[], c: "r" | "g" | "b") => {
    let lo = 255;
    let hi = 0;
    for (const b of box) {
      if (b[c] < lo) lo = b[c];
      if (b[c] > hi) hi = b[c];
    }
    return hi - lo;
  };
  while (boxes.length < size) {
    // The box to split: the widest one that still has more than one colour, weighted by pixels.
    let best = -1;
    let bestScore = 0;
    let bestChannel: "r" | "g" | "b" = "r";
    boxes.forEach((box, i) => {
      if (box.length < 2) return;
      const weight = Math.sqrt(box.reduce((a, b) => a + b.n, 0));
      for (const c of ["r", "g", "b"] as const) {
        const score = range(box, c) * weight;
        if (score > bestScore) {
          bestScore = score;
          best = i;
          bestChannel = c;
        }
      }
    });
    if (best < 0) break;
    const box = boxes[best].sort((a, b) => a[bestChannel] - b[bestChannel]);
    const total = box.reduce((a, b) => a + b.n, 0);
    let acc = 0;
    let cut = 1;
    for (let i = 0; i < box.length - 1; i++) {
      acc += box[i].n;
      if (acc >= total / 2) {
        cut = i + 1;
        break;
      }
    }
    boxes = [...boxes.slice(0, best), box.slice(0, cut), box.slice(cut), ...boxes.slice(best + 1)];
  }
  return boxes.map((box) => {
    const n = box.reduce((a, b) => a + b.n, 0);
    return [
      Math.round(box.reduce((a, b) => a + b.r * b.n, 0) / n),
      Math.round(box.reduce((a, b) => a + b.g * b.n, 0) / n),
      Math.round(box.reduce((a, b) => a + b.b * b.n, 0) / n),
    ];
  });
}

/** Maps every pixel to its nearest palette entry, remembering each exact colour it has seen. */
function indexer(palette: [number, number, number][]): (r: number, g: number, b: number) => number {
  const seen = new Map<number, number>();
  return (r, g, b) => {
    const key = (r << 16) | (g << 8) | b;
    const hit = seen.get(key);
    if (hit !== undefined) return hit;
    let best = 0;
    let bestD = Infinity;
    for (let i = 0; i < palette.length; i++) {
      const [pr, pg, pb] = palette[i];
      const d = (pr - r) * (pr - r) * 2 + (pg - g) * (pg - g) * 4 + (pb - b) * (pb - b) * 3;
      if (d < bestD) {
        bestD = d;
        best = i;
        if (d === 0) break;
      }
    }
    seen.set(key, best);
    return best;
  };
}

// ---- LZW, as GIF uses it.

class ByteWriter {
  bytes: number[] = [];
  byte(b: number) {
    this.bytes.push(b & 0xff);
  }
  word(w: number) {
    this.byte(w);
    this.byte(w >> 8);
  }
  ascii(s: string) {
    for (let i = 0; i < s.length; i++) this.byte(s.charCodeAt(i));
  }
}

/** LZW-compresses palette indices, in 255-byte sub-blocks, ending with the block terminator. */
export function lzwBlocks(indices: Uint8Array, minCodeSize = 8): number[] {
  const clear = 1 << minCodeSize;
  const eoi = clear + 1;
  let codeSize = minCodeSize + 1;
  let next = eoi + 1;
  let table = new Map<number, number>();
  const data: number[] = [];
  let cur = 0;
  let bits = 0;
  const emit = (code: number) => {
    cur |= code << bits;
    bits += codeSize;
    while (bits >= 8) {
      data.push(cur & 0xff);
      cur >>>= 8;
      bits -= 8;
    }
  };
  emit(clear);
  let prefix = indices[0];
  for (let i = 1; i < indices.length; i++) {
    const k = indices[i];
    const key = (prefix << 8) | k;
    const code = table.get(key);
    if (code !== undefined) {
      prefix = code;
      continue;
    }
    emit(prefix);
    if (next === 4096) {
      emit(clear);
      table = new Map();
      next = eoi + 1;
      codeSize = minCodeSize + 1;
    } else {
      if (next >= 1 << codeSize) codeSize++;
      table.set(key, next++);
    }
    prefix = k;
  }
  emit(prefix);
  emit(eoi);
  if (bits > 0) data.push(cur & 0xff);
  const blocks: number[] = [];
  for (let i = 0; i < data.length; i += 255) {
    const chunk = data.slice(i, i + 255);
    blocks.push(chunk.length, ...chunk);
  }
  blocks.push(0);
  return blocks;
}

// ---- The file.

/** One palette for a whole animation, from a sample of its frames. */
export function gifPalette(frames: GifFrame[], width: number, height: number): [number, number, number][] {
  const palette = medianCut(histogram(frames, width * height));
  while (palette.length < 256) palette.push([0, 0, 0]);
  return palette;
}

/**
 * Writes a GIF a frame at a time (D143), keeping only the previous frame: a 2400px animation of 120
 * frames would otherwise hold 1.5 GB of pixels at once. Each frame is compared with the last as
 * raw pixels, and only the rectangle that changed is indexed and compressed; a frame with no
 * change lengthens the one before.
 */
export class GifStreamEncoder {
  private out = new ByteWriter();
  private toIndex: (r: number, g: number, b: number) => number;
  private prev: Uint32Array | null = null;
  /** The last frame, held until the next shows whether it changed (to lengthen it if not). */
  private pending: { rect: { x: number; y: number; w: number; h: number }; blocks: number[]; delayMs: number } | null = null;

  constructor(
    private width: number,
    private height: number,
    palette: [number, number, number][],
    loops: boolean,
  ) {
    this.toIndex = indexer(palette);
    const out = this.out;
    out.ascii("GIF89a");
    out.word(width);
    out.word(height);
    out.byte(0xf7); // a global colour table of 256 entries
    out.byte(0);
    out.byte(0);
    for (const [r, g, b] of palette) {
      out.byte(r);
      out.byte(g);
      out.byte(b);
    }
    if (loops) {
      // NETSCAPE2.0: loop for ever.
      out.byte(0x21);
      out.byte(0xff);
      out.byte(11);
      out.ascii("NETSCAPE2.0");
      out.byte(3);
      out.byte(1);
      out.word(0);
      out.byte(0);
    }
  }

  addFrame(frame: GifFrame): void {
    const { width, height } = this;
    const px = new Uint32Array(frame.rgba.buffer, frame.rgba.byteOffset, width * height);
    const rect = this.prev ? changedRect(this.prev, px, width, height) : { x: 0, y: 0, w: width, h: height };
    if (!rect) {
      if (this.pending) this.pending.delayMs += frame.delayMs;
      return;
    }
    const sub = new Uint8Array(rect.w * rect.h);
    const d = frame.rgba;
    for (let y = 0; y < rect.h; y++) {
      for (let x = 0; x < rect.w; x++) {
        const i = ((rect.y + y) * width + rect.x + x) * 4;
        sub[y * rect.w + x] = this.toIndex(d[i], d[i + 1], d[i + 2]);
      }
    }
    this.flush();
    this.pending = { rect, blocks: lzwBlocks(sub, 8), delayMs: frame.delayMs };
    this.prev = px.slice();
  }

  finish(): Uint8Array {
    this.flush();
    this.out.byte(0x3b);
    return Uint8Array.from(this.out.bytes);
  }

  private flush(): void {
    const s = this.pending;
    if (!s) return;
    const out = this.out;
    // Graphic control: leave this frame in place for the next to draw over; no transparency.
    out.byte(0x21);
    out.byte(0xf9);
    out.byte(4);
    out.byte(0x04);
    out.word(Math.max(2, Math.round(s.delayMs / 10)));
    out.byte(0);
    out.byte(0);
    // Image descriptor: the changed rectangle, using the global palette.
    out.byte(0x2c);
    out.word(s.rect.x);
    out.word(s.rect.y);
    out.word(s.rect.w);
    out.word(s.rect.h);
    out.byte(0);
    out.byte(8);
    for (const b of s.blocks) out.byte(b);
    this.pending = null;
  }
}

/** Encodes the frames as one looping GIF89a (a single frame makes a still GIF). */
export function encodeGif(frames: GifFrame[], width: number, height: number): Uint8Array {
  const encoder = new GifStreamEncoder(width, height, gifPalette(frames, width, height), frames.length > 1);
  for (const f of frames) encoder.addFrame(f);
  return encoder.finish();
}

/** The smallest rectangle holding every pixel that differs; null when none does. */
function changedRect(a: Uint32Array, b: Uint32Array, width: number, height: number): { x: number; y: number; w: number; h: number } | null {
  let x0 = width;
  let y0 = height;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (let x = 0; x < width; x++) {
      if (a[row + x] !== b[row + x]) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        y1 = y;
      }
    }
  }
  return x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}
