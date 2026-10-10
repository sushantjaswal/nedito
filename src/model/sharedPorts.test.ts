import { describe, expect, it } from "vitest";
import { addEdge, addNode } from "./actions";
import { addNestedNode, ensurePortForConnection, portCarriesEdge, splitSharedPorts } from "./nesting";
import { computeGhostLinks } from "../nesting/ghostLinkGeometry";
import { CURRENT_FORMAT_VERSION } from "../file/documentFormat";
import type { DiagramDocument, NestedNode, ShapeNode } from "./types";

// Regression cover for the bug in the 2026-09-02 recording: two edges leaving a nested block
// ended up sharing one port, so the child showed a single ghost where there should have been
// two — the second stacked exactly on the first — and mapping it moved both at once.

function baseDoc(): DiagramDocument {
  return {
    formatVersion: CURRENT_FORMAT_VERSION,
    meta: {
      title: "T",
      created: "2026-09-02T00:00:00.000Z",
      modified: "2026-09-02T00:00:00.000Z",
      appVersion: "0.0.1",
    },
    rootDiagramIds: ["root"],
    diagrams: { root: { id: "root", title: "Main", nodes: [], edges: [] } },
  };
}

function shape(id: string): Omit<ShapeNode, "z"> {
  return {
    id,
    type: "shape",
    shapeRef: "general/rect",
    position: { x: 0, y: 0 },
    size: { w: 100, h: 60 },
    style: {},
    label: { text: id },
  };
}

function nestedOf(doc: DiagramDocument, id: string): NestedNode {
  return doc.diagrams.root.nodes.find((n) => n.id === id) as NestedNode;
}

/** The parent side of the recording: a block with two shapes to connect out to. */
function withBlock() {
  let doc = baseDoc();
  doc = addNode(doc, "root", shape("exit 1"));
  doc = addNode(doc, "root", shape("exit 2"));
  const added = addNestedNode(doc, "root", { x: 300, y: 200 }, { w: 240, h: 150 }, "Block");
  return { doc: added.doc, blockId: added.nestedNodeId, childId: added.childDiagramId };
}

function edgeOut(id: string, blockId: string, portId: string | undefined, target: string) {
  return { id, source: { nodeId: blockId, portId }, target: { nodeId: target }, style: {} };
}

describe("ensurePortForConnection — one port per external edge", () => {
  it("gives a second edge its own port instead of the one already in use", () => {
    const { doc: start, blockId } = withBlock();

    const first = ensurePortForConnection(start, "root", blockId, undefined, "right", "out");
    const doc = addEdge(first.doc, "root", edgeOut("e1", blockId, first.portId, "exit 1"));

    // React Flow snaps a connection to any handle inside its connectionRadius, so a second
    // edge dropped near the first dot arrives here already resolved to that same port.
    const second = ensurePortForConnection(doc, "root", blockId, first.portId, `port:${first.portId}`, "out");

    expect(second.portId).not.toBe(first.portId);
    expect(nestedOf(second.doc, blockId).ports).toHaveLength(2);
  });

  it("still attaches to a port the author aimed at while it is free", () => {
    const { doc: start, blockId } = withBlock();
    const made = ensurePortForConnection(start, "root", blockId, undefined, "right", "out");

    const reused = ensurePortForConnection(made.doc, "root", blockId, made.portId, `port:${made.portId}`, "out");

    expect(reused.portId).toBe(made.portId);
    expect(nestedOf(reused.doc, blockId).ports).toHaveLength(1);
  });

  it("puts the superseding port on the side the author aimed at", () => {
    const { doc: start, blockId } = withBlock();
    const first = ensurePortForConnection(start, "root", blockId, undefined, "top", "out");
    const doc = addEdge(first.doc, "root", edgeOut("e1", blockId, first.portId, "exit 1"));

    // "port:<id>" carries no side of its own, so it has to come from the port being superseded
    // — not from the in/out default, which would fling the new dot to the opposite edge.
    const second = ensurePortForConnection(doc, "root", blockId, first.portId, `port:${first.portId}`, "out");
    const ports = nestedOf(second.doc, blockId).ports;
    expect(ports.find((p) => p.id === second.portId)?.side).toBe("top");
  });

  it("does not read an edge being reconnected as a clash with itself", () => {
    const { doc: start, blockId } = withBlock();
    const made = ensurePortForConnection(start, "root", blockId, undefined, "right", "out");
    const doc = addEdge(made.doc, "root", edgeOut("e1", blockId, made.portId, "exit 1"));

    const again = ensurePortForConnection(doc, "root", blockId, made.portId, `port:${made.portId}`, "out", "e1");

    expect(again.portId).toBe(made.portId);
    expect(nestedOf(again.doc, blockId).ports).toHaveLength(1);
  });

  it("reports a freshly created port as carrying nothing yet", () => {
    const { doc: start, blockId } = withBlock();
    const made = ensurePortForConnection(start, "root", blockId, undefined, "right", "out");
    expect(portCarriesEdge(made.doc.diagrams.root, blockId, made.portId!)).toBe(false);
  });
});

describe("splitSharedPorts — repairing documents saved with the bug", () => {
  /** Exactly the recording's document: two edges out of one port. */
  function sharedPortDoc() {
    const { doc: start, blockId, childId } = withBlock();
    const made = ensurePortForConnection(start, "root", blockId, undefined, "right", "out");
    const portId = made.portId!;
    let doc = addEdge(made.doc, "root", edgeOut("e1", blockId, portId, "exit 1"));
    doc = addEdge(doc, "root", edgeOut("e2", blockId, portId, "exit 2"));
    return { doc, blockId, childId, portId };
  }

  it("gives each edge its own port", () => {
    const { doc, blockId, portId } = sharedPortDoc();
    expect(nestedOf(doc, blockId).ports).toHaveLength(1);

    const fixed = splitSharedPorts(doc);
    const ports = nestedOf(fixed, blockId).ports;
    expect(ports).toHaveLength(2);

    const e1 = fixed.diagrams.root.edges.find((e) => e.id === "e1")!;
    const e2 = fixed.diagrams.root.edges.find((e) => e.id === "e2")!;
    expect(e1.source.portId).toBe(portId); // the first keeps the original
    expect(e2.source.portId).not.toBe(portId);
    expect(new Set(ports.map((p) => p.id)).size).toBe(2);
  });

  it("makes both parent connections visible inside the child instead of one hiding the other", () => {
    const { doc, childId } = sharedPortDoc();
    const navStack = ["root", childId];

    const before = computeGhostLinks(doc, navStack);
    // Two ghosts were always computed — they just shared a port, so they resolved to identical
    // geometry and drew on top of each other.
    expect(before).toHaveLength(2);
    expect(new Set(before.map((g) => g.portId)).size).toBe(1);

    const after = computeGhostLinks(splitSharedPorts(doc), navStack);
    expect(after).toHaveLength(2);
    expect(new Set(after.map((g) => g.portId)).size).toBe(2);
    expect(after.map((g) => g.label).sort()).toEqual(["exit 1", "exit 2"]);
  });

  it("carries an existing mapping onto the new port, so nothing has to be re-linked", () => {
    const { doc, blockId, childId, portId } = sharedPortDoc();
    let mapped = addNode(doc, childId, shape("inner"));
    mapped = {
      ...mapped,
      diagrams: {
        ...mapped.diagrams,
        root: {
          ...mapped.diagrams.root,
          nodes: mapped.diagrams.root.nodes.map((n) =>
            n.id === blockId && n.type === "nested"
              ? { ...n, ports: n.ports.map((p) => (p.id === portId ? { ...p, innerNodeId: "inner" } : p)) }
              : n,
          ),
        },
      },
    };

    const ports = nestedOf(splitSharedPorts(mapped), blockId).ports;
    expect(ports).toHaveLength(2);
    expect(ports.every((p) => p.innerNodeId === "inner")).toBe(true);
  });

  it("spreads the new dots along the side rather than stacking them", () => {
    const { doc, blockId } = sharedPortDoc();
    const ports = nestedOf(splitSharedPorts(doc), blockId).ports;
    expect(ports.every((p) => p.side === "right")).toBe(true);
    expect(new Set(ports.map((p) => p.offset)).size).toBe(2);
  });

  it("leaves a healthy document exactly as it was", () => {
    const { doc: start, blockId } = withBlock();
    const a = ensurePortForConnection(start, "root", blockId, undefined, "right", "out");
    let doc = addEdge(a.doc, "root", edgeOut("e1", blockId, a.portId, "exit 1"));
    const b = ensurePortForConnection(doc, "root", blockId, undefined, "right", "out");
    doc = addEdge(b.doc, "root", edgeOut("e2", blockId, b.portId, "exit 2"));

    expect(splitSharedPorts(doc)).toBe(doc);
  });

  it("handles more than two edges on one port", () => {
    const { doc: start, blockId } = withBlock();
    let doc = addNode(start, "root", shape("exit 3"));
    const made = ensurePortForConnection(doc, "root", blockId, undefined, "right", "out");
    const portId = made.portId!;
    doc = made.doc;
    for (const [id, target] of [
      ["e1", "exit 1"],
      ["e2", "exit 2"],
      ["e3", "exit 3"],
    ] as const) {
      doc = addEdge(doc, "root", edgeOut(id, blockId, portId, target));
    }

    expect(nestedOf(splitSharedPorts(doc), blockId).ports).toHaveLength(3);
  });

  it("splits an incoming end as readily as an outgoing one", () => {
    const { doc: start, blockId } = withBlock();
    const made = ensurePortForConnection(start, "root", blockId, undefined, "left", "in");
    const portId = made.portId!;
    let doc = addEdge(made.doc, "root", {
      id: "e1",
      source: { nodeId: "exit 1" },
      target: { nodeId: blockId, portId },
      style: {},
    });
    doc = addEdge(doc, "root", {
      id: "e2",
      source: { nodeId: "exit 2" },
      target: { nodeId: blockId, portId },
      style: {},
    });

    const fixed = splitSharedPorts(doc);
    expect(nestedOf(fixed, blockId).ports).toHaveLength(2);
    expect(new Set(fixed.diagrams.root.edges.map((e) => e.target.portId)).size).toBe(2);
  });
});
