// Animated GIF export: the diagram as it moves on the canvas, as a
// picture that plays anywhere an image can go — a web page, a social post, a chat.
//
// Each frame is the ordinary SVG export drawn at one moment of the motion (svgExport's `frame`):
// Flow and Throughput march, Packets travel, Pulse glows, Health blinks and the animated icons
// move by the canvas's own CSS, paused at that moment (motionFrameCss.ts); Build reveals its steps,
// Spotlight moves its focus and Walkthrough walks its dot. A diagram with no motion makes a still,
// one-frame GIF. Frames are rasterised as the PNG export is and encoded in-repo (gifEncoder.ts).
import { buildHidden, effectiveOrder, spotlightLit } from "../model/presentation";
import type { Diagram } from "../model/types";
import { keyedFraction } from "../canvas/motionStyle";
import { walkTiming } from "../canvas/stepGeometry";
import { stepPoint } from "../canvas/stepPoint";
import { BUILD_HOLD_MS, BUILD_START_MS, BUILD_STEP_MS, SPOTLIGHT_STEP_MS } from "../canvas/usePresentation";
import { gifPalette, GifStreamEncoder, type GifFrame } from "./gifEncoder";
import { gifPixels } from "./gifSize";
import { computeDiagramBounds, renderDiagramSvg, type MotionFrame, type SvgExportOptions } from "./svgExport";

/**
 * 25 frames a second (D140; was 12.5, which looked jerky). A GIF keeps each frame's time in
 * hundredths of a second, and browsers slow anything under 2 of them to 10 — so 4 hundredths is
 * the smoothest rate a GIF plays at reliably everywhere. It also catches every step of a Flow
 * line's march, which moves about 20 times a second.
 */
export const GIF_FRAME_MS = 40;
/** The most frames one GIF holds; a longer animation gets fewer frames a second instead. */
export const GIF_MAX_FRAMES = 300;
/** The longest side of a GIF, in pixels: big enough for a post, small enough to share. */
export const GIF_MAX_SIDE = 1200;
/** One loop of continuous motion, in seconds: a whole number of every icon's own cycle. */
export const GIF_LOOP_S = 4.8;
/** Spotlight shows at most this many steps before it loops. */
const SPOTLIGHT_MAX_STEPS = 10;

/** Whether anything on this level moves — if not, its GIF is a single still frame. */
export function moves(diagram: Diagram): boolean {
  if (diagram.motion?.presentation) return true;
  if (diagram.edges.some((e) => e.motion)) return true;
  return diagram.nodes.some(
    (n) =>
      n.motion?.pulse !== undefined ||
      n.motion?.health === "degraded" ||
      n.motion?.health === "down" ||
      (n.type === "shape" && n.shapeRef.startsWith("animated/")),
  );
}

/** How long one loop lasts, in seconds, and the moments its frames show. */
/**
 * How long one loop lasts and the moments its frames show. `baseMs` is the time a frame is meant
 * to last — GIF_FRAME_MS, or longer for a lighter file (G4, D142); a long loop stretches it further
 * to stay under the frame cap.
 */
export function gifPlan(diagram: Diagram, baseMs: number = GIF_FRAME_MS): { times: number[]; frameMs: number } {
  if (!moves(diagram)) return { times: [0], frameMs: baseMs };
  const p = diagram.motion?.presentation;
  const steps = p ? effectiveOrder(diagram).length : 0;
  let seconds = GIF_LOOP_S;
  if (p?.mode === "build" && steps) seconds = (BUILD_START_MS + (steps - 1) * BUILD_STEP_MS + BUILD_HOLD_MS * 1.5) / 1000;
  if (p?.mode === "spotlight" && steps) seconds = (Math.min(steps, SPOTLIGHT_MAX_STEPS) * SPOTLIGHT_STEP_MS) / 1000;
  if (p?.mode === "walkthrough") seconds = walk(diagram)?.timing.dur ?? GIF_LOOP_S;
  // Whole hundredths of a second, as a GIF stores them, so the loop keeps its length exactly.
  const frameMs = Math.max(baseMs, Math.ceil((seconds * 1000) / GIF_MAX_FRAMES / 10) * 10);
  const count = Math.max(1, Math.round((seconds * 1000) / frameMs));
  return { times: Array.from({ length: count }, (_, i) => (i * frameMs) / 1000), frameMs };
}

function walk(diagram: Diagram) {
  const points = effectiveOrder(diagram)
    .map((id) => stepPoint(diagram, id))
    .filter((pt): pt is { x: number; y: number } => pt !== null);
  const timing = walkTiming(points);
  return timing ? { points, timing } : null;
}

/** A point a fraction of the way along a polyline, by length. */
function alongPolyline(points: { x: number; y: number }[], f: number): { x: number; y: number } {
  const lengths = [0];
  for (let i = 1; i < points.length; i++) lengths.push(lengths[i - 1] + Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y));
  const target = f * lengths[lengths.length - 1];
  for (let i = 1; i < points.length; i++) {
    if (target <= lengths[i]) {
      const span = lengths[i] - lengths[i - 1];
      const k = span > 0 ? (target - lengths[i - 1]) / span : 0;
      return { x: points[i - 1].x + (points[i].x - points[i - 1].x) * k, y: points[i - 1].y + (points[i].y - points[i - 1].y) * k };
    }
  }
  return points[points.length - 1];
}

/** What a frame at `t` seconds shows of the level's presentation, beside its continuous motion. */
export function frameAt(diagram: Diagram, t: number): MotionFrame {
  const p = diagram.motion?.presentation;
  const frame: MotionFrame = { t };
  if (!p) return frame;
  const order = effectiveOrder(diagram);
  if (p.mode === "build") {
    const shown = order.filter((_, i) => BUILD_START_MS + i * BUILD_STEP_MS <= t * 1000).length;
    frame.hidden = buildHidden(diagram, shown);
  }
  if (p.mode === "spotlight" && order.length) {
    const step = order[Math.floor((t * 1000) / SPOTLIGHT_STEP_MS) % Math.min(order.length, SPOTLIGHT_MAX_STEPS)];
    frame.lit = spotlightLit(diagram, step);
  }
  if (p.mode === "walkthrough") {
    const w = walk(diagram);
    if (w) {
      const phase = (t % w.timing.dur) / w.timing.dur;
      frame.walkDot = alongPolyline(w.points, keyedFraction(w.timing.keyPoints, w.timing.keyTimes, phase));
    }
  }
  return frame;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Failed to draw a GIF frame"));
    img.src = src;
  });
}

export interface GifExportOptions extends SvgExportOptions {
  /** The picture's longest side, in pixels (gifSize.ts); GIF_MAX_SIDE when not given. */
  maxSide?: number;
  /** How long each frame lasts, in milliseconds (gifSize.ts); GIF_FRAME_MS when not given. */
  frameMs?: number;
  /** Called after each frame is drawn, with how many of how many. */
  onProgress?: (done: number, total: number) => void;
}

/** The level as an animated GIF (one still frame when nothing on it moves). */
export async function diagramToGifBlob(diagram: Diagram, options: GifExportOptions = {}): Promise<Blob> {
  const { width, height } = computeDiagramBounds(diagram, options.padding);
  const { w, h } = gifPixels({ width, height }, options.maxSide ?? GIF_MAX_SIDE);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Canvas 2D context unavailable");
  const background = options.background ?? diagram.background ?? "#ffffff";

  const plan = gifPlan(diagram, options.frameMs);
  const moving = moves(diagram);
  const draw = async (t: number): Promise<GifFrame> => {
    const svg = await renderDiagramSvg(diagram, { ...options, background, ...(moving ? { frame: frameAt(diagram, t) } : {}) });
    const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml;charset=utf-8" }));
    try {
      const img = await loadImage(url);
      ctx.fillStyle = background;
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);
      return { rgba: ctx.getImageData(0, 0, w, h).data, delayMs: plan.frameMs };
    } finally {
      URL.revokeObjectURL(url);
    }
  };

  // The palette first, from a few moments spread over the loop, so each frame can be encoded as
  // soon as it is drawn and let go (D143) — a large GIF's frames would not fit in memory at once.
  const samples = [...new Set([0, 0.2, 0.4, 0.6, 0.8].map((f) => plan.times[Math.floor(f * plan.times.length)]))];
  const sampled: GifFrame[] = [];
  for (const t of samples) sampled.push(await draw(t));
  const encoder = new GifStreamEncoder(w, h, gifPalette(sampled, w, h), plan.times.length > 1);
  sampled.length = 0;

  let done = 0;
  for (const t of plan.times) {
    encoder.addFrame(await draw(t));
    options.onProgress?.(++done, plan.times.length);
    // Let the page breathe between frames.
    await new Promise((r) => setTimeout(r, 0));
  }
  const bytes = encoder.finish();
  return new Blob([bytes as BlobPart], { type: "image/gif" });
}
