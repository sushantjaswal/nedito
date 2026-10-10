// Shared fixtures for the share-link tests. Built through the real model actions rather than
// hand-written literals so the documents always satisfy the invariants validateDoc enforces —
// a fixture that quietly went invalid would make these tests fail for the wrong reason.
import { addNode } from "../model/actions";
import { addNestedNode } from "../model/nesting";
import { addPage } from "../model/pages";
import { APP_VERSION } from "../app/version";
import { CURRENT_FORMAT_VERSION } from "../file/documentFormat";
import type { DiagramDocument, ShapeNode } from "../model/types";

export function emptyDoc(diagramId = "root"): DiagramDocument {
  return {
    formatVersion: CURRENT_FORMAT_VERSION,
    meta: {
      title: "Untitled",
      created: "2026-09-02T00:00:00.000Z",
      modified: "2026-09-02T00:00:00.000Z",
      appVersion: APP_VERSION,
    },
    rootDiagramIds: [diagramId],
    diagrams: { [diagramId]: { id: diagramId, title: "Page 1", nodes: [], edges: [] } },
  };
}

export function shape(id: string): Omit<ShapeNode, "z"> {
  return {
    id,
    type: "shape",
    shapeRef: "general/rect",
    position: { x: 10, y: 20 },
    size: { w: 100, h: 60 },
    style: { fill: "#ffffff" },
    label: { text: id },
  };
}

/** A flat diagram: shapes only, no nesting. */
export function docAtDepth0(): DiagramDocument {
  let doc = emptyDoc();
  doc = addNode(doc, "root", shape("a"));
  doc = addNode(doc, "root", shape("b"));
  return doc;
}

/** One level of nesting, with content on both sides of the boundary. */
export function docAtDepth1(): DiagramDocument {
  let doc = docAtDepth0();
  const nested = addNestedNode(doc, "root", { x: 300, y: 40 }, { w: 220, h: 140 }, "Payment Service");
  doc = addNode(nested.doc, nested.childDiagramId, shape("inner"));
  return doc;
}

/** Three levels deep, each with a shape alongside the nested box. */
export function docAtDepth3(): DiagramDocument {
  let doc = docAtDepth0();
  let parentId = "root";
  for (const title of ["Payment Service", "Fraud Engine", "Rules"]) {
    const nested = addNestedNode(doc, parentId, { x: 300, y: 40 }, { w: 220, h: 140 }, title);
    doc = addNode(nested.doc, nested.childDiagramId, shape(`${title}-shape`));
    parentId = nested.childDiagramId;
  }
  return doc;
}

/** Adds a second page that has never been drawn on. */
export function withBlankPage(doc: DiagramDocument): { doc: DiagramDocument; blankPageId: string } {
  const added = addPage(doc, "Page 2");
  return { doc: added.doc, blankPageId: added.pageId };
}
