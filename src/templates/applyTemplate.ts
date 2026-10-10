// Grafting a template into the document the user already has.
//
// The whole job is one rule: nothing from the template may keep its ids. A template is applied
// repeatedly, sometimes into a document that already holds a copy of itself, so reusing ids
// would collide nodes, edges, ports and whole child diagrams — and the collision would look
// like data corruption rather than a bug. Every id is re-issued, and every reference is
// rewritten through the same map.
import { nanoid } from "nanoid";
import { isImageNode } from "../model/assets";
import { createDefaultLayers } from "../model/layers";
import type { DiagramDocument, DEdge, DNode, Diagram, ImageAsset } from "../model/types";

export type ApplyMode =
  /** The active page is empty: fill it in place, no dialog, no new page. */
  | "into-current"
  /** Add the template as a new page after the current one. */
  | "new-page"
  /** Overwrite the active page's contents, keeping its position in the page list. */
  | "replace-page";

/** Every diagram a template's first page can reach, following nested nodes down. */
function reachable(doc: DiagramDocument, rootId: string): string[] {
  const seen = new Set<string>();
  const queue = [rootId];
  while (queue.length > 0) {
    const id = queue.shift()!;
    if (seen.has(id)) continue;
    seen.add(id);
    for (const node of doc.diagrams[id]?.nodes ?? []) {
      if (node.type === "nested") queue.push(node.childDiagramId);
    }
  }
  return [...seen];
}

export interface Instantiated {
  /** The template's page, with fresh ids throughout. */
  page: Diagram;
  /** Its child diagrams, keyed by their new ids. */
  children: Record<string, Diagram>;
  /** The pictures its image nodes show, keyed by their new ids (D79); empty when there are none. */
  assets: Record<string, ImageAsset>;
}

/**
 * Copies a template with every id re-issued. Pure: the template module is a shared, cached
 * object, so mutating it would poison the second application.
 */
export function instantiate(template: DiagramDocument, newId: () => string = nanoid): Instantiated {
  const rootId = template.rootDiagramIds[0];
  const diagramIds = reachable(template, rootId);

  // Built up front so a node can rewrite its childDiagramId before that child is visited.
  const idMap = new Map<string, string>();
  for (const id of diagramIds) idMap.set(id, newId());
  for (const id of diagramIds) {
    for (const node of template.diagrams[id].nodes) {
      idMap.set(node.id, newId());
      if (node.type === "nested") for (const port of node.ports) idMap.set(port.id, newId());
    }
    for (const edge of template.diagrams[id].edges) idMap.set(edge.id, newId());
  }
  // Pictures are re-issued like everything else, once each however many nodes show them, so a
  // template applied twice never shares an asset id with its first copy.
  const assets: Record<string, ImageAsset> = {};
  for (const id of diagramIds) {
    for (const node of template.diagrams[id].nodes) {
      if (!isImageNode(node) || idMap.has(node.imageId)) continue;
      const asset = template.assets?.[node.imageId];
      if (!asset) continue;
      const assetId = newId();
      idMap.set(node.imageId, assetId);
      assets[assetId] = asset;
    }
  }
  const remap = (id: string): string => idMap.get(id) ?? id;

  const copyNode = (node: DNode): DNode => {
    const base = { ...node, id: remap(node.id) };
    // Layers are re-created per diagram below, so a template's layer ids never travel.
    delete (base as { layerId?: string }).layerId;
    if (base.type === "group") return { ...base, childIds: base.childIds.map(remap) };
    if (base.type === "nested") {
      return {
        ...base,
        childDiagramId: remap(base.childDiagramId),
        ports: base.ports.map((p) => ({
          ...p,
          id: remap(p.id),
          ...(p.innerNodeId ? { innerNodeId: remap(p.innerNodeId) } : {}),
        })),
      };
    }
    if (isImageNode(base)) return { ...base, imageId: remap(base.imageId) };
    return base;
  };

  const copyEdge = (edge: DEdge): DEdge => {
    const next: DEdge = {
      ...edge,
      id: remap(edge.id),
      source: { ...edge.source },
      target: { ...edge.target },
    };
    // A free end has no node to re-issue; its point comes across as it is.
    if (edge.source.nodeId) next.source.nodeId = remap(edge.source.nodeId);
    if (edge.target.nodeId) next.target.nodeId = remap(edge.target.nodeId);
    if (edge.source.portId) next.source.portId = remap(edge.source.portId);
    if (edge.target.portId) next.target.portId = remap(edge.target.portId);
    delete (next as { layerId?: string }).layerId;
    return next;
  };

  const copyDiagram = (id: string): Diagram => {
    const source = template.diagrams[id];
    return {
      ...source,
      id: remap(id),
      nodes: source.nodes.map(copyNode),
      edges: source.edges.map(copyEdge),
      layers: createDefaultLayers(),
    };
  };

  const page = copyDiagram(rootId);
  const children: Record<string, Diagram> = {};
  for (const id of diagramIds) {
    if (id === rootId) continue;
    const copy = copyDiagram(id);
    children[copy.id] = copy;
  }
  return { page, children, assets };
}

/** Page titles are de-duplicated with a numeric suffix, as the spec asks. */
export function uniquePageTitle(doc: DiagramDocument, wanted: string): string {
  const taken = new Set(doc.rootDiagramIds.map((id) => doc.diagrams[id]?.title));
  if (!taken.has(wanted)) return wanted;
  for (let n = 2; ; n += 1) {
    const candidate = `${wanted} ${n}`;
    if (!taken.has(candidate)) return candidate;
  }
}

export interface ApplyResult {
  doc: DiagramDocument;
  /** The page the template landed on, so the caller can navigate to it. */
  pageId: string;
}

/**
 * Applies a template. One pure transformation producing one new document, which is what makes
 * it a single undo entry — including the child diagrams it creates, since they arrive in the
 * same `doc` replacement rather than through separate actions.
 */
export function applyTemplate(
  doc: DiagramDocument,
  template: DiagramDocument,
  mode: ApplyMode,
  currentPageId: string,
  newId: () => string = nanoid,
): ApplyResult {
  const { page, children, assets } = instantiate(template, newId);
  const withAssets = Object.keys(assets).length ? { assets: { ...doc.assets, ...assets } } : {};
  const title = template.diagrams[template.rootDiagramIds[0]].title;
  const modified = new Date().toISOString();

  if (mode === "new-page") {
    const pageId = page.id;
    const named: Diagram = { ...page, title: uniquePageTitle(doc, title) };
    const index = doc.rootDiagramIds.indexOf(currentPageId);
    const roots = [...doc.rootDiagramIds];
    roots.splice(index === -1 ? roots.length : index + 1, 0, pageId);
    return {
      doc: {
        ...doc,
        meta: { ...doc.meta, modified },
        rootDiagramIds: roots,
        diagrams: { ...doc.diagrams, ...children, [pageId]: named },
        ...withAssets,
      },
      pageId,
    };
  }

  // "into-current" and "replace-page" are the same transformation — the template's content
  // takes over the active page. They differ only in what the user was told, and in whether the
  // page was empty to begin with.
  const existing = doc.diagrams[currentPageId];
  const merged: Diagram = {
    ...page,
    id: currentPageId,
    // An empty page has no title worth keeping; one being replaced does not either, since the
    // page is now the template.
    title: uniquePageTitleExcluding(doc, title, currentPageId),
    layers: existing?.layers ?? createDefaultLayers(),
  };

  // Child diagrams the old page owned are now unreachable; dropping them keeps "replace" from
  // leaving an invisible pile of orphans behind on every apply.
  const orphans = existing ? reachable(doc, currentPageId).filter((id) => id !== currentPageId) : [];
  const diagrams = { ...doc.diagrams };
  for (const id of orphans) delete diagrams[id];

  return {
    doc: {
      ...doc,
      meta: { ...doc.meta, modified },
      diagrams: { ...diagrams, ...children, [currentPageId]: merged },
      ...withAssets,
    },
    pageId: currentPageId,
  };
}

function uniquePageTitleExcluding(doc: DiagramDocument, wanted: string, exceptPageId: string): string {
  const taken = new Set(
    doc.rootDiagramIds.filter((id) => id !== exceptPageId).map((id) => doc.diagrams[id]?.title),
  );
  if (!taken.has(wanted)) return wanted;
  for (let n = 2; ; n += 1) {
    const candidate = `${wanted} ${n}`;
    if (!taken.has(candidate)) return candidate;
  }
}
