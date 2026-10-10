// Trace (A2, D117): what a trace lights on its level, and how it follows connections into and out
// of a Nested Block through its ports.
import { describe, expect, it } from "vitest";
import type { DiagramDocument, NestedNode, ShapeNode } from "../model/types";
import { carryInto, carryOut, litInnerNodes, traceSet } from "./trace";

const shape = (id: string): ShapeNode => ({ id, type: "shape", shapeRef: "general/rect", position: { x: 0, y: 0 }, size: { w: 100, h: 60 }, z: 1, style: {} });

/**
 *   gateway → [Payments: port pIn → cards] → orders
 *   gateway → audit
 *   inside Payments: cards → fraud, and port pOut maps fraud → orders; pLoose is unmapped.
 */
function doc(): DiagramDocument {
  const block: NestedNode = {
    id: "pay",
    type: "nested",
    position: { x: 0, y: 0 },
    size: { w: 160, h: 100 },
    z: 2,
    style: {},
    childDiagramId: "inner",
    collapsed: { icons: [] },
    ports: [
      { id: "pIn", side: "left", offset: 0.5, innerNodeId: "cards" },
      { id: "pOut", side: "right", offset: 0.5, innerNodeId: "fraud" },
      { id: "pLoose", side: "top", offset: 0.5 } as never,
    ],
  };
  return {
    formatVersion: 6,
    meta: { title: "t", created: "", modified: "", appVersion: "0" },
    rootDiagramIds: ["root"],
    diagrams: {
      root: {
        id: "root",
        title: "Main",
        nodes: [shape("gateway"), block, shape("orders"), shape("audit"), shape("lonely")],
        edges: [
          { id: "g-pay", source: { nodeId: "gateway" }, target: { nodeId: "pay", portId: "pIn" }, style: {} },
          { id: "pay-o", source: { nodeId: "pay", portId: "pOut" }, target: { nodeId: "orders" }, style: {} },
          { id: "g-audit", source: { nodeId: "gateway" }, target: { nodeId: "audit" }, style: {} },
        ],
      },
      inner: {
        id: "inner",
        title: "Payments",
        nodes: [shape("cards"), shape("fraud"), shape("ledger")],
        edges: [{ id: "c-f", source: { nodeId: "cards" }, target: { nodeId: "fraud" }, style: {} }],
      },
    },
  };
}

describe("traceSet", () => {
  it("lights the focus, its lines, the shapes at their other ends and the ports they land on", () => {
    const lit = traceSet(doc().diagrams.root, ["gateway"]);
    expect([...lit.nodes].sort()).toEqual(["audit", "gateway", "pay"]);
    expect([...lit.edges].sort()).toEqual(["g-audit", "g-pay"]);
    expect([...lit.ports]).toEqual(["pIn"]);
  });

  it("a shape with no lines lights only itself", () => {
    const lit = traceSet(doc().diagrams.root, ["lonely"]);
    expect([...lit.nodes]).toEqual(["lonely"]);
    expect(lit.edges.size).toBe(0);
  });
});

describe("across levels", () => {
  it("opening a block the trace reaches carries it to the shape its lit port maps to", () => {
    expect(carryInto(doc(), { diagramId: "root", focus: ["gateway"] }, "pay")).toEqual({ diagramId: "inner", focus: ["cards"] });
    // From the other side, through the other port.
    expect(carryInto(doc(), { diagramId: "root", focus: ["orders"] }, "pay")).toEqual({ diagramId: "inner", focus: ["fraud"] });
  });

  it("tracing the block itself carries every mapped port inside", () => {
    expect(carryInto(doc(), { diagramId: "root", focus: ["pay"] }, "pay")?.focus.sort()).toEqual(["cards", "fraud"]);
  });

  it("a trace that does not reach the block, or no trace, carries nothing in", () => {
    expect(carryInto(doc(), { diagramId: "root", focus: ["audit"] }, "pay")).toBeNull();
    expect(carryInto(doc(), null, "pay")).toBeNull();
  });

  it("climbing out with a traced shape a port maps to comes back out at its block", () => {
    expect(carryOut(doc(), { diagramId: "inner", focus: ["fraud"] }, "root")).toEqual({ diagramId: "root", focus: ["pay"] });
    // A shape no port maps to has nothing to come out through.
    expect(carryOut(doc(), { diagramId: "inner", focus: ["ledger"] }, "root")).toBeNull();
  });

  it("lights the ghost pills of the traced inner shapes only on their own level", () => {
    const t = { diagramId: "inner", focus: ["cards"] };
    expect([...litInnerNodes(t, "inner")]).toEqual(["cards"]);
    expect(litInnerNodes(t, "root").size).toBe(0);
  });
});
