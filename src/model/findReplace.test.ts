import { describe, expect, it } from "vitest";
import { findMatches, replaceOne } from "./findReplace";
import type { DEdge, Diagram, ShapeNode } from "./types";

function shape(id: string, text?: string): ShapeNode {
  return {
    id,
    type: "shape",
    shapeRef: "general/rect",
    position: { x: 0, y: 0 },
    size: { w: 100, h: 60 },
    z: 0,
    style: {},
    label: text !== undefined ? { text } : undefined,
  };
}

function edge(id: string, text?: string): DEdge {
  return {
    id,
    source: { nodeId: "a" },
    target: { nodeId: "b" },
    style: {},
    label: text !== undefined ? { text } : undefined,
  };
}

function diagram(overrides: Partial<Diagram> = {}): Diagram {
  return { id: "d1", title: "Diagram", nodes: [], edges: [], ...overrides };
}

describe("findMatches", () => {
  it("returns an empty array for an empty query", () => {
    const d = diagram({ nodes: [shape("a", "Payment")] });
    expect(findMatches(d, "", false)).toEqual([]);
  });

  it("finds case-insensitive matches by default across node and edge labels", () => {
    const d = diagram({ nodes: [shape("a", "Payment Service")], edges: [edge("e1", "sends payment")] });
    const matches = findMatches(d, "PAYMENT", false);
    expect(matches).toEqual([
      { kind: "node", id: "a", text: "Payment Service" },
      { kind: "edge", id: "e1", text: "sends payment" },
    ]);
  });

  it("respects matchCase when enabled", () => {
    const d = diagram({ nodes: [shape("a", "Payment Service")] });
    expect(findMatches(d, "payment", true)).toEqual([]);
    expect(findMatches(d, "Payment", true)).toHaveLength(1);
  });

  it("skips nodes/edges with no label", () => {
    const d = diagram({ nodes: [shape("a"), shape("b", "Orders")] });
    expect(findMatches(d, "o", false)).toEqual([{ kind: "node", id: "b", text: "Orders" }]);
  });
});

describe("replaceOne", () => {
  it("replaces all occurrences of the query within the matched label's text", () => {
    const d = diagram({ nodes: [shape("a", "foo bar foo")] });
    const result = replaceOne(d, { kind: "node", id: "a", text: "foo bar foo" }, "foo", "baz", false);
    expect(result).toBe("baz bar baz");
  });

  it("is case-insensitive by default, case-sensitive when matchCase is set", () => {
    const d = diagram({ nodes: [shape("a", "Foo foo")] });
    expect(replaceOne(d, { kind: "node", id: "a", text: "Foo foo" }, "foo", "X", false)).toBe("X X");
    expect(replaceOne(d, { kind: "node", id: "a", text: "Foo foo" }, "foo", "X", true)).toBe("Foo X");
  });

  it("returns undefined when the target no longer matches (already changed)", () => {
    const d = diagram({ nodes: [shape("a", "no match here")] });
    expect(replaceOne(d, { kind: "node", id: "a", text: "no match here" }, "xyz", "X", false)).toBeUndefined();
  });

  it("returns undefined for an unknown id", () => {
    const d = diagram({ nodes: [shape("a", "foo")] });
    expect(replaceOne(d, { kind: "node", id: "ghost", text: "foo" }, "foo", "X", false)).toBeUndefined();
  });

  it("escapes regex special characters in the query", () => {
    const d = diagram({ nodes: [shape("a", "cost: $5.00 (approx)")] });
    const result = replaceOne(d, { kind: "node", id: "a", text: "cost: $5.00 (approx)" }, "$5.00", "$10.00", false);
    expect(result).toBe("cost: $10.00 (approx)");
  });

  it("works on edges too", () => {
    const d = diagram({ edges: [edge("e1", "flows to")] });
    const result = replaceOne(d, { kind: "edge", id: "e1", text: "flows to" }, "flows", "goes", false);
    expect(result).toBe("goes to");
  });
});
