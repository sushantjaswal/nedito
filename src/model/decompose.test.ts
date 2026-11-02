// What a proposal must guarantee, whatever it decides. Not whether the grouping looks right —
// that is judged by eye on the canvas — but that it is safe to act on: every shape accounted for
// exactly once, a group never torn in half, and the same answer every time.
import { describe, expect, it } from "vitest";
import { DEFAULT_DECOMPOSE, proposeDecomposition } from "./decompose";
import { loadAllTemplates } from "../templates/registry";
import type { DEdge, Diagram, DNode } from "./types";

function shape(id: string, x: number, y: number, label = id): DNode {
  return {
    id,
    type: "shape",
    shapeRef: "general/rect",
    position: { x, y },
    size: { w: 120, h: 60 },
    z: 1,
    style: {},
    label: { text: label },
  };
}

function edge(id: string, from: string, to: string): DEdge {
  return { id, source: { nodeId: from }, target: { nodeId: to }, style: {} };
}

function diagram(nodes: DNode[], edges: DEdge[] = []): Diagram {
  return { id: "d", title: "Level", nodes, edges };
}

/** Three clumps of five, far apart, each joined inside itself and barely outside it. */
function threeClumps(): Diagram {
  const nodes: DNode[] = [];
  const edges: DEdge[] = [];
  const origins = [
    { x: 0, y: 0, tag: "auth" },
    { x: 4000, y: 0, tag: "billing" },
    { x: 2000, y: 4000, tag: "search" },
  ];
  origins.forEach((o, c) => {
    for (let i = 0; i < 5; i += 1) nodes.push(shape(`${o.tag}${i}`, o.x + i * 160, o.y + (i % 2) * 120, `${o.tag} ${i}`));
    for (let i = 1; i < 5; i += 1) edges.push(edge(`e${c}-${i}`, `${o.tag}0`, `${o.tag}${i}`));
  });
  // One thread between clumps, so the graph is connected but the clumps are obvious.
  edges.push(edge("x1", "auth0", "billing0"));
  edges.push(edge("x2", "billing0", "search0"));
  return diagram(nodes, edges);
}

describe("proposing a decomposition", () => {
  it("says nothing about a level that is already readable", () => {
    const small = diagram(Array.from({ length: 8 }, (_, i) => shape(`n${i}`, i * 200, 0)));
    expect(proposeDecomposition(small)).toBeNull();
  });

  it("offers nothing when the whole level belongs together", () => {
    // A star: twelve shapes all hanging off one hub, drawn on top of each other. There is no
    // seam to cut along, and a single block holding everything is a wrapper, not a decomposition.
    const nodes = [shape("hub", 0, 0), ...Array.from({ length: 12 }, (_, i) => shape(`leaf${i}`, 0, 0))];
    const edges = Array.from({ length: 12 }, (_, i) => edge(`e${i}`, "hub", `leaf${i}`));
    expect(proposeDecomposition(diagram(nodes, edges))).toBeNull();
  });

  it("finds the clumps in a diagram that has them", () => {
    const result = proposeDecomposition(threeClumps());
    expect(result).not.toBeNull();
    if (!result) return;
    expect(result.clusters.length).toBeGreaterThanOrEqual(2);
    // Each clump lands whole in one group, which is the whole point.
    for (const tag of ["auth", "billing", "search"]) {
      const holding = result.clusters.filter((c) => c.nodeIds.some((id) => id.startsWith(tag)));
      expect(holding, `${tag} spread across groups`).toHaveLength(1);
      expect(holding[0].nodeIds.filter((id) => id.startsWith(tag))).toHaveLength(5);
    }
  });

  it("names a group after the word its shapes share", () => {
    const result = proposeDecomposition(threeClumps());
    const names = result?.clusters.map((c) => c.name) ?? [];
    expect(names).toContain("Auth");
    expect(names).toContain("Billing");
  });

  it("never splits a group, even against every other signal", () => {
    // Two shapes grouped together but drawn at opposite ends, each wired into a different clump:
    // position and connections both pull them apart, and the group still wins.
    const base = threeClumps();
    const nodes: DNode[] = [
      ...base.nodes,
      shape("far-a", 0, 0, "alpha"),
      shape("far-b", 4000, 4000, "omega"),
      { id: "g1", type: "group", childIds: ["far-a", "far-b"], position: { x: 0, y: 0 }, size: { w: 10, h: 10 }, z: 9, style: {} },
    ];
    const edges = [...base.edges, edge("ga", "far-a", "auth1"), edge("gb", "far-b", "billing1")];
    const result = proposeDecomposition(diagram(nodes, edges));
    expect(result).not.toBeNull();
    if (!result) return;
    const together = [...result.clusters.map((c) => c.nodeIds), result.loose];
    const home = together.find((ids) => ids.includes("far-a"));
    expect(home, "the grouped pair was torn apart").toContain("far-b");
    expect(home).toContain("g1");
  });

  it("gives the same answer every time", () => {
    const once = proposeDecomposition(threeClumps());
    const twice = proposeDecomposition(threeClumps());
    expect(JSON.stringify(twice)).toBe(JSON.stringify(once));
  });

  it("ignores a line with a free end rather than treating it as a connection", () => {
    const nodes = Array.from({ length: 14 }, (_, i) => shape(`n${i}`, (i % 7) * 200, Math.floor(i / 7) * 2000));
    const free: DEdge = { id: "free", source: { nodeId: "n0" }, target: { point: { x: 9, y: 9 } }, style: {} };
    expect(() => proposeDecomposition(diagram(nodes, [free]))).not.toThrow();
  });
});

describe("every template it is offered", () => {
  it("accounts for each shape exactly once, and keeps groups whole", async () => {
    const templates = await loadAllTemplates();
    let offered = 0;
    for (const t of templates) {
      for (const [id, d] of Object.entries(t.doc.diagrams)) {
        const result = proposeDecomposition(d);
        if (!result) continue;
        offered += 1;
        const where = `${t.id}/${id}`;

        const placed = [...result.clusters.flatMap((c) => c.nodeIds), ...result.loose];
        expect(new Set(placed).size, `${where}: a shape appears twice`).toBe(placed.length);
        expect([...placed].sort(), `${where}: a shape went missing`).toEqual(d.nodes.map((n) => n.id).sort());

        expect(result.clusters.length, `${where}: one group is no decomposition`).toBeGreaterThanOrEqual(2);
        for (const c of result.clusters) {
          expect(c.nodeIds.length, `${where}: a group below the floor`).toBeGreaterThanOrEqual(DEFAULT_DECOMPOSE.minCluster);
          expect(c.name.trim(), `${where}: a group with no name`).not.toBe("");
        }

        for (const node of d.nodes) {
          if (node.type !== "group") continue;
          const home = [...result.clusters.map((c) => c.nodeIds), result.loose].find((ids) => ids.includes(node.id));
          for (const childId of node.childIds) {
            expect(home, `${where}: group ${node.id} split from its child`).toContain(childId);
          }
        }
      }
    }
    // The corpus has to exercise it at all, or this proves nothing.
    expect(offered, "no template level was large enough to propose on").toBeGreaterThan(0);
  });
});
