import { describe, expect, it } from "vitest";
import { addNode } from "./actions";
import { addNestedNode } from "./nesting";
import { addPage, removePage, reorderPages } from "./pages";
import type { DiagramDocument, ShapeNode } from "./types";

function emptyDoc(diagramId = "root"): DiagramDocument {
  return {
    formatVersion: 1,
    meta: { title: "Untitled", created: "2026-08-05", modified: "2026-08-05", appVersion: "0.0.1" },
    rootDiagramIds: [diagramId],
    diagrams: { [diagramId]: { id: diagramId, title: "Page 1", nodes: [], edges: [] } },
  };
}

function shape(id: string): Omit<ShapeNode, "z"> {
  return { id, type: "shape", shapeRef: "general/rect", position: { x: 0, y: 0 }, size: { w: 100, h: 60 }, style: {} };
}

describe("addPage", () => {
  it("appends a new empty page to rootDiagramIds", () => {
    const doc = emptyDoc();
    const { doc: next, pageId } = addPage(doc, "Page 2");
    expect(next.rootDiagramIds).toEqual(["root", pageId]);
    const created = next.diagrams[pageId];
    expect(created.id).toBe(pageId);
    expect(created.title).toBe("Page 2");
    expect(created.nodes).toEqual([]);
    expect(created.edges).toEqual([]);
    expect(created.layers).toEqual([{ id: expect.any(String), name: "Layer 1", visible: true, locked: false }]);
  });
});

describe("removePage", () => {
  it("removes the page and its diagram", () => {
    let doc = emptyDoc();
    const { doc: withPage2, pageId } = addPage(doc, "Page 2");
    doc = withPage2;
    const next = removePage(doc, pageId);
    expect(next.rootDiagramIds).toEqual(["root"]);
    expect(next.diagrams[pageId]).toBeUndefined();
  });

  it("cascades through a nested-diagram subtree on the deleted page", () => {
    let doc = emptyDoc();
    const { doc: withPage2, pageId } = addPage(doc, "Page 2");
    doc = withPage2;
    const nested = addNestedNode(doc, pageId, { x: 0, y: 0 }, { w: 200, h: 140 });
    doc = nested.doc;

    const next = removePage(doc, pageId);
    expect(next.diagrams[pageId]).toBeUndefined();
    expect(next.diagrams[nested.childDiagramId]).toBeUndefined();
  });

  it("refuses to remove the last remaining page", () => {
    const doc = emptyDoc();
    const next = removePage(doc, "root");
    expect(next).toBe(doc);
    expect(next.rootDiagramIds).toEqual(["root"]);
  });

  it("is a no-op for an unknown page id", () => {
    const doc = emptyDoc();
    expect(removePage(doc, "ghost")).toBe(doc);
  });

  it("leaves an unrelated page's content untouched", () => {
    let doc = emptyDoc();
    doc = addNode(doc, "root", shape("a"));
    const { doc: withPage2, pageId } = addPage(doc, "Page 2");
    doc = withPage2;
    const next = removePage(doc, pageId);
    expect(next.diagrams.root.nodes.map((n) => n.id)).toEqual(["a"]);
  });
});

describe("reorderPages", () => {
  it("moves a page from one index to another", () => {
    let doc = emptyDoc();
    doc = addPage(doc, "Page 2").doc;
    doc = addPage(doc, "Page 3").doc;
    const [p1, p2, p3] = doc.rootDiagramIds;

    const next = reorderPages(doc, 0, 2);
    expect(next.rootDiagramIds).toEqual([p2, p3, p1]);
  });

  it("is a no-op for an out-of-range index", () => {
    const doc = emptyDoc();
    expect(reorderPages(doc, 0, 5)).toBe(doc);
  });

  it("is a no-op when from and to are the same", () => {
    let doc = emptyDoc();
    doc = addPage(doc, "Page 2").doc;
    expect(reorderPages(doc, 0, 0)).toBe(doc);
  });
});
