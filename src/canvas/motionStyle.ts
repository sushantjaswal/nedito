// How motion is drawn (D116): shared by the canvas, which animates it, and the still exports,
// which draw its resting state — so the two can never disagree about what a line looks like.
import type { DEdge } from "../model/types";
import type { MotionSpeed } from "../model/motion";
import { DASH_PATTERNS } from "./shapeEffects";
import { pathPointAt, pathPoints, type Point } from "./edgeGeometry";

/** Flow's own pattern, for a solid line: the marching dashes. */
export const FLOW_DASH = "8 6";

/** How many pattern lengths a both-ways line travels before it turns. */
const BOTH_WAYS_LENGTHS = 4;

/** Seconds to march one whole pattern length. */
const FLOW_SECONDS: Record<MotionSpeed, number> = { slow: 1.4, normal: 0.7, fast: 0.35 };

/**
 * The dash pattern a line is drawn with: its own dash style, or — for a Flow line without one —
 * Flow's pattern. This is also Flow's resting state: a still export shows the dashes, standing.
 */
export function edgeDashArray(edge: Pick<DEdge, "style" | "motion">): string | undefined {
  const own = DASH_PATTERNS[edge.style.dash as string];
  if (own) return own;
  return marches(edge) ? FLOW_DASH : undefined;
}

/** Flow and Throughput march their dashes; Packets sends a dot along a plain line (A3, D119). */
function marches(edge: Pick<DEdge, "motion">): boolean {
  return edge.motion?.kind === "flow" || edge.motion?.kind === "throughput";
}

/** Throughput's volume when unset: the middle of 1–5. */
const DEFAULT_VOLUME = 3;

/**
 * A Throughput line's weight (A3, D119): its own width, scaled by its volume — about 1× at 1 up
 * to 2.35× at 5 — so the line carries the volume even when nothing moves. Its own width otherwise.
 */
export function edgeStrokeWidth(edge: Pick<DEdge, "motion">, base: number): number {
  if (edge.motion?.kind !== "throughput") return base;
  const v = edge.motion.volume ?? DEFAULT_VOLUME;
  return Math.round(base * (0.6 + 0.35 * v) * 100) / 100;
}

/**
 * The CSS custom properties that run Flow on a line: one whole pattern length per cycle, so the
 * loop is seamless whatever the pattern. Undefined when the line does not flow (yet — Packets and
 * Throughput are drawn from A3).
 */
export function flowVars(edge: Pick<DEdge, "style" | "motion">): Record<string, string> | undefined {
  if (!marches(edge) || !edge.motion) return undefined;
  const pattern = edgeDashArray(edge) ?? FLOW_DASH;
  const cycle = pattern.split(/\s+/).map(Number).reduce((a, b) => a + b, 0);
  // Throughput marches faster the more it carries (A3, D119): 1.3× the time at volume 1, half at 5.
  const volumeFactor = edge.motion.kind === "throughput" ? 1.5 - 0.2 * (edge.motion.volume ?? DEFAULT_VOLUME) : 1;
  const seconds = Math.round(FLOW_SECONDS[edge.motion.speed ?? "normal"] * volumeFactor * 1000) / 1000;
  const direction = edge.motion.direction ?? "forward";
  // Both ways (A1b, D118): travel several pattern lengths one way, then as far back — a march
  // that visibly turns, read as traffic in both directions. One pattern there and back would be
  // a jitter.
  const lengths = direction === "both" ? BOTH_WAYS_LENGTHS : 1;
  const travel = cycle * lengths;
  // A negative offset marches the dashes from the line's start to its end; positive, back.
  const shift = direction === "reverse" ? travel : -travel;
  // One step per pixel of travel (styles/motion.css explains why it steps).
  return {
    "--nd-flow-shift": `${shift}px`,
    "--nd-flow-duration": `${seconds * lengths}s`,
    "--nd-flow-steps": String(Math.max(1, Math.round(travel))),
    "--nd-flow-turn": direction === "both" ? "alternate" : "normal",
  };
}

/** Classes for a line's path: Flow marches; everything animated carries nd-anim, the off switch. */
export function flowClass(edge: Pick<DEdge, "motion">): string | undefined {
  return marches(edge) ? "nd-anim nd-flow" : undefined;
}

/**
 * A line lit by a trace (D117) marches as Flow does, at its own speed if it has one, so the
 * reader sees what the shape talks to and which way. Stopped by the same switches as all motion,
 * when it rests as Flow's dashes.
 */
export function asTraced(edge: Pick<DEdge, "style" | "motion">): Pick<DEdge, "style" | "motion"> {
  // A line that already moves keeps its own motion; a still one marches as Flow does.
  if (edge.motion?.kind === "flow" || edge.motion?.kind === "packets" || edge.motion?.kind === "throughput") return edge;
  const { speed, direction } = edge.motion ?? {};
  return { ...edge, motion: { kind: "flow", ...(speed ? { speed } : {}), ...(direction ? { direction } : {}) } };
}

// ---- Packets (A3, D119): a dot travelling the line.

/** How fast a packet travels, in canvas pixels a second. */
const PACKET_SPEED: Record<MotionSpeed, number> = { slow: 60, normal: 120, fast: 240 };

/** Where a packet rests when nothing moves: 60% of the way along, in the direction it travels. */
export const PACKET_REST_AT = 0.6;

function pathLength(d: string): number {
  const pts = pathPoints(d);
  let total = 0;
  for (let i = 1; i < pts.length; i++) total += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  return total;
}

export interface PacketTiming {
  /** Seconds for one journey (both ways: there and back). */
  dur: number;
  keyPoints: string;
  keyTimes: string;
}

/**
 * The timing for SVG's <animateMotion> along path `d`: a constant speed whatever the line's
 * length, and the direction as key points — start to end, end to start, or there and back.
 */
export function packetTiming(d: string, edge: Pick<DEdge, "motion">): PacketTiming {
  const speed = PACKET_SPEED[edge.motion?.speed ?? "normal"];
  const one = Math.max(0.6, pathLength(d) / speed);
  const direction = edge.motion?.direction ?? "forward";
  const round = (n: number) => Math.round(n * 100) / 100;
  if (direction === "reverse") return { dur: round(one), keyPoints: "1;0", keyTimes: "0;1" };
  if (direction === "both") return { dur: round(one * 2), keyPoints: "0;1;0", keyTimes: "0;0.5;1" };
  return { dur: round(one), keyPoints: "0;1", keyTimes: "0;1" };
}

/** Where the packet is drawn when still — on screen with motion off, and in every export. */
export function packetRestPoint(d: string, edge: Pick<DEdge, "motion">): Point | null {
  return pathPointAt(d, edge.motion?.direction === "reverse" ? 1 - PACKET_REST_AT : PACKET_REST_AT);
}

/** The packet's radius: a touch bigger on a heavier line. */
export function packetRadius(strokeWidth: number): number {
  return Math.max(4, strokeWidth * 1.6);
}

/** The fraction along a key-pointed animation at `phase` (0..1 of its cycle), as <animateMotion> moves. */
export function keyedFraction(keyPoints: string, keyTimes: string, phase: number): number {
  const pts = keyPoints.split(";").map(Number);
  const times = keyTimes.split(";").map(Number);
  for (let i = 1; i < times.length; i++) {
    if (phase <= times[i]) {
      const span = times[i] - times[i - 1];
      const k = span > 0 ? (phase - times[i - 1]) / span : 1;
      return pts[i - 1] + (pts[i] - pts[i - 1]) * k;
    }
  }
  return pts[pts.length - 1];
}

/** Where the packet is `t` seconds in: for a moving picture, where the canvas would show it (G1). */
export function packetPointAt(d: string, edge: Pick<DEdge, "motion">, t: number): Point | null {
  const timing = packetTiming(d, edge);
  const phase = (((t % timing.dur) + timing.dur) % timing.dur) / timing.dur;
  return pathPointAt(d, keyedFraction(timing.keyPoints, timing.keyTimes, phase));
}
