// The layout runs against the real engine here, not a stand-in. The thing worth testing is
// whether a tidied level is actually tidy — flow in one direction, nothing on top of anything
// else, group members inside their box, a Nested Block's ports fed from the side they sit on —
// and a stand-in that returns coordinates of its own would only test the plumbing.
import { afterAll, describe, expect, it } from "vitest";
import { loadLayoutEngine } from "./elkEngine";
import {
  applyLayoutGraph,
  autoLayout,
  autoLayoutAllLevels,
  buildLayoutGraph,
  layoutTargets,
  levelsBelow,
  type LayoutEngine,
} from "./layout";
import type { DEdge, DiagramDocument, DNode, GroupNode, NestedNode, ShapeNode } from "./types";

let engine: LayoutEngine;
const withEngine = async () => (engine ??= await loadLayoutEngine());
afterAll(async () => {
  await withEngine();
});

function doc(nodes: DNode[], edges: DEdge[] = [], diagrams: Record<string, { nodes: DNode[]; edges: DEdge[] }> = {}): DiagramDocument {
  const extra = Object.fromEntries(
    Object.entries(diagrams).map(([id, d]) => [id, { id, title: id, nodes: d.nodes, edges: d.edges }]),
  );
  return {
    formatVersion: 6,
    meta: { title: "Untitled", created: "2026-10-14", modified: "2026-10-14", appVersion: "0.1.0" },
    rootDiagramIds: ["d1"],
    diagrams: { d1: { id: "d1", title: "Page 1", nodes, edges }, ...extra },
  };
}

function shape(id: string, x = 0, y = 0, w = 120, h = 60): ShapeNode {
  return { id, type: "shape", shapeRef: "general/rect", position: { x, y }, size: { w, h }, z: 1, style: {} };
}

function group(id: string, childIds: string[], x = 0, y = 0): GroupNode {
  return { id, type: "group", position: { x, y }, size: { w: 10, h: 10 }, z: 0, style: {}, childIds };
}

function nested(id: string, childDiagramId: string, ports: NestedNode["ports"] = [], x = 0, y = 0): NestedNode {
  return {
    id,
    type: "nested",
    childDiagramId,
    collapsed: { icons: [] },
    ports,
    position: { x, y },
    size: { w: 160, h: 100 },
    z: 1,
    style: {},
  };
}

function edge(id: string, source: DEdge["source"], target: DEdge["target"], waypoints?: DEdge["waypoints"]): DEdge {
  return { id, source, target, style: {}, ...(waypoints ? { waypoints } : {}) };
}

const at = (d: DiagramDocument, id: string, diagramId = "d1") => {
  const node = d.diagrams[diagramId].nodes.find((n) => n.id === id);
  if (!node) throw new Error(`no node ${id}`);
  return node;
};

const box = (node: DNode) => ({
  left: node.position.x,
  right: node.position.x + node.size.w,
  top: node.position.y,
  bottom: node.position.y + node.size.h,
});

function overlaps(a: DNode, b: DNode): boolean {
  const x = box(a);
  const y = box(b);
  return x.left < y.right && y.left < x.right && x.top < y.bottom && y.top < x.bottom;
}

describe("what a layout covers", () => {
  it("covers the whole level when no selection is given and everything is connected", () => {
    const d = doc([shape("a"), shape("b")], [edge("e1", { nodeId: "a" }, { nodeId: "b" })]);
    expect(layoutTargets(d.diagrams.d1)).toEqual(new Set(["a", "b"]));
  });

  it("leaves a shape with no connections where it is: a title or a legend is not part of the flow", () => {
    const d = doc([shape("a"), shape("b"), shape("title")], [edge("e1", { nodeId: "a" }, { nodeId: "b" })]);
    expect(layoutTargets(d.diagrams.d1)).toEqual(new Set(["a", "b"]));
  });

  it("lays out a level where nothing is connected at all, since there is no flow to tell apart", () => {
    const d = doc([shape("a"), shape("b")]);
    expect(layoutTargets(d.diagrams.d1)).toEqual(new Set(["a", "b"]));
  });

  it("takes a selection as given, connected or not", () => {
    const d = doc([shape("a"), shape("b"), shape("c")]);
    expect(layoutTargets(d.diagrams.d1, ["a", "b"])).toEqual(new Set(["a", "b"]));
  });

  it("brings in a group whose members are connected, and leaves an unconnected group alone", () => {
    const d = doc(
      [shape("a"), shape("b"), shape("x"), shape("y"), group("g", ["a", "b"]), group("spare", ["x", "y"])],
      [edge("e1", { nodeId: "a" }, { nodeId: "b" })],
    );
    expect(layoutTargets(d.diagrams.d1)).toEqual(new Set(["a", "b", "g"]));
  });

  it("widens a selection to the whole group a selected member belongs to", () => {
    const d = doc([shape("a"), shape("b"), shape("c"), group("g", ["a", "b"])], []);
    expect(layoutTargets(d.diagrams.d1, ["a"])).toEqual(new Set(["a", "b", "g"]));
    expect(layoutTargets(d.diagrams.d1, ["c"])).toEqual(new Set(["c"]));
  });
});

describe("the graph handed to the engine", () => {
  it("makes a group a container holding its members, not a box beside them", () => {
    const d = doc([shape("a"), shape("b"), group("g", ["a", "b"])]);
    const graph = buildLayoutGraph(d.diagrams.d1, { direction: "right", nodeIds: ["a", "b"] });
    expect(graph.children?.map((c) => c.id)).toEqual(["g"]);
    expect(graph.children?.[0].children?.map((c) => c.id)).toEqual(["a", "b"]);
  });

  it("gives a Nested Block a port fixed where the author put it, on the matching side", () => {
    const d = doc([nested("n", "d2", [{ id: "p", side: "left", offset: 0.5 }])]);
    const leaf = buildLayoutGraph(d.diagrams.d1, { direction: "right" }).children?.[0];
    expect(leaf?.layoutOptions?.["elk.portConstraints"]).toBe("FIXED_POS");
    expect(leaf?.ports).toEqual([
      expect.objectContaining({ id: "n::p", x: 0, y: 50, layoutOptions: { "elk.port.side": "WEST" } }),
    ]);
  });

  it("leaves out a line with a loose end, one reaching outside the layout, and one that loops back", () => {
    const d = doc(
      [shape("a"), shape("b"), shape("outside")],
      [
        edge("keep", { nodeId: "a" }, { nodeId: "b" }),
        edge("loose", { nodeId: "a" }, { point: { x: 10, y: 10 } }),
        edge("outside", { nodeId: "a" }, { nodeId: "outside" }),
        edge("self", { nodeId: "a" }, { nodeId: "a" }),
      ],
    );
    const graph = buildLayoutGraph(d.diagrams.d1, { direction: "right", nodeIds: ["a", "b"] });
    expect(graph.edges?.map((e) => e.id)).toEqual(["keep"]);
  });

  it("names the port an edge attaches to, and falls back to the node for a port that is gone", () => {
    const d = doc(
      [shape("a"), nested("n", "d2", [{ id: "p", side: "left", offset: 0.5 }])],
      [edge("e1", { nodeId: "a" }, { nodeId: "n", portId: "p" }), edge("e2", { nodeId: "a" }, { nodeId: "n", portId: "stale" })],
    );
    const edges = buildLayoutGraph(d.diagrams.d1, { direction: "right" }).edges ?? [];
    expect(edges.find((e) => e.id === "e1")?.targets).toEqual(["n::p"]);
    expect(edges.find((e) => e.id === "e2")?.targets).toEqual(["n"]);
  });
});

describe("a tidied level", () => {
  it("runs a chain left to right, with nothing overlapping", async () => {
    const d = doc(
      [shape("a", 500, 500), shape("b", 20, 300), shape("c", 60, 10)],
      [edge("e1", { nodeId: "a" }, { nodeId: "b" }), edge("e2", { nodeId: "b" }, { nodeId: "c" })],
    );
    const out = await autoLayout(d, "d1", { direction: "right" }, await withEngine());
    const [a, b, c] = ["a", "b", "c"].map((id) => at(out, id));
    expect(box(a).right).toBeLessThanOrEqual(box(b).left);
    expect(box(b).right).toBeLessThanOrEqual(box(c).left);
    expect(overlaps(a, b)).toBe(false);
    expect(overlaps(b, c)).toBe(false);
  });

  it("runs the same chain top to bottom when asked to", async () => {
    const d = doc(
      [shape("a"), shape("b"), shape("c")],
      [edge("e1", { nodeId: "a" }, { nodeId: "b" }), edge("e2", { nodeId: "b" }, { nodeId: "c" })],
    );
    const out = await autoLayout(d, "d1", { direction: "down" }, await withEngine());
    const [a, b, c] = ["a", "b", "c"].map((id) => at(out, id));
    expect(box(a).bottom).toBeLessThanOrEqual(box(b).top);
    expect(box(b).bottom).toBeLessThanOrEqual(box(c).top);
  });

  it("stays where it was on the canvas: its top-left corner does not move", async () => {
    const d = doc(
      [shape("a", 900, 700), shape("b", 1200, 700)],
      [edge("e1", { nodeId: "a" }, { nodeId: "b" })],
    );
    const out = await autoLayout(d, "d1", { direction: "right" }, await withEngine());
    const nodes = out.diagrams.d1.nodes;
    expect(Math.min(...nodes.map((n) => n.position.x))).toBe(900);
    expect(Math.min(...nodes.map((n) => n.position.y))).toBe(700);
  });

  it("keeps a group's members inside the box, and resizes the box to fit them", async () => {
    const d = doc(
      [shape("a", 0, 0), shape("b", 400, 400), shape("outside", 1000, 0), group("g", ["a", "b"])],
      [edge("e1", { nodeId: "a" }, { nodeId: "b" })],
    );
    const out = await autoLayout(d, "d1", { direction: "right" }, await withEngine());
    const g = at(out, "g");
    for (const id of ["a", "b"]) {
      const member = box(at(out, id));
      expect(member.left).toBeGreaterThanOrEqual(box(g).left);
      expect(member.right).toBeLessThanOrEqual(box(g).right);
      expect(member.top).toBeGreaterThanOrEqual(box(g).top);
      expect(member.bottom).toBeLessThanOrEqual(box(g).bottom);
    }
    expect(g.size.w).toBeGreaterThan(10);
    expect(overlaps(g, at(out, "outside"))).toBe(false);
  });

  it("puts the shape that feeds a left-side port on the left of the block", async () => {
    const d = doc(
      [shape("feeder", 900, 0), nested("n", "d2", [{ id: "p", side: "left", offset: 0.5 }], 0, 0)],
      [edge("e1", { nodeId: "feeder" }, { nodeId: "n", portId: "p" })],
    );
    const out = await autoLayout(d, "d1", { direction: "right" }, await withEngine());
    expect(box(at(out, "feeder")).right).toBeLessThanOrEqual(box(at(out, "n")).left);
  });

  it("moves only the selection, leaving the rest of the level alone", async () => {
    const d = doc(
      [shape("a", 0, 0), shape("b", 40, 40), shape("untouched", 800, 800)],
      [edge("e1", { nodeId: "a" }, { nodeId: "b" })],
    );
    const out = await autoLayout(d, "d1", { direction: "right", nodeIds: ["a", "b"] }, await withEngine());
    expect(at(out, "untouched").position).toEqual({ x: 800, y: 800 });
    expect(overlaps(at(out, "a"), at(out, "b"))).toBe(false);
  });

  it("rounds to the grid when snapping is on", async () => {
    const d = doc(
      [shape("a", 7, 13), shape("b", 211, 97)],
      [edge("e1", { nodeId: "a" }, { nodeId: "b" })],
    );
    const out = await autoLayout(d, "d1", { direction: "right", snap: 10 }, await withEngine());
    for (const node of out.diagrams.d1.nodes) {
      expect(node.position.x % 10).toBe(0);
      expect(node.position.y % 10).toBe(0);
    }
  });

  it("drops the waypoints of a line that moved, and keeps those of one that did not", async () => {
    const d = doc(
      [shape("a", 0, 0), shape("b", 300, 0), shape("x", 900, 900), shape("y", 1200, 900)],
      [
        edge("moved", { nodeId: "a" }, { nodeId: "b" }, [{ x: 10, y: 10 }]),
        edge("still", { nodeId: "x" }, { nodeId: "y" }, [{ x: 20, y: 20 }]),
      ],
    );
    const out = await autoLayout(
      d,
      "d1",
      { direction: "right", nodeIds: ["a", "b"], relayoutLines: true },
      await withEngine(),
    );
    const edges = out.diagrams.d1.edges;
    expect(edges.find((e) => e.id === "moved")?.waypoints).toBeUndefined();
    expect(edges.find((e) => e.id === "still")?.waypoints).toEqual([{ x: 20, y: 20 }]);
  });

  it("keeps every waypoint when the lines were not asked to be rerouted", async () => {
    const d = doc(
      [shape("a", 0, 0), shape("b", 300, 0)],
      [edge("e1", { nodeId: "a" }, { nodeId: "b" }, [{ x: 10, y: 10 }])],
    );
    const out = await autoLayout(d, "d1", { direction: "right" }, await withEngine());
    expect(out.diagrams.d1.edges[0].waypoints).toEqual([{ x: 10, y: 10 }]);
  });

  it("leaves an empty level, and a level that is not there, exactly as they were", async () => {
    const empty = doc([]);
    expect(await autoLayout(empty, "d1", { direction: "right" }, await withEngine())).toBe(empty);
    expect(await autoLayout(empty, "nope", { direction: "right" }, await withEngine())).toBe(empty);
  });

  it("changes nothing when the engine places nothing it knows about", () => {
    const d = doc([shape("a", 5, 5)]);
    expect(applyLayoutGraph(d, "d1", { id: "root", children: [] }, { direction: "right" })).toBe(d);
  });
});

describe("down every level", () => {
  it("lists the levels below, parents first, and visits a shared child once", () => {
    const d = doc([nested("n1", "d2"), nested("n2", "d3")], [], {
      d2: { nodes: [nested("n3", "d4")], edges: [] },
      d3: { nodes: [nested("n4", "d4")], edges: [] },
      d4: { nodes: [shape("deep")], edges: [] },
    });
    expect(levelsBelow(d, "d1")).toEqual(["d1", "d2", "d4", "d3"]);
  });

  it("does not spin on a document whose levels point at each other", () => {
    const d = doc([nested("n", "d2")], [], { d2: { nodes: [nested("back", "d1")], edges: [] } });
    expect(levelsBelow(d, "d1")).toEqual(["d1", "d2"]);
  });

  it("tidies the level below as well as this one", async () => {
    const d = doc([nested("n", "d2"), shape("a", 400, 0)], [edge("e1", { nodeId: "a" }, { nodeId: "n" })], {
      d2: {
        nodes: [shape("inner1", 0, 0), shape("inner2", 10, 10)],
        edges: [edge("ie", { nodeId: "inner1" }, { nodeId: "inner2" })],
      },
    });
    const out = await autoLayoutAllLevels(d, "d1", { direction: "right" }, await withEngine());
    expect(overlaps(at(out, "inner1", "d2"), at(out, "inner2", "d2"))).toBe(false);
    expect(box(at(out, "a")).right).toBeLessThanOrEqual(box(at(out, "n")).left);
  });
});
