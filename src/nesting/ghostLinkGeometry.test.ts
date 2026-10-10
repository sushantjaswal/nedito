import { describe, expect, it } from "vitest";
import { computeGhostLinks } from "./ghostLinkGeometry";
import type { DiagramDocument, NestedNode, ShapeNode } from "../model/types";

function shape(id: string, label?: string): ShapeNode {
  return {
    id,
    type: "shape",
    shapeRef: "general/rect",
    position: { x: 0, y: 0 },
    size: { w: 100, h: 60 },
    z: 1,
    style: {},
    label: label ? { text: label } : undefined,
  };
}

function docWithBoundary(): { doc: DiagramDocument; nestedId: string; portInId: string; portOutId: string } {
  const nested: NestedNode = {
    id: "nested1",
    type: "nested",
    position: { x: 100, y: 0 },
    size: { w: 200, h: 140 },
    z: 1,
    style: {},
    childDiagramId: "child",
    collapsed: { icons: [] },
    ports: [
      { id: "portIn", side: "left", offset: 0.5, innerNodeId: "innerA" },
      { id: "portOut", side: "right", offset: 0.5, innerNodeId: "innerB" },
    ],
  };

  const doc: DiagramDocument = {
    formatVersion: 1,
    meta: { title: "t", created: "", modified: "", appVersion: "0" },
    rootDiagramIds: ["root"],
    diagrams: {
      root: {
        id: "root",
        title: "Root",
        nodes: [shape("gateway", "API Gateway"), nested, shape("db", "Orders DB")],
        edges: [
          { id: "e-in", source: { nodeId: "gateway" }, target: { nodeId: "nested1", portId: "portIn" }, style: {} },
          { id: "e-out", source: { nodeId: "nested1", portId: "portOut" }, target: { nodeId: "db" }, style: {} },
        ],
      },
      child: {
        id: "child",
        title: "Payment Service",
        nodes: [shape("innerA", "Fraud Check"), shape("innerB", "Ledger")],
        edges: [],
      },
    },
  };

  return { doc, nestedId: nested.id, portInId: "portIn", portOutId: "portOut" };
}

describe("computeGhostLinks", () => {
  it("returns nothing at the root level (no parent)", () => {
    const { doc } = docWithBoundary();
    expect(computeGhostLinks(doc, ["root"])).toEqual([]);
  });

  it("finds an incoming ghost link for an edge targeting a port", () => {
    const { doc } = docWithBoundary();
    const links = computeGhostLinks(doc, ["root", "child"]);
    const incoming = links.find((l) => l.direction === "incoming")!;
    expect(incoming.label).toBe("API Gateway");
    expect(incoming.innerNodeId).toBe("innerA");
  });

  it("finds an outgoing ghost link for an edge sourced from a port", () => {
    const { doc } = docWithBoundary();
    const links = computeGhostLinks(doc, ["root", "child"]);
    const outgoing = links.find((l) => l.direction === "outgoing")!;
    expect(outgoing.label).toBe("Orders DB");
    expect(outgoing.innerNodeId).toBe("innerB");
  });

  it("ignores edges on the nested node that aren't attached to a specific port", () => {
    const { doc } = docWithBoundary();
    doc.diagrams.root.edges.push({ id: "e-generic", source: { nodeId: "gateway" }, target: { nodeId: "nested1" }, style: {} });
    const links = computeGhostLinks(doc, ["root", "child"]);
    expect(links.map((l) => l.id).sort()).toEqual(["e-in", "e-out"]);
  });

  it("returns nothing if the parent has no nested node pointing at this diagram", () => {
    const { doc } = docWithBoundary();
    expect(computeGhostLinks(doc, ["root", "nowhere"])).toEqual([]);
  });

  it("still reports a ghost for an unmapped port, with innerNodeId undefined", () => {
    const { doc } = docWithBoundary();
    const nested = doc.diagrams.root.nodes.find((n) => n.id === "nested1") as NestedNode;
    nested.ports = nested.ports.map((p) => (p.id === "portIn" ? { ...p, innerNodeId: undefined } : p));

    const links = computeGhostLinks(doc, ["root", "child"]);
    const incoming = links.find((l) => l.direction === "incoming")!;
    // The connection is real and must stay visible; it just has nowhere to anchor yet, which is
    // what lets the overlay draw it with a loose, draggable endpoint.
    expect(incoming.label).toBe("API Gateway");
    expect(incoming.innerNodeId).toBeUndefined();
    expect(incoming.portId).toBe("portIn");
  });

  it("carries the port id on every ghost so the UI can map it", () => {
    const { doc } = docWithBoundary();
    const links = computeGhostLinks(doc, ["root", "child"]);
    expect(links.map((l) => l.portId).sort()).toEqual(["portIn", "portOut"]);
  });

  it("reports the port's own side, not one implied by the connection's direction", () => {
    const { doc } = docWithBoundary();
    const nested = doc.diagrams.root.nodes.find((n) => n.id === "nested1") as NestedNode;
    // An *incoming* connection deliberately parked on the right: placement must follow the port,
    // otherwise every incoming ghost piles onto the left of the shape however it was dropped.
    nested.ports = nested.ports.map((p) => (p.id === "portIn" ? { ...p, side: "right" as const } : p));

    const incoming = computeGhostLinks(doc, ["root", "child"]).find((l) => l.direction === "incoming")!;
    expect(incoming.side).toBe("right");
  });

  it("finds no chain past the immediate parent when the connection doesn't continue outward", () => {
    const { doc } = docWithBoundary();
    const links = computeGhostLinks(doc, ["root", "child"]);
    for (const link of links) {
      expect(link.chain).toEqual([]);
      expect(link.reachesRoot).toBe(false);
    }
  });

  it("walks the ancestor chain across three levels of nesting back to the root (D41)", () => {
    // root --[API Gateway -> port]--> "Payment Service" (childDiagramId: service)
    // service: "Payment API" --[port]--> "Fraud Engine" (childDiagramId: engine)
    // engine: "Rules Engine" — the innermost diagram whose ghost should trace all the way back
    const serviceNested: NestedNode = {
      id: "serviceNode",
      type: "nested",
      position: { x: 100, y: 0 },
      size: { w: 200, h: 140 },
      z: 1,
      style: {},
      childDiagramId: "service",
      collapsed: { icons: [] },
      ports: [{ id: "svcPortIn", side: "left", offset: 0.5, innerNodeId: "paymentApi" }],
    };
    const engineNested: NestedNode = {
      id: "engineNode",
      type: "nested",
      position: { x: 100, y: 0 },
      size: { w: 200, h: 140 },
      z: 1,
      style: {},
      childDiagramId: "engine",
      collapsed: { icons: [] },
      ports: [{ id: "enginePortIn", side: "left", offset: 0.5, innerNodeId: "rulesEngine" }],
    };
    const doc: DiagramDocument = {
      formatVersion: 1,
      meta: { title: "t", created: "", modified: "", appVersion: "0" },
      rootDiagramIds: ["root"],
      diagrams: {
        root: {
          id: "root",
          title: "Root",
          nodes: [shape("gateway", "API Gateway"), serviceNested],
          edges: [
            { id: "e-root", source: { nodeId: "gateway" }, target: { nodeId: "serviceNode", portId: "svcPortIn" }, style: {} },
          ],
        },
        service: {
          id: "service",
          title: "Payment Service",
          nodes: [shape("paymentApi", "Payment API"), engineNested],
          edges: [
            { id: "e-service", source: { nodeId: "paymentApi" }, target: { nodeId: "engineNode", portId: "enginePortIn" }, style: {} },
          ],
        },
        engine: {
          id: "engine",
          title: "Fraud Engine",
          nodes: [shape("rulesEngine", "Rules Engine")],
          edges: [],
        },
      },
    };

    const links = computeGhostLinks(doc, ["root", "service", "engine"]);
    expect(links).toHaveLength(1);
    expect(links[0].label).toBe("Payment API");
    expect(links[0].chain).toEqual(["API Gateway"]);
    expect(links[0].reachesRoot).toBe(true);
  });
});
