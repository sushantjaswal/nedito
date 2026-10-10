import { describe, expect, it } from "vitest";
import { featuredTemplates, listTemplates, loadAllTemplates, loadTemplate, searchTemplates } from "./registry";
import { derivesNesting } from "./types";
import { validateDoc } from "../model/validate";
import { cacheStencils, getStencil, loadSection, SECTION_IDS, type SectionId } from "../library/stencils";
import { encodeDoc } from "../file/documentFormat";
import { auditDiagram } from "./layoutAudit";

async function cacheEveryStencil() {
  for (const id of SECTION_IDS.filter((s): s is SectionId => s !== "scratchpad")) {
    const section = await loadSection(id);
    if (section) cacheStencils(section.shapes);
  }
}

describe("the template catalogue", () => {
  it("gives every template a unique id", () => {
    const ids = listTemplates().map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("every template's document passes the same validation as a user file", async () => {
    for (const template of await loadAllTemplates()) {
      expect(validateDoc(template.doc), `${template.id} is not a valid document`).toEqual([]);
    }
  });

  it("every template encodes as a real .nedito file", async () => {
    for (const template of await loadAllTemplates()) {
      expect(() => encodeDoc(template.doc), `${template.id} cannot be encoded`).not.toThrow();
    }
  });

  it("derives usesNesting from the document rather than trusting a flag", async () => {
    for (const template of await loadAllTemplates()) {
      expect(template.usesNesting, `${template.id}`).toBe(derivesNesting(template.doc));
    }
    const nested = (await loadAllTemplates()).find((t) => t.id === "flowchart-with-subprocess")!;
    expect(nested.usesNesting).toBe(true);
  });

  // The spec's hard rule, enforced by test rather than review: a template may only reference
  // stencils that exist and are reachable in the picker. An unresolved shapeRef renders as a
  // blank white box with no error anywhere (D54) — on a template, silently wrong.
  it("only uses stencils the app ships and the picker can show", async () => {
    await cacheEveryStencil();
    const missing: string[] = [];

    for (const template of await loadAllTemplates()) {
      for (const diagram of Object.values(template.doc.diagrams)) {
        for (const node of diagram.nodes) {
          if (node.type !== "shape") continue;
          const stencil = getStencil(node.shapeRef);
          // Hidden shapes still draw in old diagrams but are not offered: a template must not
          // start anyone off with a shape they cannot find again (D84).
          if (!stencil || stencil.hidden || stencil.id !== node.shapeRef) missing.push(`${template.id}: ${node.shapeRef}`);
        }
      }
    }
    expect(missing).toEqual([]);
  });

  // A template is the user's starting point, so its flaws are copied into every diagram made
  // from it. The audit measures with the renderers' own geometry: no line through a shape it
  // does not join, no line label on a shape, no shapes overlapping, no text spilling out of its
  // shape, and no two unrelated lines sharing a track (layoutAudit.ts). It found 129 such flaws
  // across the first set of templates; this keeps the count at zero.
  it("lays out every template cleanly: no line through a shape, no label on one, no overlaps", async () => {
    await cacheEveryStencil();
    const issues: string[] = [];
    for (const template of await loadAllTemplates()) {
      for (const diagram of Object.values(template.doc.diagrams)) {
        for (const issue of auditDiagram(diagram)) issues.push(`${template.id} › ${diagram.title}: ${issue.kind} — ${issue.detail}`);
      }
    }
    expect(issues).toEqual([]);
  }, 60_000);

  it("every stencil a template uses is findable by its own label", async () => {
    await cacheEveryStencil();
    for (const template of await loadAllTemplates()) {
      for (const diagram of Object.values(template.doc.diagrams)) {
        for (const node of diagram.nodes) {
          if (node.type !== "shape") continue;
          const stencil = getStencil(node.shapeRef)!;
          expect(stencil.label.trim().length, `${node.shapeRef} has no label to search by`).toBeGreaterThan(0);
        }
      }
    }
  });

  // A nested template that opens showing an amber "waiting to be linked" warning looks broken
  // on a brand-new document, so every port a template ships must already be mapped.
  it("maps every port in a nested template to a node that exists in its child", async () => {
    for (const template of await loadAllTemplates()) {
      for (const diagram of Object.values(template.doc.diagrams)) {
        for (const node of diagram.nodes) {
          if (node.type !== "nested") continue;
          const child = template.doc.diagrams[node.childDiagramId];
          expect(child, `${template.id}: ${node.id} points at a missing diagram`).toBeDefined();
          for (const port of node.ports) {
            expect(port.innerNodeId, `${template.id}: port ${port.id} is unmapped`).toBeDefined();
            expect(child.nodes.some((n) => n.id === port.innerNodeId)).toBe(true);
          }
        }
      }
    }
  });

  // An unnamed end falls back to React Flow's first handle, *top*, so the edge loops over its own
  // box or runs down through it. Each of T3–T6 checked this for its own batch; the T1 and T2 sets
  // were never checked and shipped with it. Now it holds for every template.
  it("names both ends of every edge, unless an end is a port", async () => {
    const unanchored: string[] = [];
    for (const t of await loadAllTemplates()) {
      for (const d of Object.values(t.doc.diagrams)) {
        for (const e of d.edges) {
          if (!e.source.portId && !e.style.sourceHandle) unanchored.push(`${t.id} › ${d.title} › ${e.id} source`);
          if (!e.target.portId && !e.style.targetHandle) unanchored.push(`${t.id} › ${d.title} › ${e.id} target`);
        }
      }
    }
    expect(unanchored).toEqual([]);
  });

  it("ships at most six featured templates, the number the start panel shows", () => {
    expect(featuredTemplates().length).toBeLessThanOrEqual(6);
  });

  it("gives every template a description and some keywords to find it by", () => {
    for (const t of listTemplates()) {
      expect(t.description.length, `${t.id} has no description`).toBeGreaterThan(0);
      expect(t.keywords.length, `${t.id} has no keywords`).toBeGreaterThan(0);
    }
  });

  it("caches a loaded template rather than re-importing it", async () => {
    const first = await loadTemplate("mind-map");
    const second = await loadTemplate("mind-map");
    expect(first).toBe(second);
  });

  it("returns null for a template that does not exist", async () => {
    expect(await loadTemplate("no-such-template")).toBeNull();
  });
});

describe("searchTemplates", () => {
  it("matches the name", () => {
    expect(searchTemplates(listTemplates(), "mind").map((t) => t.id)).toEqual(["mind-map"]);
  });

  it("matches a keyword that is not in the name", () => {
    expect(searchTemplates(listTemplates(), "brainstorm").map((t) => t.id)).toEqual(["mind-map"]);
  });

  it("matches the description", () => {
    expect(searchTemplates(listTemplates(), "decision").map((t) => t.id)).toContain("basic-flowchart");
  });

  it("returns everything for an empty query", () => {
    expect(searchTemplates(listTemplates(), "   ")).toHaveLength(listTemplates().length);
  });
});
