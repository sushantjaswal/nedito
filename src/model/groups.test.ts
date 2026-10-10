import { describe, expect, it } from "vitest";
import { addNode, removeSelection } from "./actions";
import { cascadeGroupCleanup, findContainingGroup, groupNodes, ungroupNodes } from "./groups";
import type { DiagramDocument, GroupNode, ShapeNode } from "./types";

function emptyDoc(diagramId = "d1"): DiagramDocument {
  return {
    formatVersion: 1,
    meta: { title: "Untitled", created: "2026-08-06", modified: "2026-08-06", appVersion: "0.0.1" },
    rootDiagramIds: [diagramId],
    diagrams: { [diagramId]: { id: diagramId, title: "Page 1", nodes: [], edges: [] } },
  };
}

function shape(id: string, overrides: Partial<ShapeNode> = {}): Omit<ShapeNode, "z"> {
  return {
    id,
    type: "shape",
    shapeRef: "general/rect",
    position: { x: 0, y: 0 },
    size: { w: 100, h: 60 },
    style: {},
    ...overrides,
  };
}

function buildThree(): DiagramDocument {
  let doc = emptyDoc();
  doc = addNode(doc, "d1", shape("a", { position: { x: 0, y: 0 }, size: { w: 100, h: 60 } }));
  doc = addNode(doc, "d1", shape("b", { position: { x: 200, y: 100 }, size: { w: 80, h: 40 } }));
  doc = addNode(doc, "d1", shape("c", { position: { x: 400, y: 0 }, size: { w: 50, h: 50 } }));
  return doc;
}

describe("groupNodes", () => {
  it("creates a GroupNode whose bounds contain all selected nodes plus padding", () => {
    const doc = buildThree();
    const result = groupNodes(doc, "d1", ["a", "b"]);
    expect(result).not.toBeNull();
    const group = result!.doc.diagrams.d1.nodes.find((n) => n.id === result!.groupId) as GroupNode;
    expect(group.type).toBe("group");
    expect(group.childIds.sort()).toEqual(["a", "b"]);
    // bounds: a=[0,0]-[100,60], b=[200,100]-[280,140], padding 20
    expect(group.position).toEqual({ x: -20, y: -20 });
    expect(group.size).toEqual({ w: 320, h: 180 });
  });

  it("renders behind its children (z below the lowest child z)", () => {
    const doc = buildThree();
    const result = groupNodes(doc, "d1", ["a", "b"])!;
    const nodes = result.doc.diagrams.d1.nodes;
    const group = nodes.find((n) => n.id === result.groupId)!;
    const childZs = nodes.filter((n) => ["a", "b"].includes(n.id)).map((n) => n.z);
    expect(group.z).toBeLessThan(Math.min(...childZs));
  });

  it("returns null when fewer than 2 nodes are selected", () => {
    const doc = buildThree();
    expect(groupNodes(doc, "d1", ["a"])).toBeNull();
    expect(groupNodes(doc, "d1", [])).toBeNull();
  });

  it("moves a node out of its old group when grouped into a new one", () => {
    let doc = buildThree();
    const first = groupNodes(doc, "d1", ["a", "b"])!;
    doc = first.doc;
    const second = groupNodes(doc, "d1", ["a", "c"])!;
    doc = second.doc;

    const oldGroup = doc.diagrams.d1.nodes.find((n) => n.id === first.groupId);
    expect(oldGroup).toBeUndefined(); // dropped: only "b" was left, below the 2-child minimum

    const newGroup = doc.diagrams.d1.nodes.find((n) => n.id === second.groupId) as GroupNode;
    expect(newGroup.childIds.sort()).toEqual(["a", "c"]);
  });
});

describe("ungroupNodes", () => {
  it("removes the group node, leaving children untouched", () => {
    const doc = buildThree();
    const { doc: grouped, groupId } = groupNodes(doc, "d1", ["a", "b"])!;
    const ungrouped = ungroupNodes(grouped, "d1", groupId);
    expect(ungrouped.diagrams.d1.nodes.find((n) => n.id === groupId)).toBeUndefined();
    expect(ungrouped.diagrams.d1.nodes.find((n) => n.id === "a")).toBeDefined();
    expect(ungrouped.diagrams.d1.nodes.find((n) => n.id === "b")).toBeDefined();
  });

  it("is a no-op for an unknown group id", () => {
    const doc = buildThree();
    expect(ungroupNodes(doc, "d1", "missing")).toBe(doc);
  });
});

describe("findContainingGroup", () => {
  it("finds the group containing a given node id", () => {
    const doc = buildThree();
    const { doc: grouped, groupId } = groupNodes(doc, "d1", ["a", "b"])!;
    const found = findContainingGroup(grouped.diagrams.d1, "a");
    expect(found?.id).toBe(groupId);
    expect(findContainingGroup(grouped.diagrams.d1, "c")).toBeUndefined();
  });
});

describe("cascadeGroupCleanup", () => {
  it("strips a removed node from its group's childIds", () => {
    let doc = buildThree();
    doc = addNode(doc, "d1", shape("e", { position: { x: 600, y: 0 } }));
    const { doc: grouped, groupId } = groupNodes(doc, "d1", ["a", "b", "e"])!;
    const cleaned = cascadeGroupCleanup(grouped.diagrams.d1, ["a"]);
    const group = cleaned.nodes.find((n) => n.id === groupId) as GroupNode;
    expect(group.childIds.sort()).toEqual(["b", "e"]);
  });

  it("drops a group that falls below 2 children", () => {
    const doc = buildThree();
    const { doc: grouped, groupId } = groupNodes(doc, "d1", ["a", "b"])!;
    const cleaned = cascadeGroupCleanup(grouped.diagrams.d1, ["a"]);
    expect(cleaned.nodes.find((n) => n.id === groupId)).toBeUndefined();
    expect(cleaned.nodes.find((n) => n.id === "b")).toBeDefined();
  });

  it("integrates with removeSelection so deleting a grouped node cleans up the group", () => {
    let doc = buildThree();
    const { doc: grouped, groupId } = groupNodes(doc, "d1", ["a", "b"])!;
    doc = grouped;
    doc = removeSelection(doc, "d1", ["a"], []);
    doc = { ...doc, diagrams: { ...doc.diagrams, d1: cascadeGroupCleanup(doc.diagrams.d1, ["a"]) } };
    expect(doc.diagrams.d1.nodes.find((n) => n.id === groupId)).toBeUndefined();
    expect(doc.diagrams.d1.nodes.find((n) => n.id === "a")).toBeUndefined();
    expect(doc.diagrams.d1.nodes.find((n) => n.id === "b")).toBeDefined();
  });
});
