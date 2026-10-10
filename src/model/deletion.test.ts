// The deletion prompts (N7, D138): what a delete would take with it, keeping a block's contents,
// and removing the links that run through a shape — each a valid document, one undo entry.
import { act } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { deletionStakes, liftNestedContents, removeLinksThrough } from "./deletion";
import { useDocStore } from "./store";
import type { DiagramDocument, NestedNode, ShapeNode } from "./types";
import { validateDoc } from "./validate";

const box = (id: string, x: number, y: number, text = id): ShapeNode => ({
  id,
  type: "shape",
  shapeRef: "general/rect",
  position: { x, y },
  size: { w: 100, h: 50 },
  z: 1,
  style: {},
  label: { text },
});

/**
 * Root: "gw" → [Payments block] via a port mapped to "cards" inside, and "db" ← block through an
 * unmapped port. Inside the block: "cards" → "fraud", and a deeper block "deep" with one shape.
 */
function doc(): DiagramDocument {
  const block: NestedNode = {
    id: "blk",
    type: "nested",
    position: { x: 400, y: 300 },
    size: { w: 180, h: 110 },
    z: 2,
    style: {},
    label: { text: "Payments" },
    childDiagramId: "inside",
    collapsed: { icons: [] },
    ports: [
      { id: "pIn", side: "left", offset: 0.5, innerNodeId: "cards" },
      { id: "pOut", side: "right", offset: 0.5 },
    ],
  };
  const deep: NestedNode = { ...block, id: "deep", label: { text: "Deep" }, position: { x: 300, y: 200 }, childDiagramId: "deeper", ports: [] };
  return {
    formatVersion: 5,
    meta: { title: "t", created: "", modified: "", appVersion: "0" },
    rootDiagramIds: ["root"],
    diagrams: {
      root: {
        id: "root",
        title: "Main",
        nodes: [box("gw", 0, 300, "Gateway"), block, box("db", 800, 300, "Orders DB")],
        edges: [
          { id: "in", source: { nodeId: "gw" }, target: { nodeId: "blk", portId: "pIn" }, style: {} },
          { id: "out", source: { nodeId: "blk", portId: "pOut" }, target: { nodeId: "db" }, style: {} },
        ],
      },
      inside: {
        id: "inside",
        title: "Payments",
        nodes: [box("cards", 100, 100, "Cards"), box("fraud", 250, 100, "Fraud"), deep],
        edges: [{ id: "cf", source: { nodeId: "cards" }, target: { nodeId: "fraud" }, style: {}, waypoints: [{ x: 200, y: 160 }] }],
      },
      deeper: { id: "deeper", title: "Deep", nodes: [box("x", 0, 0)], edges: [] },
    },
  };
}

describe("what a deletion would take with it", () => {
  it("a Nested Block with shapes inside, counted on every level", () => {
    expect(deletionStakes(doc(), "root", ["blk"]).blocks).toEqual([{ id: "blk", name: "Payments", shapes: 4 }]);
  });

  it("a shape a parent's link enters through", () => {
    expect(deletionStakes(doc(), "inside", ["cards"]).mapped).toEqual([{ id: "cards", name: "Cards", links: 1 }]);
  });

  it("nothing, for an empty block or a shape no link runs through", () => {
    const d = doc();
    d.diagrams.inside = { ...d.diagrams.inside, nodes: [], edges: [] };
    delete d.diagrams.deeper;
    expect(deletionStakes(d, "root", ["blk", "gw"])).toEqual({ blocks: [], mapped: [] });
    expect(deletionStakes(doc(), "inside", ["fraud"]).mapped).toEqual([]);
  });
});

describe("keeping a block's contents here", () => {
  const lifted = () => liftNestedContents(doc(), "root", ["blk"]);

  it("brings its shapes and lines up where the block was, and the block and its level go", () => {
    const d = lifted();
    expect(validateDoc(d)).toEqual([]);
    const root = d.diagrams.root;
    expect(root.nodes.map((n) => n.id).sort()).toEqual(["cards", "db", "deep", "fraud", "gw"]);
    expect(d.diagrams.inside).toBeUndefined();
    // Their top-left is the block's: cards (100,100) → (400,300); the rest keep their places.
    expect(root.nodes.find((n) => n.id === "cards")!.position).toEqual({ x: 400, y: 300 });
    expect(root.nodes.find((n) => n.id === "fraud")!.position).toEqual({ x: 550, y: 300 });
    expect(root.edges.find((e) => e.id === "cf")!.waypoints).toEqual([{ x: 500, y: 360 }]);
  });

  it("a link through a mapped port goes straight to the shape it led to; one through an unmapped port goes", () => {
    const root = lifted().diagrams.root;
    expect(root.edges.find((e) => e.id === "in")!.target).toEqual({ nodeId: "cards" });
    expect(root.edges.find((e) => e.id === "out")).toBeUndefined();
  });

  it("a block inside keeps its own level", () => {
    const d = lifted();
    expect((d.diagrams.root.nodes.find((n) => n.id === "deep") as NestedNode).childDiagramId).toBe("deeper");
    expect(d.diagrams.deeper).toBeDefined();
  });
});

describe("removing the links through a shape", () => {
  it("takes the port and the parent's lines on it, leaving everything else", () => {
    const d = removeLinksThrough(doc(), "inside", ["cards"]);
    const block = d.diagrams.root.nodes.find((n) => n.id === "blk") as NestedNode;
    expect(block.ports.map((p) => p.id)).toEqual(["pOut"]);
    expect(d.diagrams.root.edges.map((e) => e.id)).toEqual(["out"]);
  });
});

describe("the store asks, then does what was chosen", () => {
  beforeEach(() => {
    act(() => {
      useDocStore.getState().loadDoc(doc());
      useDocStore.setState((s) => ({ ui: { ...s.ui, deletePrompt: null } }));
    });
  });

  it("deleting a block with contents waits for a choice; Cancel keeps everything", () => {
    act(() => {
      useDocStore.getState().setSelection(["blk"], []);
      useDocStore.getState().removeSelection();
    });
    expect(useDocStore.getState().ui.deletePrompt?.blocks).toHaveLength(1);
    expect(useDocStore.getState().doc.diagrams.root.nodes.some((n) => n.id === "blk")).toBe(true);
    act(() => useDocStore.getState().resolveDeletePrompt("cancel"));
    expect(useDocStore.getState().ui.deletePrompt).toBeNull();
    expect(useDocStore.getState().doc.diagrams.inside).toBeDefined();
  });

  it("Delete everything removes the block and every level inside it", () => {
    act(() => {
      useDocStore.getState().setSelection(["blk"], []);
      useDocStore.getState().removeSelection();
      useDocStore.getState().resolveDeletePrompt("delete-all");
    });
    const d = useDocStore.getState().doc;
    expect(d.diagrams.inside).toBeUndefined();
    expect(d.diagrams.deeper).toBeUndefined();
    expect(validateDoc(d)).toEqual([]);
  });

  it("Keep the contents here lifts them, in one undo step", () => {
    act(() => {
      useDocStore.getState().setSelection(["blk"], []);
      useDocStore.getState().removeSelection();
      useDocStore.getState().resolveDeletePrompt("keep-contents");
    });
    expect(useDocStore.getState().doc.diagrams.root.nodes.some((n) => n.id === "cards")).toBe(true);
    act(() => useDocStore.temporal.getState().undo());
    expect(useDocStore.getState().doc.diagrams.root.nodes.some((n) => n.id === "blk")).toBe(true);
    expect(useDocStore.getState().doc.diagrams.inside).toBeDefined();
  });

  it("deleting a shape a link enters through: keep it waiting, or remove it", () => {
    act(() => {
      useDocStore.getState().navigateInto("blk");
      useDocStore.getState().setSelection(["cards"], []);
      useDocStore.getState().removeSelection();
    });
    expect(useDocStore.getState().ui.deletePrompt?.mapped).toEqual([{ id: "cards", name: "Cards", links: 1 }]);
    act(() => useDocStore.getState().resolveDeletePrompt("keep-waiting"));
    let block = useDocStore.getState().doc.diagrams.root.nodes.find((n) => n.id === "blk") as NestedNode;
    // Kept, unmapped: the amber "waiting to be linked" ghost.
    expect(block.ports.find((p) => p.id === "pIn")!.innerNodeId).toBeUndefined();
    expect(useDocStore.getState().doc.diagrams.root.edges.some((e) => e.id === "in")).toBe(true);

    act(() => {
      useDocStore.temporal.getState().undo();
      useDocStore.getState().setSelection(["cards"], []);
      useDocStore.getState().removeSelection();
      useDocStore.getState().resolveDeletePrompt("remove-links");
    });
    block = useDocStore.getState().doc.diagrams.root.nodes.find((n) => n.id === "blk") as NestedNode;
    expect(block.ports.some((p) => p.id === "pIn")).toBe(false);
    expect(useDocStore.getState().doc.diagrams.root.edges.some((e) => e.id === "in")).toBe(false);
  });

  it("a plain delete asks nothing", () => {
    act(() => {
      useDocStore.getState().setSelection(["gw"], []);
      useDocStore.getState().removeSelection();
    });
    expect(useDocStore.getState().ui.deletePrompt).toBeNull();
    expect(useDocStore.getState().doc.diagrams.root.nodes.some((n) => n.id === "gw")).toBe(false);
  });
});
