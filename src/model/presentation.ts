// Presentation (A6, CLAUDE_HISTORY.md D123): one whole-diagram mode at most — Build, Walkthrough
// or Spotlight — saved in `Diagram.motion.presentation` with the author's order of steps. The
// modes are exclusive by the shape of the data (one `mode`), never by a warning.
//
// The order holds shape and line ids. Until the author sets one it is the shapes' reading order
// (top to bottom, then left to right), so choosing a mode alone already does something sensible;
// the first change to a step writes that order out and edits it. An id whose shape was deleted
// stays in memory, so undo brings its step back, and is dropped whenever the document is written
// (pruneOrders, called by encodeDoc) — the file never names a shape that is not there.
import { updateDiagram } from "./actions";
import type { DiagramMotion, PresentationMode } from "./motion";
import type { DEdge, Diagram, DiagramDocument, DNode } from "./types";

export const PRESENTATION_LABEL: Record<PresentationMode, string> = {
  build: "Build",
  walkthrough: "Walkthrough",
  spotlight: "Spotlight",
};

export const PRESENTATION_HINT: Record<PresentationMode, string> = {
  build: "Readers see it appear, step by step, in your order.",
  walkthrough: "Numbered steps, and a dot travelling the path between them. Nothing is hidden.",
  spotlight: "Focus moves from step to step on its own; the rest steps back.",
};

/** Shapes a step can be: everything but a group's frame, whose shapes are steps of their own. */
function steppable(n: DNode): boolean {
  return n.type !== "group";
}

/** Top to bottom, then left to right; shapes whose tops are within a row's reach share it. */
export function readingOrder(d: Diagram): string[] {
  const ROW = 40;
  const nodes = d.nodes.filter(steppable).sort((a, b) => a.position.y - b.position.y || a.position.x - b.position.x);
  const rows: DNode[][] = [];
  for (const n of nodes) {
    const row = rows[rows.length - 1];
    if (row && n.position.y - row[0].position.y < ROW) row.push(n);
    else rows.push([n]);
  }
  return rows.flatMap((row) => row.sort((a, b) => a.position.x - b.position.x).map((n) => n.id));
}

function idsOn(d: Diagram): Set<string> {
  return new Set([...d.nodes.filter(steppable).map((n) => n.id), ...d.edges.map((e) => e.id)]);
}

/** Whether the author has set an order of their own (one that still names something here). */
export function hasOwnOrder(d: Diagram): boolean {
  const order = d.motion?.presentation?.order ?? [];
  const ids = idsOn(d);
  return order.some((id) => ids.has(id));
}

/** The steps as a reader meets them: the author's order, or the reading order until there is one. */
export function effectiveOrder(d: Diagram): string[] {
  const p = d.motion?.presentation;
  if (!p) return [];
  const ids = idsOn(d);
  const own = p.order.filter((id) => ids.has(id));
  return own.length ? own : readingOrder(d);
}

function withPresentation(d: Diagram, presentation: DiagramMotion["presentation"] | null): Diagram {
  const next: DiagramMotion = { ...(d.motion ?? {}) };
  if (presentation) next.presentation = presentation;
  else delete next.presentation;
  const still: Diagram = { ...d };
  delete still.motion;
  return Object.keys(next).length ? { ...still, motion: next } : still;
}

/**
 * Chooses the diagram's presentation mode, or none. Switching modes keeps the order; none removes
 * it, and a diagram left with no motion of its own loses the property entirely.
 */
export function setPresentationMode(doc: DiagramDocument, diagramId: string, mode: PresentationMode | null): DiagramDocument {
  return updateDiagram(doc, diagramId, (d) =>
    withPresentation(d, mode ? { mode, order: d.motion?.presentation?.order ?? [] } : null),
  );
}

/** Replaces the order. An empty one means the reading order again. */
export function setPresentationOrder(doc: DiagramDocument, diagramId: string, order: string[]): DiagramDocument {
  return updateDiagram(doc, diagramId, (d) => {
    const p = d.motion?.presentation;
    return p ? withPresentation(d, { mode: p.mode, order: [...new Set(order)] }) : d;
  });
}

// ---- Step edits, on the order a reader sees (so the first edit writes the reading order out).

/** Adds the ids, in reading order among themselves, after the last step. */
export function addSteps(d: Diagram, ids: string[]): string[] {
  const order = effectiveOrder(d);
  const rank = new Map(readingOrder(d).map((id, i) => [id, i]));
  const fresh = ids.filter((id) => !order.includes(id)).sort((a, b) => (rank.get(a) ?? 1e9) - (rank.get(b) ?? 1e9));
  return [...order, ...fresh];
}

export function removeSteps(d: Diagram, ids: string[]): string[] {
  const drop = new Set(ids);
  return effectiveOrder(d).filter((id) => !drop.has(id));
}

/** Moves one step earlier (-1) or later (+1); at either end it stays. */
export function moveStep(d: Diagram, id: string, delta: -1 | 1): string[] {
  const order = effectiveOrder(d);
  const i = order.indexOf(id);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= order.length) return order;
  const next = [...order];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}

/** Each id's step number, from 1. */
export function stepNumbers(d: Diagram): Map<string, number> {
  return new Map(effectiveOrder(d).map((id, i) => [id, i + 1]));
}

/** Drops ids no longer on their level — what encodeDoc writes, so a file never names a ghost. */
export function pruneOrders(diagrams: Record<string, Diagram>): Record<string, Diagram> {
  const out: Record<string, Diagram> = {};
  for (const [id, d] of Object.entries(diagrams)) {
    const p = d.motion?.presentation;
    if (!p) {
      out[id] = d;
      continue;
    }
    const ids = new Set([...d.nodes.map((n) => n.id), ...d.edges.map((e) => e.id)]);
    const order = p.order.filter((x) => ids.has(x));
    out[id] = order.length === p.order.length ? d : { ...d, motion: { ...d.motion, presentation: { mode: p.mode, order } } };
  }
  return out;
}

// ---- Build: what is showing after each step.

/**
 * What Build shows once `shown` steps have appeared. Shapes outside the order are there from
 * the start, as context; a line outside it appears with the later of its two ends. Returns the
 * ids still hidden.
 */
export function buildHidden(d: Diagram, shown: number): Set<string> {
  const order = effectiveOrder(d);
  const hidden = new Set(order.slice(shown));
  const inOrder = new Set(order);
  for (const e of d.edges) {
    if (inOrder.has(e.id)) continue;
    if (endHidden(e, hidden)) hidden.add(e.id);
  }
  return hidden;
}

function endHidden(e: DEdge, hidden: Set<string>): boolean {
  return (e.source.nodeId !== undefined && hidden.has(e.source.nodeId)) || (e.target.nodeId !== undefined && hidden.has(e.target.nodeId));
}

// ---- Spotlight: what stays lit while one step has the focus.

/** The step itself; for a line, the shapes at its ends too, so the line reads as a connection. */
export function spotlightLit(d: Diagram, stepId: string): { nodes: Set<string>; edges: Set<string> } {
  const edge = d.edges.find((e) => e.id === stepId);
  if (!edge) return { nodes: new Set([stepId]), edges: new Set() };
  const nodes = new Set<string>();
  if (edge.source.nodeId) nodes.add(edge.source.nodeId);
  if (edge.target.nodeId) nodes.add(edge.target.nodeId);
  return { nodes, edges: new Set([edge.id]) };
}
