import { describe, expect, it } from "vitest";
import { applyTemplate, instantiate, uniquePageTitle } from "./applyTemplate";
import { loadTemplate } from "./registry";
import { validateDoc } from "../model/validate";
import { createEmptyDoc } from "../model/store";
import type { DiagramDocument, NestedNode } from "../model/types";

/** Deterministic ids, so a test can say exactly which ones changed. */
function counter() {
  let n = 0;
  return () => `new${++n}`;
}

async function nestedTemplate(): Promise<DiagramDocument> {
  return (await loadTemplate("flowchart-with-subprocess"))!.doc;
}

async function flatTemplate(): Promise<DiagramDocument> {
  return (await loadTemplate("basic-flowchart"))!.doc;
}

describe("instantiate", () => {
  it("re-issues every id, so applying twice can never collide", async () => {
    const template = await nestedTemplate();
    const a = instantiate(template);
    const b = instantiate(template);

    const idsOf = (r: ReturnType<typeof instantiate>) => [
      r.page.id,
      ...Object.keys(r.children),
      ...r.page.nodes.map((n) => n.id),
      ...r.page.edges.map((e) => e.id),
    ];
    const overlap = idsOf(a).filter((id) => idsOf(b).includes(id));
    expect(overlap).toEqual([]);
  });

  it("never mutates the template module, which is shared and cached", async () => {
    const template = await nestedTemplate();
    const before = JSON.stringify(template);
    instantiate(template);
    instantiate(template);
    expect(JSON.stringify(template)).toBe(before);
  });

  it("rewires a nested node at its new child diagram", async () => {
    const { page, children } = instantiate(await nestedTemplate(), counter());
    const nested = page.nodes.find((n): n is NestedNode => n.type === "nested")!;
    expect(children[nested.childDiagramId]).toBeDefined();
  });

  it("rewires ports to the copies of the nodes they map to", async () => {
    const { page, children } = instantiate(await nestedTemplate(), counter());
    const nested = page.nodes.find((n): n is NestedNode => n.type === "nested")!;
    const child = children[nested.childDiagramId];

    expect(nested.ports.length).toBeGreaterThan(0);
    for (const port of nested.ports) {
      expect(child.nodes.some((n) => n.id === port.innerNodeId)).toBe(true);
    }
  });

  it("rewires edges, including the ones that cross a nesting boundary", async () => {
    const { page } = instantiate(await nestedTemplate(), counter());
    const nodeIds = new Set(page.nodes.map((n) => n.id));
    const nested = page.nodes.find((n): n is NestedNode => n.type === "nested")!;
    const portIds = new Set(nested.ports.map((p) => p.id));

    const crossing = page.edges.filter((e) => e.source.portId || e.target.portId);
    expect(crossing.length).toBeGreaterThan(0);

    for (const edge of page.edges) {
      expect(nodeIds.has(edge.source.nodeId!)).toBe(true);
      expect(nodeIds.has(edge.target.nodeId!)).toBe(true);
      if (edge.source.portId) expect(portIds.has(edge.source.portId)).toBe(true);
      if (edge.target.portId) expect(portIds.has(edge.target.portId)).toBe(true);
    }
  });

  it("gives each copied diagram its own fresh layers", async () => {
    const { page } = instantiate(await flatTemplate(), counter());
    expect(page.layers?.length).toBeGreaterThan(0);
    for (const node of page.nodes) expect(node.layerId).toBeUndefined();
  });
});

describe("applyTemplate", () => {
  it("fills an empty page in place, without adding one", async () => {
    const doc = createEmptyDoc();
    const pageId = doc.rootDiagramIds[0];
    const { doc: next, pageId: landed } = applyTemplate(doc, await flatTemplate(), "into-current", pageId, counter());

    expect(next.rootDiagramIds).toEqual([pageId]);
    expect(landed).toBe(pageId);
    expect(next.diagrams[pageId].nodes.length).toBeGreaterThan(0);
    expect(validateDoc(next)).toEqual([]);
  });

  it("adds a new page directly after the current one", async () => {
    let doc = createEmptyDoc();
    const first = doc.rootDiagramIds[0];
    doc = applyTemplate(doc, await flatTemplate(), "new-page", first, counter()).doc;
    const { doc: next, pageId } = applyTemplate(doc, await flatTemplate(), "new-page", first, counter());

    expect(next.rootDiagramIds).toHaveLength(3);
    expect(next.rootDiagramIds[1]).toBe(pageId);
    expect(validateDoc(next)).toEqual([]);
  });

  it("brings the child diagrams along as one document", async () => {
    const doc = createEmptyDoc();
    const { doc: next } = applyTemplate(doc, await nestedTemplate(), "new-page", doc.rootDiagramIds[0], counter());

    expect(Object.keys(next.diagrams).length).toBe(3); // the empty page, the template page, its child
    expect(validateDoc(next)).toEqual([]);
  });

  // "Replace" must not leave the old page's child diagrams behind as invisible orphans.
  it("replacing a page drops the child diagrams that page owned", async () => {
    const empty = createEmptyDoc();
    const pageId = empty.rootDiagramIds[0];
    const withNesting = applyTemplate(empty, await nestedTemplate(), "into-current", pageId, counter()).doc;
    expect(Object.keys(withNesting.diagrams)).toHaveLength(2);

    const replaced = applyTemplate(withNesting, await flatTemplate(), "replace-page", pageId, counter()).doc;
    expect(Object.keys(replaced.diagrams)).toHaveLength(1);
    expect(validateDoc(replaced)).toEqual([]);
  });

  it("names the page after the template", async () => {
    const doc = createEmptyDoc();
    const { doc: next, pageId } = applyTemplate(doc, await flatTemplate(), "new-page", doc.rootDiagramIds[0], counter());
    expect(next.diagrams[pageId].title).toBe("Flowchart");
  });

  it("de-duplicates that name when the page already exists", async () => {
    let doc = createEmptyDoc();
    const first = doc.rootDiagramIds[0];
    doc = applyTemplate(doc, await flatTemplate(), "new-page", first, counter()).doc;
    const { doc: next, pageId } = applyTemplate(doc, await flatTemplate(), "new-page", first, counter());
    expect(next.diagrams[pageId].title).toBe("Flowchart 2");
  });

  it("produces a new document rather than mutating the old one", async () => {
    const doc = createEmptyDoc();
    const before = JSON.stringify(doc);
    applyTemplate(doc, await flatTemplate(), "new-page", doc.rootDiagramIds[0], counter());
    expect(JSON.stringify(doc)).toBe(before);
  });
});

describe("uniquePageTitle", () => {
  it("leaves a free name alone", () => {
    expect(uniquePageTitle(createEmptyDoc(), "Flowchart")).toBe("Flowchart");
  });

  it("counts up past every taken name", () => {
    const doc = createEmptyDoc();
    const a = doc.rootDiagramIds[0];
    doc.diagrams[a].title = "Flowchart";
    doc.diagrams["b"] = { id: "b", title: "Flowchart 2", nodes: [], edges: [] };
    doc.rootDiagramIds.push("b");
    expect(uniquePageTitle(doc, "Flowchart")).toBe("Flowchart 3");
  });
});

// D79: a picture travels with a template like everything else, and like everything else its id
// is re-issued, so applying the template twice never shares an asset between the copies.
describe("templates with pictures", () => {
  const PNG_1PX = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==";
  const withPicture: DiagramDocument = {
    formatVersion: 3,
    meta: { title: "Logo card", created: "", modified: "", appVersion: "0.0.1" },
    rootDiagramIds: ["tplPage"],
    diagrams: {
      tplPage: {
        id: "tplPage",
        title: "Logo card",
        nodes: [
          { id: "tplLogo", type: "shape", shapeRef: "image", imageId: "tplAsset", position: { x: 0, y: 0 }, size: { w: 40, h: 40 }, z: 1, style: {} },
          { id: "tplLogo2", type: "shape", shapeRef: "image", imageId: "tplAsset", position: { x: 60, y: 0 }, size: { w: 40, h: 40 }, z: 2, style: {} },
        ],
        edges: [],
      },
    },
    assets: { tplAsset: { mime: "image/png", data: PNG_1PX, width: 1, height: 1 } },
  };

  it("carries the picture with a new id, stored once, and leaves a valid document", () => {
    const start = createEmptyDoc();
    const { doc } = applyTemplate(start, withPicture, "new-page", start.rootDiagramIds[0]);
    const ids = Object.keys(doc.assets ?? {});
    expect(ids).toHaveLength(1);
    expect(ids[0]).not.toBe("tplAsset");
    expect(validateDoc(doc)).toEqual([]);
  });

  it("gives each application its own copy", () => {
    const start = createEmptyDoc();
    const once = applyTemplate(start, withPicture, "new-page", start.rootDiagramIds[0]).doc;
    const twice = applyTemplate(once, withPicture, "into-current", once.rootDiagramIds[0]).doc;
    expect(Object.keys(twice.assets ?? {})).toHaveLength(2);
    expect(validateDoc(twice)).toEqual([]);
  });
});
