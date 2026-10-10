// Diagram motion: a saved, optional property of a shape, a line, a
// Nested Block or a whole diagram — never a playback mode. Absent means exactly as before motion
// existed, and a document that uses none is written exactly as before (format v5); one that uses
// any is format v6 (file/documentFormat.ts), so an older app refuses it instead of opening it,
// dropping the motion and saving over it.
//
// The whole approved model is defined and validated here, so v6 never changes shape as the
// renderers for each kind arrive PR by PR (A1: Flow and Pulse; later Packets, Throughput, Health,
// Draw in, Peek and the presentation modes). A kind with no renderer yet rests as its still form.
import type { DiagramDocument, Diagram, DNode, DEdge } from "./types";
import { updateDiagram } from "./actions";

export type MotionSpeed = "slow" | "normal" | "fast";
export const MOTION_SPEEDS: readonly MotionSpeed[] = ["slow", "normal", "fast"];

/** Continuous motion along a line: one kind per line. */
export type EdgeMotionKind = "flow" | "packets" | "throughput";
export const EDGE_MOTION_KINDS: readonly EdgeMotionKind[] = ["flow", "packets", "throughput"];

/** Which way along the line the motion travels (A1b, D118). */
export type FlowDirection = "forward" | "reverse" | "both";
export const FLOW_DIRECTIONS: readonly FlowDirection[] = ["forward", "reverse", "both"];

export interface EdgeMotion {
  kind: EdgeMotionKind;
  /** Omitted: normal. */
  speed?: MotionSpeed;
  /** Omitted: forward, from the line's start to its end — as before direction existed. */
  direction?: FlowDirection;
  /** Throughput only: 1 (a trickle) to 5 (a hot path), carried by line weight even when still. */
  volume?: number;
}

export type HealthState = "healthy" | "degraded" | "down";
export const HEALTH_STATES: readonly HealthState[] = ["healthy", "degraded", "down"];

/** Motion on a shape. Pulse draws attention; Health shows a status. They can be combined. */
export interface NodeMotion {
  pulse?: { ripple?: boolean };
  health?: HealthState;
}

export type PresentationMode = "build" | "walkthrough" | "spotlight";
export const PRESENTATION_MODES: readonly PresentationMode[] = ["build", "walkthrough", "spotlight"];

/** Whole-diagram motion. One presentation mode at most: exclusive by the shape of the data. */
export interface DiagramMotion {
  /** One-shot: lines trace themselves when the diagram first opens, in the viewer only. */
  drawIn?: true;
  presentation?: {
    mode: PresentationMode;
    /** Shape and line ids, in the author's order. */
    order: string[];
  };
}

/** Whether a document uses any motion at all — what makes it format v6. */
export function hasMotion(doc: DiagramDocument): boolean {
  return Object.values(doc.diagrams).some(
    (d) =>
      d.motion !== undefined ||
      d.edges.some((e) => e.motion !== undefined) ||
      d.nodes.some((n) => n.motion !== undefined || (n.type === "nested" && n.peek === true)),
  );
}

/**
 * How many things on one level move continuously — the structure a future motion budget
 * warning would read (the user asked for the count, not the warning, until real use is seen).
 * One-shots and presentation modes are not continuous per element, so they do not count.
 */
export function continuousMotionCount(diagram: Diagram): number {
  const edges = diagram.edges.filter((e) => e.motion !== undefined).length;
  const nodes = diagram.nodes.filter((n) => n.motion?.pulse !== undefined || n.motion?.health !== undefined).length;
  return edges + nodes;
}

export interface MotionProblem {
  diagramId: string;
  message: string;
}

const isOneOf = <T extends string>(values: readonly T[], v: unknown): v is T => typeof v === "string" && (values as readonly string[]).includes(v);

function edgeMotionProblem(e: DEdge): string | null {
  const m = e.motion as unknown;
  if (m === undefined) return null;
  if (typeof m !== "object" || m === null) return `line ${e.id}: motion is not an object`;
  const { kind, speed, volume, direction } = m as Record<string, unknown>;
  if (!isOneOf(EDGE_MOTION_KINDS, kind)) return `line ${e.id}: unknown motion "${String(kind)}"`;
  if (speed !== undefined && !isOneOf(MOTION_SPEEDS, speed)) return `line ${e.id}: unknown speed "${String(speed)}"`;
  if (direction !== undefined && !isOneOf(FLOW_DIRECTIONS, direction)) return `line ${e.id}: unknown direction "${String(direction)}"`;
  if (volume !== undefined && !(Number.isInteger(volume) && (volume as number) >= 1 && (volume as number) <= 5))
    return `line ${e.id}: volume must be a whole number from 1 to 5`;
  return null;
}

function nodeMotionProblem(n: DNode): string | null {
  const peek = (n as { peek?: unknown }).peek;
  if (peek !== undefined && !(n.type === "nested" && peek === true)) return `shape ${n.id}: peek is only for a Nested Block, and only true`;
  const m = n.motion as unknown;
  if (m === undefined) return null;
  if (typeof m !== "object" || m === null) return `shape ${n.id}: motion is not an object`;
  const { pulse, health } = m as Record<string, unknown>;
  if (pulse !== undefined) {
    if (typeof pulse !== "object" || pulse === null) return `shape ${n.id}: pulse is not an object`;
    const ripple = (pulse as Record<string, unknown>).ripple;
    if (ripple !== undefined && typeof ripple !== "boolean") return `shape ${n.id}: ripple must be true or false`;
  }
  if (health !== undefined && !isOneOf(HEALTH_STATES, health)) return `shape ${n.id}: unknown health "${String(health)}"`;
  return null;
}

function diagramMotionProblem(d: Diagram): string | null {
  const m = d.motion as unknown;
  if (m === undefined) return null;
  if (typeof m !== "object" || m === null) return "diagram motion is not an object";
  const { drawIn, presentation } = m as Record<string, unknown>;
  if (drawIn !== undefined && drawIn !== true) return "drawIn must be true when present";
  if (presentation !== undefined) {
    if (typeof presentation !== "object" || presentation === null) return "presentation is not an object";
    const { mode, order } = presentation as Record<string, unknown>;
    if (!isOneOf(PRESENTATION_MODES, mode)) return `unknown presentation "${String(mode)}"`;
    if (!Array.isArray(order) || order.some((id) => typeof id !== "string")) return "presentation order must be a list of ids";
    const ids = new Set([...d.nodes.map((n) => n.id), ...d.edges.map((e) => e.id)]);
    const missing = order.find((id) => !ids.has(id as string));
    if (missing !== undefined) return `presentation order names ${String(missing)}, which is not on this level`;
  }
  return null;
}

/** Every malformed motion property in the document; empty when all are well formed. */
export function motionProblems(doc: DiagramDocument): MotionProblem[] {
  const problems: MotionProblem[] = [];
  for (const d of Object.values(doc.diagrams)) {
    const own = diagramMotionProblem(d);
    if (own) problems.push({ diagramId: d.id, message: own });
    for (const n of d.nodes) {
      const p = nodeMotionProblem(n);
      if (p) problems.push({ diagramId: d.id, message: p });
    }
    for (const e of d.edges) {
      const p = edgeMotionProblem(e);
      if (p) problems.push({ diagramId: d.id, message: p });
    }
  }
  return problems;
}

// ---- Edits (pure; the store wraps each call in one undo entry).

/** Sets the lines' motion; null makes them still again, removing the property entirely. */
export function setEdgesMotion(doc: DiagramDocument, diagramId: string, edgeIds: string[], motion: EdgeMotion | null): DiagramDocument {
  const ids = new Set(edgeIds);
  return updateDiagram(doc, diagramId, (d) => ({
    ...d,
    edges: d.edges.map((e) => {
      if (!ids.has(e.id)) return e;
      const still: DEdge = { ...e };
      delete still.motion;
      if (!motion) return still;
      // A setting put back to its default is left out, not stored as undefined (D118).
      const kept = Object.fromEntries(Object.entries(motion).filter(([, v]) => v !== undefined)) as unknown as EdgeMotion;
      return { ...still, motion: kept };
    }),
  }));
}

/**
 * Merges Pulse and Health into the shapes' motion. A key set to null is removed, and a shape left
 * with neither loses the property entirely, so it is written exactly as before motion existed.
 */
export function setNodesMotion(
  doc: DiagramDocument,
  diagramId: string,
  nodeIds: string[],
  patch: { [K in keyof NodeMotion]?: NodeMotion[K] | null },
): DiagramDocument {
  const ids = new Set(nodeIds);
  return updateDiagram(doc, diagramId, (d) => ({
    ...d,
    nodes: d.nodes.map((n) => {
      if (!ids.has(n.id)) return n;
      const next: Record<string, unknown> = { ...(n.motion ?? {}) };
      for (const [k, v] of Object.entries(patch)) {
        if (v === null) delete next[k];
        else if (v !== undefined) next[k] = v;
      }
      const still: DNode = { ...n };
      delete still.motion;
      return Object.keys(next).length ? ({ ...still, motion: next as NodeMotion } as DNode) : still;
    }),
  }));
}

/**
 * Sets or clears Draw in on a diagram (A5, D121). A diagram left with no motion of its own loses
 * the property entirely, so it is written exactly as before.
 */
export function setDiagramDrawIn(doc: DiagramDocument, diagramId: string, on: boolean): DiagramDocument {
  return updateDiagram(doc, diagramId, (d) => {
    const next: DiagramMotion = { ...(d.motion ?? {}) };
    if (on) next.drawIn = true;
    else delete next.drawIn;
    const still: Diagram = { ...d };
    delete still.motion;
    return Object.keys(next).length ? { ...still, motion: next } : still;
  });
}

/** Sets or clears Peek on a Nested Block (A5, D121); off removes the property. */
export function setNestedPeek(doc: DiagramDocument, diagramId: string, nodeId: string, on: boolean): DiagramDocument {
  return updateDiagram(doc, diagramId, (d) => ({
    ...d,
    nodes: d.nodes.map((n) => {
      if (n.id !== nodeId || n.type !== "nested") return n;
      const still = { ...n };
      delete still.peek;
      return on ? { ...still, peek: true as const } : still;
    }),
  }));
}
