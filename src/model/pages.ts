// Pure doc-transform functions for multi-page documents. "Pages are siblings; nesting is
// orthogonal to pages" (CLAUDE.md) — a page is just a rootDiagramIds entry. Deleting one
// cascades through its nested-diagram subtree the same way deleting a nested node does.
import { nanoid } from "nanoid";
import { createDefaultLayers } from "./layers";
import { collectDescendantDiagramIds } from "./nesting";
import type { DiagramDocument, Diagram } from "./types";

export interface AddPageResult {
  doc: DiagramDocument;
  pageId: string;
}

export function addPage(doc: DiagramDocument, title: string): AddPageResult {
  const pageId = nanoid();
  const diagram: Diagram = { id: pageId, title, nodes: [], edges: [], layers: createDefaultLayers() };
  const next: DiagramDocument = {
    ...doc,
    meta: { ...doc.meta, modified: new Date().toISOString() },
    rootDiagramIds: [...doc.rootDiagramIds, pageId],
    diagrams: { ...doc.diagrams, [pageId]: diagram },
  };
  return { doc: next, pageId };
}

// No-op if this is the last page — a document always has at least one.
export function removePage(doc: DiagramDocument, pageId: string): DiagramDocument {
  if (doc.rootDiagramIds.length <= 1 || !doc.rootDiagramIds.includes(pageId)) return doc;

  const idsToDelete = new Set([pageId, ...collectDescendantDiagramIds(doc, pageId)]);
  const remainingDiagrams = { ...doc.diagrams };
  for (const id of idsToDelete) delete remainingDiagrams[id];

  return {
    ...doc,
    meta: { ...doc.meta, modified: new Date().toISOString() },
    rootDiagramIds: doc.rootDiagramIds.filter((id) => id !== pageId),
    diagrams: remainingDiagrams,
  };
}

export function reorderPages(doc: DiagramDocument, fromIndex: number, toIndex: number): DiagramDocument {
  const { length } = doc.rootDiagramIds;
  if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0 || fromIndex >= length || toIndex >= length) {
    return doc;
  }
  const ids = [...doc.rootDiagramIds];
  const [moved] = ids.splice(fromIndex, 1);
  ids.splice(toIndex, 0, moved);
  return { ...doc, rootDiagramIds: ids };
}
