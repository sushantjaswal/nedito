// Proposing a decomposition: which shapes on a crowded level belong together, so each group can
// become a Nested Block.
//
// Pure and side-effect free. It reads a diagram and returns groups of node ids; it never moves,
// renames or converts anything. Applying a proposal is a separate step, over
// convertSelectionToNested, which already handles the hard part — moving the shapes, making a port
// out of every connection that crossed a group's boundary, and rewriting those connections.
//
// Four signals decide what belongs together, in this order of authority:
//
//   1. An existing group is atomic. The author already said these belong together, so the
//      proposal never splits one — the same rule layout.ts's layoutTargets follows.
//   2. Connections. Shapes that talk to each other, and shapes that talk to the same neighbours
//      even when not joined directly (a set of workers around one queue).
//   3. Position. Shapes drawn near each other belong together. Every clustering approach built on
//      graph structure alone throws this away, which is why their groupings are defensible and
//      still feel wrong: the author, or whoever drew the file this was imported from, had already
//      said something by putting these two boxes side by side.
//   4. Shared words in the labels, lightly — "auth-service" and "auth-db" — and the same layer.
//
// Deterministic by construction: every list is ordered, and every tie breaks on node id, so the
// same diagram always proposes the same groups. A proposal nobody can reproduce is one nobody can
// test or trust.
import type { Diagram, DNode } from "./types";

/** One proposed Nested Block: the shapes that would move into it, and a name to start from. */
export interface Cluster {
  /** Node ids, in the diagram's own order. A group's own node and its children travel together. */
  nodeIds: string[];
  /** A starting name. Expected to be wrong often; renaming a block renames its child diagram. */
  name: string;
}

export interface Decomposition {
  clusters: Cluster[];
  /** Shapes that stay on this level, because they belong with nothing in particular. */
  loose: string[];
}

export interface DecomposeWeights {
  /** Joined by at least one connection. */
  edge: number;
  /** Each connection beyond the first, up to a point. */
  edgeExtra: number;
  /** How much of their neighbourhood two shapes share. */
  neighbour: number;
  /** How close they are drawn, against the diagram's own size. */
  space: number;
  /** Words their labels have in common. */
  label: number;
  /** The same layer. */
  layer: number;
}

export interface DecomposeOptions {
  /** Below this many shapes a level is already readable, and nothing is proposed. */
  minLevelSize: number;
  /** A group of fewer shapes than this is not worth a block of its own. */
  minCluster: number;
  /** Keep merging while there are more groups than this. */
  targetMax: number;
  /** Stop merging at this many, even if the affinity is still high. */
  targetMin: number;
  /** Below this, two groups are not related enough to merge on affinity alone. */
  mergeThreshold: number;
  weights: DecomposeWeights;
}

export const DEFAULT_DECOMPOSE: DecomposeOptions = {
  minLevelSize: 12,
  minCluster: 3,
  targetMax: 9,
  targetMin: 5,
  mergeThreshold: 0.45,
  weights: { edge: 1, edgeExtra: 0.2, neighbour: 0.6, space: 0.5, label: 0.4, layer: 0.3 },
};

/** An atomic unit: one shape, or a group with everything inside it. */
interface Unit {
  ids: string[];
  cx: number;
  cy: number;
  tokens: Set<string>;
  layerId?: string;
}

/** Words worth comparing: three letters or more, so "db" and "to" do not tie everything together. */
function tokensOf(text: string | undefined): string[] {
  if (!text) return [];
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 3);
}

function jaccard<T>(a: Set<T>, b: Set<T>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let shared = 0;
  for (const v of a) if (b.has(v)) shared += 1;
  return shared / (a.size + b.size - shared);
}

/**
 * Atomic units, by union-find over group membership. Transitive on purpose: a group inside a
 * group still comes out as one unit, which a single pass over childIds would miss.
 */
function unitsOf(diagram: Diagram): Unit[] {
  const index = new Map<string, number>();
  diagram.nodes.forEach((n, i) => index.set(n.id, i));
  const parent = diagram.nodes.map((_, i) => i);
  const find = (i: number): number => {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]];
      i = parent[i];
    }
    return i;
  };
  const union = (a: number, b: number) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[Math.max(ra, rb)] = Math.min(ra, rb);
  };
  for (const node of diagram.nodes) {
    if (node.type !== "group") continue;
    const self = index.get(node.id);
    if (self === undefined) continue;
    for (const childId of node.childIds) {
      const child = index.get(childId);
      if (child !== undefined) union(self, child);
    }
  }

  const byRoot = new Map<number, DNode[]>();
  diagram.nodes.forEach((n, i) => {
    const root = find(i);
    const list = byRoot.get(root);
    if (list) list.push(n);
    else byRoot.set(root, [n]);
  });

  return [...byRoot.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, members]) => {
      const left = Math.min(...members.map((m) => m.position.x));
      const right = Math.max(...members.map((m) => m.position.x + m.size.w));
      const top = Math.min(...members.map((m) => m.position.y));
      const bottom = Math.max(...members.map((m) => m.position.y + m.size.h));
      const tokens = new Set<string>();
      for (const m of members) for (const t of tokensOf(m.label?.text)) tokens.add(t);
      return {
        ids: members.map((m) => m.id),
        cx: (left + right) / 2,
        cy: (top + bottom) / 2,
        tokens,
        layerId: members[0].layerId,
      };
    });
}

/** The diagram's own diagonal, so distance means the same on a small level and a sprawling one. */
function diagonalOf(units: Unit[]): number {
  if (units.length < 2) return 1;
  const xs = units.map((u) => u.cx);
  const ys = units.map((u) => u.cy);
  const w = Math.max(...xs) - Math.min(...xs);
  const h = Math.max(...ys) - Math.min(...ys);
  return Math.max(Math.hypot(w, h), 1);
}

/**
 * How strongly two units belong together. Deliberately a sum of plain, separable terms: when a
 * proposal looks wrong, it has to be possible to say which signal was responsible.
 */
function affinityMatrix(diagram: Diagram, units: Unit[], o: DecomposeOptions): number[][] {
  const unitOf = new Map<string, number>();
  units.forEach((u, i) => u.ids.forEach((id) => unitOf.set(id, i)));

  const n = units.length;
  const between: number[][] = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  const neighbours: Set<number>[] = Array.from({ length: n }, () => new Set<number>());
  for (const edge of diagram.edges) {
    // A free end belongs to no shape, so it says nothing about what belongs with what.
    const a = edge.source.nodeId ? unitOf.get(edge.source.nodeId) : undefined;
    const b = edge.target.nodeId ? unitOf.get(edge.target.nodeId) : undefined;
    if (a === undefined || b === undefined || a === b) continue;
    between[a][b] += 1;
    between[b][a] += 1;
    neighbours[a].add(b);
    neighbours[b].add(a);
  }

  const diagonal = diagonalOf(units);
  const w = o.weights;
  const m: number[][] = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  for (let i = 0; i < n; i += 1) {
    for (let j = i + 1; j < n; j += 1) {
      const count = between[i][j];
      let score = 0;
      if (count > 0) score += w.edge + (w.edgeExtra * Math.min(count - 1, 2)) / 2;
      score += w.neighbour * jaccard(neighbours[i], neighbours[j]);
      const distance = Math.hypot(units[i].cx - units[j].cx, units[i].cy - units[j].cy);
      score += w.space * Math.max(0, 1 - distance / diagonal);
      score += w.label * jaccard(units[i].tokens, units[j].tokens);
      if (units[i].layerId && units[i].layerId === units[j].layerId) score += w.layer;
      m[i][j] = score;
      m[j][i] = score;
    }
  }
  return m;
}

/** Average affinity across every pair of units spanning two groups. */
function linkage(a: number[], b: number[], m: number[][]): number {
  let total = 0;
  for (const i of a) for (const j of b) total += m[i][j];
  return total / (a.length * b.length);
}

/**
 * The best pair to merge. Ties break on the lowest unit index on either side, so the result never
 * depends on iteration order.
 */
function bestPair(groups: number[][], m: number[][]): { i: number; j: number; score: number } | null {
  let best: { i: number; j: number; score: number } | null = null;
  for (let i = 0; i < groups.length; i += 1) {
    for (let j = i + 1; j < groups.length; j += 1) {
      const score = linkage(groups[i], groups[j], m);
      if (score <= 0) continue;
      if (!best || score > best.score + 1e-9) best = { i, j, score };
    }
  }
  return best;
}

/**
 * A name to start from: a shared word, else the best-connected shape's label, else a number.
 *
 * Only words from short, single-line labels count. A UML class carries its attribute list in its
 * label and an ER table its columns, so on that corpus the shared word was "Amount", "String",
 * "PK" and "ADDRESS" — frequent, shared, and no kind of name. Those words are still worth having
 * for affinity, where two tables sharing a column really is a sign they belong together; they are
 * only useless as a title. Naming and relatedness read the labels differently on purpose.
 */
function nameFor(units: Unit[], members: number[], diagram: Diagram, ordinal: number): string {
  const nameable = new Set<string>();
  const ownIds = new Set(members.flatMap((u) => units[u].ids));
  for (const node of diagram.nodes) {
    if (!ownIds.has(node.id)) continue;
    const text = node.label?.text ?? "";
    if (/[\r\n]/.test(text) || text.length > 28) continue;
    for (const t of tokensOf(text)) nameable.add(`${node.id}:${t}`);
  }
  const counts = new Map<string, number>();
  for (const key of nameable) {
    const token = key.slice(key.indexOf(":") + 1);
    counts.set(token, (counts.get(token) ?? 0) + 1);
  }
  const shared = [...counts.entries()]
    .filter(([, c]) => c >= 2 && c >= ownIds.size / 3)
    .sort((a, b) => b[1] - a[1] || b[0].length - a[0].length || a[0].localeCompare(b[0]));
  if (shared.length > 0) {
    const word = shared[0][0];
    return word.charAt(0).toUpperCase() + word.slice(1);
  }

  const degree = new Map<string, number>();
  for (const e of diagram.edges) {
    for (const end of [e.source.nodeId, e.target.nodeId]) {
      if (end && ownIds.has(end)) degree.set(end, (degree.get(end) ?? 0) + 1);
    }
  }
  const labelled = diagram.nodes
    .filter((n) => ownIds.has(n.id) && (n.label?.text ?? "").trim() !== "")
    .sort((a, b) => (degree.get(b.id) ?? 0) - (degree.get(a.id) ?? 0) || a.id.localeCompare(b.id));
  const text = labelled[0]?.label?.text.split("\n")[0].trim();
  if (text) return text.length > 24 ? `${text.slice(0, 24).trimEnd()}…` : text;

  return `Group ${ordinal}`;
}

/**
 * Groups worth proposing for this level, or null when there is nothing to propose — the level is
 * already readable, or everything on it belongs together, which is no decomposition at all.
 *
 * One level deep. A group that is still crowded is the caller's business: run this again on the
 * child once it exists, which is also how a third level appears.
 */
export function proposeDecomposition(diagram: Diagram, options?: Partial<DecomposeOptions>): Decomposition | null {
  const o: DecomposeOptions = { ...DEFAULT_DECOMPOSE, ...options, weights: { ...DEFAULT_DECOMPOSE.weights, ...options?.weights } };
  if (diagram.nodes.length < o.minLevelSize) return null;

  const units = unitsOf(diagram);
  if (units.length < 2) return null;
  const m = affinityMatrix(diagram, units, o);

  let groups = units.map((_, i) => [i]);
  for (;;) {
    if (groups.length <= o.targetMin) break;
    const pair = bestPair(groups, m);
    if (!pair) break;
    const forced = groups.length > o.targetMax;
    if (!forced && pair.score < o.mergeThreshold) break;
    const merged = [...groups[pair.i], ...groups[pair.j]].sort((a, b) => a - b);
    groups = groups.filter((_, k) => k !== pair.i && k !== pair.j);
    groups.push(merged);
  }

  // A group too small to be worth a block joins the group it is closest to, if there is one it has
  // anything in common with at all; otherwise its shapes simply stay on this level. Repeated,
  // because absorbing one small group can carry another over the line.
  const sizeOf = (g: number[]) => g.reduce((sum, u) => sum + units[u].ids.length, 0);
  for (;;) {
    const smallIndex = groups.findIndex((g) => sizeOf(g) < o.minCluster);
    if (smallIndex === -1) break;
    const small = groups[smallIndex];
    let bestIndex = -1;
    let bestScore = 0;
    groups.forEach((g, k) => {
      if (k === smallIndex) return;
      const score = linkage(small, g, m);
      if (score > bestScore + 1e-9) {
        bestScore = score;
        bestIndex = k;
      }
    });
    if (bestIndex === -1) break;
    groups[bestIndex] = [...groups[bestIndex], ...small].sort((a, b) => a - b);
    groups = groups.filter((_, k) => k !== smallIndex);
  }

  const order = new Map<string, number>();
  diagram.nodes.forEach((n, i) => order.set(n.id, i));
  const keep = groups.filter((g) => sizeOf(g) >= o.minCluster);
  const dropped = groups.filter((g) => sizeOf(g) < o.minCluster);

  // One group holding the whole level is not a decomposition, it is a wrapper.
  if (keep.length < 2) return null;

  const clusters: Cluster[] = keep
    .map((g) => ({
      units: g,
      nodeIds: g.flatMap((u) => units[u].ids).sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0)),
    }))
    .sort((a, b) => (order.get(a.nodeIds[0]) ?? 0) - (order.get(b.nodeIds[0]) ?? 0))
    .map((g, i) => ({ nodeIds: g.nodeIds, name: nameFor(units, g.units, diagram, i + 1) }));

  const loose = dropped
    .flatMap((g) => g.flatMap((u) => units[u].ids))
    .sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0));

  return { clusters, loose };
}
