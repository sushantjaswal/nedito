// The GIF export's two choices, remembered per browser as the last export format is.
//   - Size (G3, CLAUDE_HISTORY.md D141): the longest side of the picture, in three steps. Large
//     until changed. A GIF stores only what changes between frames — mostly the moving lines — so
//     its file grows with the picture's side more than its area (measured: Small ≈ 42% of Large).
//   - Frame rate (G4, D142): Smooth, 25 frames a second, or a Lighter file at 12.5 — measured a
//     third to a half smaller (less on a busy diagram, whose first full frame is a larger share).
//     Smooth until changed.
import { BRAND } from "../app/brand";

export type GifSize = "small" | "medium" | "large" | "xl";

export const GIF_SIZES: { id: GifSize; label: string; maxSide: number; hint: string }[] = [
  { id: "small", label: "Small", maxSide: 600, hint: "Chat, email, a social post" },
  { id: "medium", label: "Medium", maxSide: 900, hint: "A web page or a document" },
  { id: "large", label: "Large", maxSide: 1200, hint: "Full detail" },
  // Twice Large (D143): small text stays sharp on high-resolution screens and in slides.
  { id: "xl", label: "Extra large", maxSide: 2400, hint: "Sharp text on high-resolution screens and slides; the largest file" },
];

export const DEFAULT_GIF_SIZE: GifSize = "large";

const KEY = `${BRAND.storagePrefix}:gifSize`;

export function readGifSize(): GifSize {
  try {
    const v = localStorage.getItem(KEY);
    return GIF_SIZES.some((s) => s.id === v) ? (v as GifSize) : DEFAULT_GIF_SIZE;
  } catch {
    return DEFAULT_GIF_SIZE;
  }
}

export function writeGifSize(size: GifSize): void {
  try {
    localStorage.setItem(KEY, size);
  } catch {
    // best-effort, as everywhere else this app uses storage
  }
}

/** The longest side a size allows, in pixels. */
export function maxSideOf(size: GifSize): number {
  return GIF_SIZES.find((s) => s.id === size)!.maxSide;
}

/**
 * How far a picture may be scaled up: twice, as the PNG export draws (D143). The drawing is vector,
 * so it stays crisp; a small diagram then gains detail at the larger sizes instead of every size
 * coming out the same.
 */
export const GIF_MAX_UPSCALE = 2;

/** The picture's pixel size at that limit: scaled to fit, and up to twice its own size. */
export function gifPixels(bounds: { width: number; height: number }, maxSide: number): { w: number; h: number } {
  const scale = Math.min(GIF_MAX_UPSCALE, maxSide / Math.max(bounds.width, bounds.height));
  return { w: Math.max(1, Math.round(bounds.width * scale)), h: Math.max(1, Math.round(bounds.height * scale)) };
}

export type GifRate = "smooth" | "light";

export const GIF_RATES: { id: GifRate; label: string; frameMs: number; hint: string }[] = [
  { id: "smooth", label: "Smooth", frameMs: 40, hint: "25 frames a second" },
  { id: "light", label: "Lighter file", frameMs: 80, hint: "12.5 frames a second, a file a third to a half smaller" },
];

export const DEFAULT_GIF_RATE: GifRate = "smooth";

const RATE_KEY = `${BRAND.storagePrefix}:gifRate`;

export function readGifRate(): GifRate {
  try {
    const v = localStorage.getItem(RATE_KEY);
    return GIF_RATES.some((r) => r.id === v) ? (v as GifRate) : DEFAULT_GIF_RATE;
  } catch {
    return DEFAULT_GIF_RATE;
  }
}

export function writeGifRate(rate: GifRate): void {
  try {
    localStorage.setItem(RATE_KEY, rate);
  } catch {
    // best-effort, as everywhere else this app uses storage
  }
}

/** How long a frame lasts at that rate, in milliseconds. */
export function frameMsOf(rate: GifRate): number {
  return GIF_RATES.find((r) => r.id === rate)!.frameMs;
}
