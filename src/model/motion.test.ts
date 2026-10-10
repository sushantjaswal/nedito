// Diagram motion's model (A1, D116): optional, typed, validated, and only a document that uses it
// is written as format v6 — every other document is byte-for-byte what it was.
import { describe, expect, it } from "vitest";
import { decodeDoc, encodeDoc, writtenVersion } from "../file/documentFormat";
import { continuousMotionCount, hasMotion, motionProblems, setDiagramDrawIn, setEdgesMotion, setNestedPeek, setNodesMotion } from "./motion";
import type { DiagramDocument, NestedNode, ShapeNode } from "./types";
import { validateDoc } from "./validate";

function doc(): DiagramDocument {
  const a: ShapeNode = { id: "a", type: "shape", shapeRef: "general/rect", position: { x: 0, y: 0 }, size: { w: 100, h: 60 }, z: 1, style: {} };
  const b: ShapeNode = { ...a, id: "b", position: { x: 200, y: 0 }, z: 2 };
  return {
    formatVersion: 5,
    meta: { title: "t", created: "", modified: "", appVersion: "0" },
    rootDiagramIds: ["root"],
    diagrams: {
      root: {
        id: "root",
        title: "Page 1",
        nodes: [a, b],
        edges: [{ id: "e", source: { nodeId: "a" }, target: { nodeId: "b" }, style: {} }],
      },
    },
  };
}

const withEdgeMotion = (d: DiagramDocument, motion: unknown): DiagramDocument => ({
  ...d,
  diagrams: { root: { ...d.diagrams.root, edges: d.diagrams.root.edges.map((e) => ({ ...e, motion: motion as never })) } },
});
const withNodeMotion = (d: DiagramDocument, motion: unknown): DiagramDocument => ({
  ...d,
  diagrams: { root: { ...d.diagrams.root, nodes: d.diagrams.root.nodes.map((n, i) => (i === 0 ? { ...n, motion: motion as never } : n)) } },
});

describe("which documents are format v6", () => {
  it("one with no motion is written exactly as before: not v6, byte for byte", () => {
    const plain = doc();
    expect(hasMotion(plain)).toBe(false);
    const before = encodeDoc(plain);
    expect(JSON.parse(before).formatVersion).toBeLessThan(6);
    expect(writtenVersion(plain)).toBeLessThan(6);
    expect(before).not.toContain("motion");
  });

  it("any motion — on a line, a shape, a Nested Block's peek, or the diagram — makes it v6", () => {
    expect(writtenVersion(withEdgeMotion(doc(), { kind: "flow" }))).toBe(6);
    expect(writtenVersion(withNodeMotion(doc(), { pulse: {} }))).toBe(6);
    const d = doc();
    expect(writtenVersion({ ...d, diagrams: { root: { ...d.diagrams.root, motion: { drawIn: true } } } })).toBe(6);
    const nested: NestedNode = { id: "n", type: "nested", position: { x: 0, y: 200 }, size: { w: 160, h: 100 }, z: 3, style: {}, childDiagramId: "child", collapsed: { icons: [] }, ports: [], peek: true };
    const withPeek: DiagramDocument = { ...d, diagrams: { root: { ...d.diagrams.root, nodes: [...d.diagrams.root.nodes, nested] }, child: { id: "child", title: "Inner", nodes: [], edges: [] } } };
    expect(writtenVersion(withPeek)).toBe(6);
  });

  it("round-trips exactly, and a v5 file still opens", () => {
    const animated = withNodeMotion(withEdgeMotion(doc(), { kind: "flow", speed: "fast" }), { pulse: { ripple: true }, health: "degraded" });
    const once = encodeDoc(animated);
    const back = decodeDoc(once);
    expect(back.ok).toBe(true);
    if (!back.ok) return;
    expect(encodeDoc(back.doc)).toBe(once);
    expect(back.doc.diagrams.root.edges[0].motion).toEqual({ kind: "flow", speed: "fast" });
    expect(back.doc.diagrams.root.nodes[0].motion).toEqual({ pulse: { ripple: true }, health: "degraded" });

    const v5 = decodeDoc(encodeDoc(doc()));
    expect(v5.ok).toBe(true);
  });
});

describe("validation", () => {
  it("accepts every well-formed kind the approved model allows", () => {
    for (const m of [{ kind: "flow" }, { kind: "packets", speed: "slow" }, { kind: "throughput", volume: 5, speed: "fast" }]) {
      expect(motionProblems(withEdgeMotion(doc(), m))).toEqual([]);
    }
    for (const m of [{ pulse: {} }, { pulse: { ripple: false } }, { health: "down" }, { pulse: { ripple: true }, health: "healthy" }]) {
      expect(motionProblems(withNodeMotion(doc(), m))).toEqual([]);
    }
  });

  it("rejects what an author could not have made, with a readable reason", () => {
    const bad: [DiagramDocument, RegExp][] = [
      [withEdgeMotion(doc(), { kind: "spin" }), /unknown motion "spin"/],
      [withEdgeMotion(doc(), { kind: "flow", speed: "warp" }), /unknown speed/],
      [withEdgeMotion(doc(), { kind: "throughput", volume: 9 }), /volume/],
      [withNodeMotion(doc(), { health: "fine" }), /unknown health/],
      [withNodeMotion(doc(), { pulse: { ripple: "yes" } }), /ripple/],
    ];
    for (const [d, why] of bad) {
      const problems = validateDoc(d).filter((e) => e.code === "BAD_MOTION");
      expect(problems.map((p) => p.message).join(" ")).toMatch(why);
    }
  });

  it("a presentation names only things on its own level, and one mode at most by construction", () => {
    const d = doc();
    const ok = { ...d, diagrams: { root: { ...d.diagrams.root, motion: { presentation: { mode: "walkthrough" as const, order: ["a", "e", "b"] } } } } };
    expect(motionProblems(ok)).toEqual([]);
    const stray = { ...d, diagrams: { root: { ...d.diagrams.root, motion: { presentation: { mode: "build" as const, order: ["a", "ghost"] } } } } };
    expect(motionProblems(stray)[0].message).toMatch(/ghost/);
  });

  it("peek belongs to a Nested Block only", () => {
    const d = doc();
    const onShape = { ...d, diagrams: { root: { ...d.diagrams.root, nodes: d.diagrams.root.nodes.map((n) => ({ ...n, peek: true })) as never } } };
    expect(motionProblems(onShape)[0].message).toMatch(/peek/);
  });
});

describe("continuousMotionCount", () => {
  it("counts lines and shapes that move continuously on one level, not one-shots", () => {
    const d = withNodeMotion(withEdgeMotion(doc(), { kind: "flow" }), { pulse: {} });
    expect(continuousMotionCount(d.diagrams.root)).toBe(2);
    expect(continuousMotionCount(doc().diagrams.root)).toBe(0);
    expect(continuousMotionCount({ ...doc().diagrams.root, motion: { drawIn: true } })).toBe(0);
  });
});

describe("editing motion", () => {
  it("a line gets motion and loses it again, ending byte-for-byte where it started", () => {
    const start = doc();
    const moving = setEdgesMotion(start, "root", ["e"], { kind: "flow", speed: "slow" });
    expect(moving.diagrams.root.edges[0].motion).toEqual({ kind: "flow", speed: "slow" });
    const still = setEdgesMotion(moving, "root", ["e"], null);
    expect("motion" in still.diagrams.root.edges[0]).toBe(false);
    const strip = (t: string) => t.replace(/"modified": "[^"]*"/, "");
    expect(strip(encodeDoc(still))).toBe(strip(encodeDoc(start)));
  });

  it("Pulse and Health merge on a shape, and clearing both removes motion entirely", () => {
    let d = setNodesMotion(doc(), "root", ["a"], { pulse: { ripple: true } });
    d = setNodesMotion(d, "root", ["a"], { health: "down" });
    expect(d.diagrams.root.nodes[0].motion).toEqual({ pulse: { ripple: true }, health: "down" });
    d = setNodesMotion(d, "root", ["a"], { pulse: null });
    expect(d.diagrams.root.nodes[0].motion).toEqual({ health: "down" });
    d = setNodesMotion(d, "root", ["a"], { health: null });
    expect("motion" in d.diagrams.root.nodes[0]).toBe(false);
    expect(hasMotion(d)).toBe(false);
    // Only the named shapes change.
    expect("motion" in d.diagrams.root.nodes[1]).toBe(false);
  });
});

describe("Flow direction (A1b, D118)", () => {
  it("accepts forward, reverse and both, and nothing else", () => {
    for (const direction of ["forward", "reverse", "both"]) {
      expect(motionProblems(withEdgeMotion(doc(), { kind: "flow", direction }))).toEqual([]);
    }
    expect(motionProblems(withEdgeMotion(doc(), { kind: "flow", direction: "sideways" }))[0].message).toMatch(/direction/);
  });

  it("putting a setting back to its default leaves it out of the line, not stored as undefined", () => {
    const d = setEdgesMotion(doc(), "root", ["e"], { kind: "flow", direction: "reverse", speed: "fast" });
    const back = setEdgesMotion(d, "root", ["e"], { kind: "flow", direction: undefined, speed: "fast" });
    expect(back.diagrams.root.edges[0].motion).toEqual({ kind: "flow", speed: "fast" });
    expect(Object.keys(back.diagrams.root.edges[0].motion!)).toEqual(["kind", "speed"]);
  });
});

describe("the one-shots (A5, D121)", () => {
  it("Draw in is set on a diagram and cleared off it entirely", () => {
    const on = setDiagramDrawIn(doc(), "root", true);
    expect(on.diagrams.root.motion).toEqual({ drawIn: true });
    expect(writtenVersion(on)).toBe(6);
    const off = setDiagramDrawIn(on, "root", false);
    expect("motion" in off.diagrams.root).toBe(false);
    expect(hasMotion(off)).toBe(false);
  });

  it("Peek is set on a Nested Block only, and cleared off it entirely", () => {
    const d = doc();
    const block: NestedNode = { id: "n", type: "nested", position: { x: 0, y: 0 }, size: { w: 160, h: 100 }, z: 3, style: {}, childDiagramId: "child", collapsed: { icons: [] }, ports: [] };
    const withBlock: DiagramDocument = { ...d, diagrams: { root: { ...d.diagrams.root, nodes: [...d.diagrams.root.nodes, block] }, child: { id: "child", title: "c", nodes: [], edges: [] } } };
    const on = setNestedPeek(withBlock, "root", "n", true);
    expect((on.diagrams.root.nodes.find((n) => n.id === "n") as NestedNode).peek).toBe(true);
    // A plain shape is left alone.
    expect("peek" in setNestedPeek(withBlock, "root", "a", true).diagrams.root.nodes[0]).toBe(false);
    const off = setNestedPeek(on, "root", "n", false);
    expect("peek" in off.diagrams.root.nodes.find((n) => n.id === "n")!).toBe(false);
  });
});
