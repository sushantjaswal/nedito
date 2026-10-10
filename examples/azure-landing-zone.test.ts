import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { decodeDoc, encodeDoc } from "../src/file/documentFormat";
import { validateDoc } from "../src/model/validate";
import { getStencil, loadSection, cacheStencils, SECTION_IDS, type SectionId } from "../src/library/stencils";
import type { NestedNode } from "../src/model/types";

// The committed example is a real document, so it can rot in ways a hand-written fixture
// cannot: a stencil id could be retired, an invariant tightened, the format bumped. These
// tests are what make it stay true rather than becoming a file nobody dares open.
const FILE = path.join("examples", "azure-landing-zone.nedito");

function loadExample() {
  const result = decodeDoc(readFileSync(FILE, "utf-8"));
  if (!result.ok) throw new Error(`example failed to decode: ${result.error}`);
  return result.doc;
}

describe("examples/azure-landing-zone.nedito", () => {
  it("decodes and passes the same validation as any opened file", () => {
    expect(validateDoc(loadExample())).toEqual([]);
  });

  it("re-encodes byte-identically, so the committed file is what the builder produces", () => {
    const text = readFileSync(FILE, "utf-8");
    expect(encodeDoc(loadExample())).toBe(text);
  });

  it("has one page and three nested blocks below it", () => {
    const doc = loadExample();
    expect(doc.rootDiagramIds).toHaveLength(1);
    expect(Object.keys(doc.diagrams)).toHaveLength(4);

    const root = doc.diagrams[doc.rootDiagramIds[0]];
    const nested = root.nodes.filter((n): n is NestedNode => n.type === "nested");
    expect(nested.map((n) => n.label?.text).sort()).toEqual([
      "A2 subscription",
      "Connectivity subscription",
      "Subscription vending automation",
    ]);
  });

  // The point of the example: the two boundary-crossing edges are mapped through ports, so
  // they appear as ghost links inside the children rather than stopping at the box.
  it("maps every port to a node that really exists in its child diagram", () => {
    const doc = loadExample();
    const root = doc.diagrams[doc.rootDiagramIds[0]];

    let mapped = 0;
    for (const node of root.nodes) {
      if (node.type !== "nested") continue;
      const child = doc.diagrams[node.childDiagramId];
      expect(child, `${node.label?.text} points at a missing diagram`).toBeDefined();
      for (const port of node.ports) {
        expect(port.innerNodeId, `${node.label?.text}/${port.id} is unmapped`).toBeDefined();
        expect(child.nodes.some((n) => n.id === port.innerNodeId)).toBe(true);
        mapped += 1;
      }
    }
    expect(mapped).toBe(4);
  });

  it("routes both cross-boundary edges through those ports", () => {
    const doc = loadExample();
    const root = doc.diagrams[doc.rootDiagramIds[0]];
    const crossing = root.edges.filter((e) => e.source.portId || e.target.portId);

    expect(crossing).toHaveLength(2);
    expect(crossing.map((e) => e.label?.text).sort()).toEqual(["Virtual network peering", "deploys"]);
    // Both ends of the peering edge name a port: a crossing is only real from both sides.
    const peering = crossing.find((e) => e.label?.text === "Virtual network peering")!;
    expect(peering.source.portId).toBeDefined();
    expect(peering.target.portId).toBeDefined();
  });

  it("only uses stencils the app actually ships", async () => {
    for (const id of SECTION_IDS.filter((s): s is SectionId => s !== "scratchpad")) {
      const section = await loadSection(id);
      if (section) cacheStencils(section.shapes);
    }

    const doc = loadExample();
    const missing = new Set<string>();
    for (const diagram of Object.values(doc.diagrams)) {
      for (const node of diagram.nodes) {
        if (node.type !== "shape") continue;
        if (!getStencil(node.shapeRef)) missing.add(node.shapeRef);
      }
    }
    // An unresolved shapeRef renders as a blank white box with no error anywhere (D54), which
    // on an example diagram would be silently, confusingly wrong.
    expect([...missing]).toEqual([]);
  });
});
