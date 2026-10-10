import { describe, expect, it } from "vitest";
import {
  cacheStencils,
  getStencil,
  loadSection,
  pickerShapes,
  resolveStencilId,
  RETIRED_STENCIL_IDS,
  SECTION_IDS,
  sectionLabel,
  type SectionId,
} from "./index";

describe("sectionLabel", () => {
  it("title-cases hyphenated ids", () => {
    expect(sectionLabel("entity-relation")).toBe("Entity Relation");
    expect(sectionLabel("flowchart")).toBe("Flowchart");
  });

  it("special-cases known acronyms", () => {
    expect(sectionLabel("aws")).toBe("AWS");
    expect(sectionLabel("gcp")).toBe("GCP");
    expect(sectionLabel("uml")).toBe("UML");
    expect(sectionLabel("bpmn")).toBe("BPMN");
    expect(sectionLabel("dfd")).toBe("Data Flow (DFD)");
  });
});

describe("loadSection", () => {
  const CONTENT_SECTIONS = [
    "general",
    "misc",
    "advanced",
    "basic",
    "arrows",
    "flowchart",
    "uml",
    "entity-relation",
    "network",
    "azure",
    "aws",
    "gcp",
    "business",
  ] as const;

  it("resolves every content section with shapes", async () => {
    for (const id of CONTENT_SECTIONS) {
      const section = await loadSection(id);
      expect(section, `${id} should load`).not.toBeNull();
      expect(section!.shapes.length).toBeGreaterThan(0);
    }
  });

  it("every section ships no duplicate stencil ids and every shape has a non-empty label", async () => {
    for (const id of CONTENT_SECTIONS) {
      const section = await loadSection(id);
      const ids = section!.shapes.map((s) => s.id);
      expect(new Set(ids).size, `${id} has duplicate ids`).toBe(ids.length);
      for (const shape of section!.shapes) {
        expect(shape.label.length).toBeGreaterThan(0);
      }
    }
  });

  it("Azure/AWS/GCP ship real vendor icons, not the old placeholder cards", async () => {
    const minCount: Record<string, number> = { azure: 700, aws: 300, gcp: 40 };
    for (const id of ["azure", "aws", "gcp"] as const) {
      const section = await loadSection(id);
      expect(section!.shapes.length).toBeGreaterThanOrEqual(minCount[id]);
      for (const shape of section!.shapes.slice(0, 20)) {
        expect(shape.raw, `${id}/${shape.id} should have raw vendor markup`).toBeTruthy();
        expect(shape.raw).toContain("<svg");
      }
    }
  });

  it("resolves scratchpad (handled specially by ShapeLibrary, not via a stencil loader) to null", async () => {
    expect(await loadSection("scratchpad")).toBeNull();
  });
});

// Slice 4 of the icon library sweep. Every pictogram in Misc/Arrows/
// Network/Business was originally labelled with Google's internal Material Symbols id,
// title-cased. Most of those read fine; a handful did not describe the drawing at all, and
// four sections shipped the same glyph twice under two different Google names. These tests
// pin down the cleanup so neither class of defect creeps back in with the next icon import.
describe("stencil labels and glyphs", () => {
  const PICTOGRAM_SECTIONS = ["misc", "arrows", "network", "business"] as const;

  it("ships no two shapes in a section that draw the identical glyph", async () => {
    for (const id of PICTOGRAM_SECTIONS) {
      const section = await loadSection(id);
      const byPath = new Map<string, string>();
      for (const shape of section!.shapes) {
        const path = shape.svgBody.match(/<path d="([^"]+)"/)?.[1];
        if (!path) continue;
        const twin = byPath.get(path);
        expect(twin, `${shape.id} draws the same glyph as ${twin}`).toBeUndefined();
        byPath.set(path, shape.id);
      }
    }
  });

  it("gives every shape in a section a distinct label", async () => {
    for (const id of PICTOGRAM_SECTIONS) {
      const section = await loadSection(id);
      const labels = section!.shapes.map((s) => s.label);
      expect(new Set(labels).size, `${id} repeats a label`).toBe(labels.length);
    }
  });

  // The specific names that sent people looking for a shape they could not find: Google's
  // codenames for a cloud, a trophy, a flame and a star, plus two version-suffixed ids.
  it("never surfaces a Material Symbols codename as a user-facing label", async () => {
    const banned = [
      "filter drama",
      "emoji events",
      "local fire department",
      "corporate fare",
      "volunteer activism",
      "real estate agent",
      "inventory 2",
      "diversity 3",
      "settings ethernet",
    ];
    for (const id of PICTOGRAM_SECTIONS) {
      const section = await loadSection(id);
      for (const shape of section!.shapes) {
        expect(banned, `${shape.id} still reads as a Material Symbols id`).not.toContain(
          shape.label.toLowerCase(),
        );
      }
    }
  });

  // Vendor product names in a shape label imply the shape *is* that product, which is not what
  // a generic device glyph means (and not a claim this project wants to make in its own UI).
  it("keeps vendor product names out of shape labels", async () => {
    const section = await loadSection("network");
    for (const shape of section!.shapes) {
      expect(shape.label.toLowerCase()).not.toMatch(/\b(iphone|ipad|mac|windows)\b/);
    }
  });

  it("resolves a retired stencil id to the shape that replaced it", async () => {
    const misc = await loadSection("misc");
    cacheStencils(misc!.shapes);
    // A saved diagram still referencing the withdrawn duplicate must keep its picture: an
    // unresolved shapeRef renders as a blank white box, silently, with no error anywhere.
    expect(getStencil("misc/grade")).toBeDefined();
    expect(getStencil("misc/grade")).toBe(getStencil("misc/star"));
    expect(getStencil("misc/not-a-real-shape")).toBeUndefined();
  });
});

describe("library regrouping (D84)", () => {
  async function cacheAll() {
    for (const id of SECTION_IDS.filter((s): s is SectionId => s !== "scratchpad")) {
      const section = await loadSection(id);
      if (section) cacheStencils(section.shapes);
    }
  }

  it("points every retired id at a shape that exists and is offered in the picker", async () => {
    await cacheAll();
    for (const [old, replacement] of Object.entries(RETIRED_STENCIL_IDS)) {
      const stencil = getStencil(old);
      expect(stencil, `${old} -> ${replacement} resolves to nothing`).toBeDefined();
      expect(stencil!.hidden, `${old} -> ${replacement} is hidden`).toBeFalsy();
    }
  });

  // The flowchart symbols used to be split across two sections; a diagram saved with the old
  // advanced/* ids must keep drawing, and the shared viewer must load the section they live in now.
  it("keeps the flowchart symbols that moved out of Advanced drawing under their old ids", async () => {
    await cacheAll();
    expect(resolveStencilId("advanced/delay")).toBe("flowchart/delay");
    expect(getStencil("advanced/delay")).toBe(getStencil("flowchart/delay"));
    expect(getStencil("advanced/manual-input")).toBe(getStencil("flowchart/manual-input"));
    expect(resolveStencilId("flowchart/process")).toBe("flowchart/process");
  });

  it("leaves hidden shapes out of the picker but still draws them", async () => {
    const network = (await loadSection("network"))!;
    cacheStencils(network.shapes);
    const hidden = network.shapes.filter((s) => s.hidden);
    expect(hidden.length).toBeGreaterThan(0);
    for (const shape of hidden) {
      expect(pickerShapes(network)).not.toContain(shape);
      expect(getStencil(shape.id)).toBe(shape);
    }
  });

  it("offers no shape twice across Flowchart and Advanced", async () => {
    const flow = pickerShapes((await loadSection("flowchart"))!).map((s) => s.label);
    const adv = pickerShapes((await loadSection("advanced"))!).map((s) => s.label);
    expect(adv.filter((l) => flow.includes(l))).toEqual([]);
  });
});
