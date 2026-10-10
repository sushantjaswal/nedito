// Trace (A2, CLAUDE_HISTORY.md D117): click a shape and see what it touches — its lines and the
// shapes at their other ends; everything else dims. Session state only: never saved, never on the
// undo stack. Pure functions here; the store holds the current trace and the canvas draws it.
//
// It follows connections across levels. A line into a Nested Block lands on one of its ports, so
// tracing from outside lights that port; opening the block carries the trace inside, to the shape
// each lit port maps to; climbing back out carries a traced inner shape that a port maps to back
// out to its block.
import type { DiagramDocument, Diagram, NestedNode } from "../model/types";

export interface Trace {
  /** The level the trace is on. */
  diagramId: string;
  /** The shapes being traced, on that level. */
  focus: string[];
}

export interface TracedSet {
  /** The shapes being traced. */
  focus: Set<string>;
  /** The focus shapes and every shape one line away from them. */
  nodes: Set<string>;
  /** Every line touching a focus shape. */
  edges: Set<string>;
  /** Ports on that level's Nested Blocks where a traced line lands. */
  ports: Set<string>;
}

/** What a trace lights on its level. */
export function traceSet(diagram: Diagram, focus: string[]): TracedSet {
  const f = new Set(focus);
  const nodes = new Set(focus);
  const edges = new Set<string>();
  const ports = new Set<string>();
  for (const e of diagram.edges) {
    const s = e.source.nodeId;
    const t = e.target.nodeId;
    if (!(s && f.has(s)) && !(t && f.has(t))) continue;
    edges.add(e.id);
    if (s) nodes.add(s);
    if (t) nodes.add(t);
    if (e.source.portId) ports.add(e.source.portId);
    if (e.target.portId) ports.add(e.target.portId);
  }
  return { focus: f, nodes, edges, ports };
}

function blockFor(doc: DiagramDocument, parentId: string, childDiagramId: string): NestedNode | undefined {
  const n = doc.diagrams[parentId]?.nodes.find((x) => x.type === "nested" && x.childDiagramId === childDiagramId);
  return n?.type === "nested" ? n : undefined;
}

/**
 * The trace to carry into a Nested Block being opened: the shapes inside that the lit ports map
 * to. Null when the trace does not reach the block — or reaches it only through unmapped ports,
 * which have nothing inside to point at yet.
 */
export function carryInto(doc: DiagramDocument, trace: Trace | null, nestedNodeId: string): Trace | null {
  if (!trace) return null;
  const parent = doc.diagrams[trace.diagramId];
  const block = parent?.nodes.find((n) => n.id === nestedNodeId);
  if (!parent || block?.type !== "nested") return null;
  const lit = traceSet(parent, trace.focus);
  // Tracing the block itself lights all of its ports.
  const ports = block.ports.filter((p) => lit.ports.has(p.id) || trace.focus.includes(block.id));
  const inner = [...new Set(ports.map((p) => p.innerNodeId).filter((id): id is string => !!id))];
  return inner.length ? { diagramId: block.childDiagramId, focus: inner } : null;
}

/**
 * The trace to carry out of a level being left for its parent: its block, when a port maps to a
 * traced shape inside — so the reader comes out looking at where they went in. Null otherwise.
 */
export function carryOut(doc: DiagramDocument, trace: Trace | null, parentDiagramId: string): Trace | null {
  if (!trace) return null;
  const block = blockFor(doc, parentDiagramId, trace.diagramId);
  if (!block) return null;
  const f = new Set(trace.focus);
  return block.ports.some((p) => p.innerNodeId && f.has(p.innerNodeId)) ? { diagramId: parentDiagramId, focus: [block.id] } : null;
}

/** Inner shapes on this level whose ghost pill should light: those the trace focuses on. */
export function litInnerNodes(trace: Trace | null, diagramId: string): Set<string> {
  return new Set(trace && trace.diagramId === diagramId ? trace.focus : []);
}
