// Nedito's own default look, and the classic look every earlier document keeps.
import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { edgeColorLiteral, edgeColorOnCanvas } from "../canvas/edgeColor";
import { decodeDoc, encodeDoc, writtenVersion } from "../file/documentFormat";
import { diagramToSvg } from "../file/svgExport";
import { cacheStencils, getStencil, loadSection, SECTION_IDS, type SectionId } from "../library/stencils";
import { getStencilDefaultStyle, newShapeStyle, stencilBody } from "../library/stencils/defaultStyle";
import { loadAllTemplates } from "../templates/registry";
import { hasOwnLook, isClassicLook, stampClassicLook } from "./look";
import { createEmptyDoc, useDocStore } from "./store";

const fixture = (name: string) => readFileSync(path.join("src/file/migrations/fixtures", name), "utf-8");

beforeAll(async () => {
  for (const id of SECTION_IDS.filter((s): s is SectionId => s !== "scratchpad")) {
    const section = await loadSection(id);
    if (section) cacheStencils(section.shapes);
  }
});

describe("a document saved before R6 (rule 2: renders identically)", () => {
  // pre-r6.deepdraw was drawn, and pre-r6.svg rendered, by the code on main just before R6: shapes
  // and edges at every default, a free line, a Lines stencil, a Nested Block and explicit colours.
  // Byte for byte, except that the SVG's internal marker/filter ids were renamed dd- → nd- with
  // the product (D100) — ids the SVG uses only to reference its own defs, so nothing drawn changes.
  it("exports byte for byte as it did before the new look", () => {
    const result = decodeDoc(fixture("pre-r6.deepdraw"));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const root = result.doc.diagrams[result.doc.rootDiagramIds[0]];
    expect(diagramToSvg(root, { background: "#ffffff" })).toBe(fixture("pre-r6.svg"));
  });

  it("has every shape and edge marked classic on load, and nothing else changed", () => {
    const raw = JSON.parse(fixture("pre-r6.deepdraw"));
    const result = decodeDoc(fixture("pre-r6.deepdraw"));
    if (!result.ok) throw new Error(result.error);
    for (const [id, diagram] of Object.entries(result.doc.diagrams)) {
      for (const node of diagram.nodes) {
        const before = raw.diagrams[id].nodes.find((n: { id: string }) => n.id === node.id);
        expect(node.style).toEqual(node.type === "shape" ? { ...before.style, look: "classic" } : before.style);
      }
      for (const edge of diagram.edges) {
        const before = raw.diagrams[id].edges.find((e: { id: string }) => e.id === edge.id);
        expect(edge.style).toEqual({ ...before.style, look: "classic" });
      }
    }
    expect(hasOwnLook(result.doc)).toBe(false);
  });

  it("is written back at the version it was, still classic, and reads back the same", () => {
    const result = decodeDoc(fixture("pre-r6.deepdraw"));
    if (!result.ok) throw new Error(result.error);
    const text = encodeDoc(result.doc);
    expect(JSON.parse(text).formatVersion).toBe(4);
    const again = decodeDoc(text);
    expect(again.ok && encodeDoc(again.doc)).toBe(text);
  });
});

describe("the new look, for new work", () => {
  // White and black, as before (decided in review); what is new for a shape is its shadow.
  it("draws a new outline shape white with a black outline, at the same width", () => {
    const rect = getStencil("general/rect")!;
    expect(getStencilDefaultStyle(rect)).toEqual({ fill: "#ffffff", stroke: "#1e2733", strokeWidth: 1 });
    expect(getStencilDefaultStyle(rect, true)).toEqual({ fill: "#ffffff", stroke: "#1e2733", strokeWidth: 1 });
  });

  it("leaves a stencil with its own colour, and pictograms, as they were", () => {
    const pool = getStencil("bpmn/pool")!;
    expect(pool.defaultFill).toBeDefined();
    expect(getStencilDefaultStyle(pool)).toEqual(getStencilDefaultStyle(pool, true));
    const anchor = getStencil("misc/anchor")!;
    expect(getStencilDefaultStyle(anchor)).toEqual(getStencilDefaultStyle(anchor, true));
  });

  it("places a new outline shape with its shadow on, and a pictogram or a line without", () => {
    expect(newShapeStyle(getStencil("general/rect"))).toMatchObject({ shadow: true });
    expect(newShapeStyle(getStencil("misc/anchor"))).not.toHaveProperty("shadow");
    expect(newShapeStyle(getStencil("lines/arrow"))).not.toHaveProperty("shadow");
    const s = useDocStore.getState();
    s.loadDoc(createEmptyDoc());
    const id = s.addShapeNode("flowchart/decision", { x: 0, y: 0 }, { w: 100, h: 80 });
    const doc = useDocStore.getState().doc;
    expect(doc.diagrams[doc.rootDiagramIds[0]].nodes.find((n) => n.id === id)!.style.shadow).toBe(true);
  });

  it("rounds a new Rounded Rectangle a little more, and only that shape", () => {
    const rounded = getStencil("general/rounded-rect")!;
    expect(stencilBody(rounded)).toContain('rx="17"');
    expect(stencilBody(rounded, true)).toContain('rx="12"');
    const rect = getStencil("general/rect")!;
    expect(stencilBody(rect)).toBe(stencilBody(rect, true));
  });

  // Black like shape outlines (D96), theme-aware on screen so dark mode can still see it.
  it("draws a new edge in the ink (theme-aware on screen), a classic one in the muted grey", () => {
    expect(edgeColorOnCanvas({})).toBe("var(--nd-color-edge)");
    expect(edgeColorLiteral({})).toBe("#1e2733");
    expect(edgeColorOnCanvas({ look: "classic" })).toBe("var(--nd-color-muted)");
    expect(edgeColorLiteral({ look: "classic" })).toBe("#66707D");
    expect(edgeColorOnCanvas({ stroke: "#ff0000" })).toBe("#ff0000");
  });

  it("ends a new connection in an open chevron, and writes new work as v5", () => {
    const s = useDocStore.getState();
    s.loadDoc(createEmptyDoc());
    const a = s.addShapeNode("general/rect", { x: 0, y: 0 }, { w: 100, h: 60 });
    const b = useDocStore.getState().addShapeNode("general/rect", { x: 200, y: 0 }, { w: 100, h: 60 });
    const edge = useDocStore.getState().connect({ sourceNodeId: a, sourceHandleId: "right", targetNodeId: b, targetHandleId: "left" });
    const doc = useDocStore.getState().doc;
    expect(doc.diagrams[doc.rootDiagramIds[0]].edges.find((e) => e.id === edge)!.style.endArrow).toBe("open");
    expect(isClassicLook(doc.diagrams[doc.rootDiagramIds[0]].nodes[0].style)).toBe(false);
    expect(writtenVersion(doc)).toBe(5);
    // Read back, new work stays new: v5 is not migrated to classic.
    const back = decodeDoc(encodeDoc(doc));
    expect(back.ok && hasOwnLook(back.doc)).toBe(true);
  });
});

describe("templates (rule 3: unchanged)", () => {
  it("draw every shape and edge in the classic look", async () => {
    const templates = await loadAllTemplates();
    expect(templates.length).toBeGreaterThan(30);
    for (const t of templates) expect(hasOwnLook(t.doc), t.id).toBe(false);
  });

  it("keep it once applied to a diagram", async () => {
    const [template] = await loadAllTemplates();
    const s = useDocStore.getState();
    s.loadDoc(createEmptyDoc());
    s.applyTemplate(template.doc, "into-current");
    expect(hasOwnLook(useDocStore.getState().doc)).toBe(false);
  });
});

describe("stampClassicLook", () => {
  it("marks shapes and edges, not groups or Nested Blocks, and is idempotent", () => {
    const s = useDocStore.getState();
    s.loadDoc(createEmptyDoc());
    s.addShapeNode("general/rect", { x: 0, y: 0 }, { w: 100, h: 60 });
    useDocStore.getState().addNestedNode({ x: 200, y: 0 }, { w: 160, h: 100 });
    const stamped = stampClassicLook(useDocStore.getState().doc);
    const nodes = stamped.diagrams[stamped.rootDiagramIds[0]].nodes;
    expect(nodes.find((n) => n.type === "shape")!.style.look).toBe("classic");
    expect(nodes.find((n) => n.type === "nested")!.style.look).toBeUndefined();
    expect(stampClassicLook(stamped)).toEqual(stamped);
  });
});
