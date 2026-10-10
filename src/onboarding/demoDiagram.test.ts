import { describe, expect, it } from "vitest";
import { buildDemoDoc } from "./demoDiagram";
import { encodeDoc, decodeDoc } from "../file/documentFormat";
import { validateDoc } from "../model/validate";
import type { NestedNode } from "../model/types";

function nested(doc: ReturnType<typeof buildDemoDoc>, diagramId: string): NestedNode[] {
  return doc.diagrams[diagramId].nodes.filter((n): n is NestedNode => n.type === "nested");
}

describe("demo diagram", () => {
  // The headline requirement: the sample must be indistinguishable from a real document. If it
  // could break an invariant, it would be shipping a corrupt file to every first-time visitor.
  it("passes the same model validation as any user document", () => {
    expect(validateDoc(buildDemoDoc())).toEqual([]);
  });

  it("round-trips through the file format unchanged", () => {
    const doc = buildDemoDoc();
    const result = decodeDoc(encodeDoc(doc));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.doc).toEqual(doc);
  });

  it("has two real levels of nesting, so depth is demonstrably not a mock-up", () => {
    const doc = buildDemoDoc();
    const root = doc.rootDiagramIds[0];

    const service = nested(doc, root);
    expect(service).toHaveLength(1);
    expect(service[0].collapsed.summary).toBe("cards · fraud · ledger");

    const fraud = nested(doc, service[0].childDiagramId);
    expect(fraud).toHaveLength(1);
    expect(fraud[0].collapsed.summary).toBe("rules · ML score");

    // Level 2 needs enough content to read as a real diagram rather than a placeholder.
    expect(doc.diagrams[fraud[0].childDiagramId].nodes.length).toBeGreaterThanOrEqual(3);
  });

  it("routes the parent connection through a mapped port, so the ghost link renders inside", () => {
    const doc = buildDemoDoc();
    const root = doc.rootDiagramIds[0];
    const service = nested(doc, root)[0];

    const port = service.ports[0];
    expect(port).toBeDefined();
    // A port mapped to a real inner node is what makes the boundary edge visible from within
    // the child; an unmapped one (or a plain body edge) would show nothing there.
    expect(port.innerNodeId).toBe("demo-payment-api");
    expect(doc.diagrams[service.childDiagramId].nodes.some((n) => n.id === port.innerNodeId)).toBe(true);

    const inbound = doc.diagrams[root].edges.find((e) => e.target.nodeId === service.id);
    expect(inbound?.target.portId).toBe(port.id);
    expect(inbound?.source.nodeId).toBe("demo-gateway");
  });

  it("wires the nested node out to both downstream shapes on the main page", () => {
    const doc = buildDemoDoc();
    const root = doc.rootDiagramIds[0];
    const service = nested(doc, root)[0];
    const targets = doc.diagrams[root].edges
      .filter((e) => e.source.nodeId === service.id)
      .map((e) => e.target.nodeId)
      .sort();
    expect(targets).toEqual(["demo-notify", "demo-orders"]);
  });

  it("builds a fresh document each call, so one session cannot mutate the next", () => {
    const a = buildDemoDoc();
    const b = buildDemoDoc();
    expect(a).not.toBe(b);
    expect(a.rootDiagramIds[0]).not.toBe(b.rootDiagramIds[0]);
  });
});
