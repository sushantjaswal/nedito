// Checks every committed example, so each stays a true, openable document rather than a file
// nobody dares touch. They are real documents, so they rot in ways a hand-written fixture cannot:
// a stencil retired, an invariant tightened, the format bumped, a builder quietly changed.
//
// The first check is the one that was missing. azure-landing-zone.test.ts proved the committed
// file round-trips, but never that its builder still produced it — and it did not: each rebuild
// minted four new layer ids. So here every builder is run and compared
// with its committed file, byte for byte.
import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { decodeDoc, encodeDoc } from "../src/file/documentFormat";
import { cacheStencils, getStencil, loadSection, SECTION_IDS, type SectionId } from "../src/library/stencils";
import { validateDoc } from "../src/model/validate";
import type { DiagramDocument, NestedNode } from "../src/model/types";
import { EXAMPLES } from "./catalogue";

function committed(file: string): string {
  return readFileSync(path.join("examples", file), "utf-8");
}

function decoded(file: string): DiagramDocument {
  const result = decodeDoc(committed(file));
  if (!result.ok) throw new Error(`${file} failed to decode: ${result.error}`);
  return result.doc;
}

beforeAll(async () => {
  for (const id of SECTION_IDS.filter((s): s is SectionId => s !== "scratchpad")) {
    const section = await loadSection(id);
    if (section) cacheStencils(section.shapes);
  }
});

describe.each(EXAMPLES)("examples/$file", ({ file, load }) => {
  it("is exactly what its builder produces today", async () => {
    const built = encodeDoc((await load()).default);
    expect(built === committed(file), `${file} is stale — run: npx vite-node examples/build.ts`).toBe(true);
  });

  it("decodes and passes the same validation as any opened file", () => {
    expect(validateDoc(decoded(file))).toEqual([]);
  });

  it("only uses shapes the app still ships", () => {
    const missing: string[] = [];
    for (const d of Object.values(decoded(file).diagrams)) {
      for (const n of d.nodes) if (n.type === "shape" && !getStencil(n.shapeRef)) missing.push(n.shapeRef);
    }
    expect(missing).toEqual([]);
  });

  it("points every mapped port at a node that exists in its child", () => {
    const doc = decoded(file);
    for (const d of Object.values(doc.diagrams)) {
      for (const n of d.nodes) {
        if (n.type !== "nested") continue;
        const child = doc.diagrams[n.childDiagramId];
        expect(child, `${n.id} opens onto a missing diagram`).toBeDefined();
        for (const p of n.ports) {
          if (p.innerNodeId === undefined) continue; // a waiting port is legal; checked below where intended
          expect(child.nodes.some((c) => c.id === p.innerNodeId), `${p.id} maps to nothing`).toBe(true);
        }
      }
    }
  });
});

describe("what the new examples exist to exercise", () => {
  it("incident runbook: two pages, nesting two levels deep", () => {
    const doc = decoded("incident-runbook.nedito");
    expect(doc.rootDiagramIds).toHaveLength(2);
    const depth = (diagramId: string): number => {
      const kids = doc.diagrams[diagramId].nodes.filter((n): n is NestedNode => n.type === "nested");
      return kids.length ? 1 + Math.max(...kids.map((k) => depth(k.childDiagramId))) : 0;
    };
    expect(depth(doc.rootDiagramIds[0])).toBe(2);
  });

  it("incident runbook: waypoints, a group, and a locked layer that something sits on", () => {
    const doc = decoded("incident-runbook.nedito");
    const all = Object.values(doc.diagrams);
    expect(all.some((d) => d.edges.some((e) => (e.waypoints?.length ?? 0) > 0))).toBe(true);
    expect(all.some((d) => d.nodes.some((n) => n.type === "group"))).toBe(true);
    const triage = doc.diagrams[doc.rootDiagramIds[0]];
    const locked = (triage.layers ?? []).find((l) => l.locked);
    expect(locked).toBeDefined();
    expect(triage.nodes.some((n) => n.layerId === locked!.id)).toBe(true);
  });

  it("incident runbook: carries one waiting port, and an edge that uses it", () => {
    const doc = decoded("incident-runbook.nedito");
    const waiting = Object.values(doc.diagrams)
      .flatMap((d) => d.nodes)
      .filter((n): n is NestedNode => n.type === "nested")
      .flatMap((n) => n.ports.filter((p) => p.innerNodeId === undefined).map((p) => ({ node: n, port: p })));
    expect(waiting).toHaveLength(1);
    const { node, port } = waiting[0];
    const used = Object.values(doc.diagrams).some((d) =>
      d.edges.some(
        (e) =>
          (e.source.nodeId === node.id && e.source.portId === port.id) ||
          (e.target.nodeId === node.id && e.target.portId === port.id),
      ),
    );
    expect(used).toBe(true);
  });

  it("online store: a relationship mapped through ports at both ends", () => {
    const doc = decoded("online-store-domain.nedito");
    const page = doc.diagrams[doc.rootDiagramIds[0]];
    const bothEnds = page.edges.filter((e) => e.source.portId && e.target.portId);
    expect(bothEnds.length).toBeGreaterThan(0);
  });

  it("online store: UML line ends and crow's-foot cardinality in one document", () => {
    const marks = new Set(
      Object.values(decoded("online-store-domain.nedito").diagrams).flatMap((d) =>
        d.edges.flatMap((e) => [e.style.startArrow, e.style.endArrow]),
      ),
    );
    for (const m of ["triangle", "diamond", "diamond-open", "er-one", "er-zero-or-many"]) expect(marks).toContain(m);
  });
});
