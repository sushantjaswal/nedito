// Pure search logic for Find/Replace. draw.io's Find/Replace searches
// shape and edge labels in the current diagram, lets you step through matches (selecting and
// centering the canvas on each), and replace the current match or all of them. Kept as plain
// functions over a Diagram so this is unit-testable without mounting the canvas.
import type { DEdge, Diagram, DNode } from "./types";

export interface FindMatch {
  kind: "node" | "edge";
  id: string;
  text: string;
}

function textContains(haystack: string, needle: string, matchCase: boolean): boolean {
  if (needle === "") return false;
  return matchCase ? haystack.includes(needle) : haystack.toLowerCase().includes(needle.toLowerCase());
}

export function findMatches(diagram: Diagram, query: string, matchCase: boolean): FindMatch[] {
  const matches: FindMatch[] = [];
  if (query === "") return matches;
  for (const node of diagram.nodes) {
    const text = node.label?.text;
    if (text !== undefined && textContains(text, query, matchCase)) {
      matches.push({ kind: "node", id: node.id, text });
    }
  }
  for (const edge of diagram.edges) {
    const text = edge.label?.text;
    if (text !== undefined && textContains(text, query, matchCase)) {
      matches.push({ kind: "edge", id: edge.id, text });
    }
  }
  return matches;
}

function replaceText(source: string, query: string, replacement: string, matchCase: boolean): string {
  if (query === "") return source;
  const flags = matchCase ? "g" : "gi";
  const pattern = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), flags);
  return source.replace(pattern, replacement);
}

// Applies a replacement to exactly one match (by id/kind) and returns the new label text, or
// undefined if that node/edge no longer has a matching label (already changed, or not found).
export function replaceOne(
  diagram: Diagram,
  match: FindMatch,
  query: string,
  replacement: string,
  matchCase: boolean,
): string | undefined {
  const items: (DNode | DEdge)[] = match.kind === "node" ? diagram.nodes : diagram.edges;
  const item = items.find((i) => i.id === match.id);
  const text = item?.label?.text;
  if (text === undefined || !textContains(text, query, matchCase)) return undefined;
  return replaceText(text, query, replacement, matchCase);
}
