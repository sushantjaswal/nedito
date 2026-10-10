// An edge that ends on a port must be drawn to that port, by the canvas and by the export alike.
//
// A port attachment used to live in two places — `end.portId` and a `"port:<id>"` handle string —
// and the code paths that change one did not all change the other. React Flow drops an edge whose
// handle names a port that is not there, so each slip made an edge vanish from the canvas while it
// stayed in the file and in every export (CLAUDE_HISTORY.md D72). `endHandle` now derives the
// handle from `portId`, which is the only copy anything should trust.
import { describe, expect, it } from "vitest";
import { Position } from "@xyflow/react";
import { markerId, markerUrl } from "./arrowheads";
import { endHandle, resolveHandleAnchor } from "./edgeRouting";
import { removePort } from "../model/nesting";
import { createDefaultLayers } from "../model/layers";
import { applyTemplate } from "../templates/applyTemplate";
import type { DiagramDocument, DEdge, NestedNode, ShapeNode } from "../model/types";

describe("endHandle", () => {
  it("attaches a port end to its port, whatever the style string says", () => {
    // connect() and reconnectEdge() record the side the user dropped on, not the port they
    // auto-created; the line used to end at that side's midpoint, away from its own port dot.
    expect(endHandle({ portId: "p1" }, "left")).toBe("port:p1");
    expect(endHandle({ portId: "p1" }, "port:stale")).toBe("port:p1");
  });

  it("passes a plain side or corner handle straight through", () => {
    expect(endHandle({}, "right")).toBe("right");
    expect(endHandle({}, "top-left")).toBe("top-left");
  });

  it("ignores a port handle string with no portId behind it", () => {
    // What removePort used to leave behind: a reference to a port that no longer exists.
    expect(endHandle({}, "port:gone")).toBeNull();
  });

  it("falls back to React Flow's default when nothing is named", () => {
    expect(endHandle({}, undefined)).toBeNull();
    expect(endHandle({}, "")).toBeNull();
  });
});

describe("marker references", () => {
  // React Flow wraps a string marker as url('#…') itself. Handing it an already-wrapped value
  // produced url('#url(#nd-arrow-classic)'), which points at nothing: from T2 until D72 the canvas
  // drew no arrowheads at all.
  it("gives React Flow the bare id", () => {
    expect(markerId("classic")).toBe("nd-arrow-classic");
    expect(markerId("classic")).not.toContain("url(");
  });

  it("wraps it exactly once for markup written by hand", () => {
    expect(markerUrl("classic")).toBe("url(#nd-arrow-classic)");
  });

  it("returns nothing for none or an unknown kind", () => {
    expect(markerId("none")).toBeUndefined();
    expect(markerId("no-such-arrowhead")).toBeUndefined();
    expect(markerUrl("none")).toBeUndefined();
  });
});

describe("corner handles", () => {
  // A corner edge ends on the corner itself: the x once drifted 3.5px left in the export (D72),
  // and the y sat 3.5px above the corner at the dot's edge until edges were made to touch their
  // shapes (D81). Corners still leave upward, as the canvas always drew them.
  const box = { x: 100, y: 200, w: 80, h: 40 };
  const shape: ShapeNode = {
    id: "s",
    type: "shape",
    shapeRef: "general/rect",
    position: { x: box.x, y: box.y },
    size: { w: box.w, h: box.h },
    z: 1,
    style: {},
  };

  it.each([
    ["top-left", 100, 200],
    ["top-right", 180, 200],
    ["bottom-left", 100, 240],
    ["bottom-right", 180, 240],
  ])("puts %s exactly on the corner", (id, x, y) => {
    const anchor = resolveHandleAnchor(shape, box, id);
    expect(anchor.point).toEqual({ x, y });
    expect(anchor.position).toBe(Position.Top);
  });
});

function docWithPortEdge(): DiagramDocument {
  const nested: NestedNode = {
    id: "n1",
    type: "nested",
    childDiagramId: "child",
    position: { x: 300, y: 100 },
    size: { w: 200, h: 120 },
    z: 2,
    style: {},
    collapsed: { icons: [] },
    ports: [{ id: "p1", side: "left", offset: 0.3, innerNodeId: "inner" }],
  };
  const source: ShapeNode = {
    id: "a",
    type: "shape",
    shapeRef: "general/rect",
    position: { x: 0, y: 100 },
    size: { w: 120, h: 60 },
    z: 1,
    style: {},
  };
  const edge: DEdge = {
    id: "e1",
    source: { nodeId: "a" },
    target: { nodeId: "n1", portId: "p1" },
    // How connect() stores it: the port lives in the handle string as well as in portId.
    style: { sourceHandle: "right", targetHandle: "port:p1" },
  };
  return {
    formatVersion: 2,
    meta: { title: "t", created: "2026-09-25T00:00:00.000Z", modified: "2026-09-25T00:00:00.000Z", appVersion: "0.0.1" },
    rootDiagramIds: ["page"],
    diagrams: {
      page: { id: "page", title: "Page", layers: createDefaultLayers(), nodes: [source, nested], edges: [edge] },
      child: {
        id: "child",
        title: "Child",
        layers: createDefaultLayers(),
        nodes: [{ ...source, id: "inner", position: { x: 0, y: 0 } }],
        edges: [],
      },
    },
  };
}

describe("port edges survive the operations that re-issue or remove ports", () => {
  it("still resolves to a real port after a template re-issues every id", () => {
    const empty: DiagramDocument = {
      ...docWithPortEdge(),
      rootDiagramIds: ["blank"],
      diagrams: { blank: { id: "blank", title: "Blank", layers: createDefaultLayers(), nodes: [], edges: [] } },
    };
    let n = 0;
    const { doc, pageId } = applyTemplate(empty, docWithPortEdge(), "into-current", "blank", () => `id${++n}`.padEnd(21, "_"));
    const page = doc.diagrams[pageId];
    const edge = page.edges[0];
    const nested = page.nodes.find((x): x is NestedNode => x.type === "nested")!;

    const handle = endHandle(edge.target, edge.style.targetHandle);
    // The handle must name a port that exists on the node, or React Flow drops the edge.
    expect(handle).toBe(`port:${edge.target.portId}`);
    expect(nested.ports.some((p) => `port:${p.id}` === handle)).toBe(true);
  });

  it("degrades to the removed port's side rather than to a handle that does not exist", () => {
    const doc = removePort(docWithPortEdge(), "page", "n1", "p1");
    const edge = doc.diagrams.page.edges[0];
    expect(edge.target.portId).toBeUndefined();
    expect(edge.style.targetHandle).toBe("left");
    expect(endHandle(edge.target, edge.style.targetHandle)).toBe("left");
  });

  it("leaves edges on other ports alone", () => {
    const base = docWithPortEdge();
    const nested = base.diagrams.page.nodes[1] as NestedNode;
    nested.ports.push({ id: "p2", side: "right", offset: 0.5, innerNodeId: "inner" });
    const doc = removePort(base, "page", "n1", "p2");
    const edge = doc.diagrams.page.edges[0];
    expect(edge.target.portId).toBe("p1");
    expect(edge.style.targetHandle).toBe("port:p1");
  });
});
