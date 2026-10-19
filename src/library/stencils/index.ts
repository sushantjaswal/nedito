// Section order: the order the sections were added; the sidebar groups them by purpose
// (libraryGroups.ts). Every section has a loader — loadSection no longer resolves to null for any known id.
import type { StencilDef, StencilSection } from "./types";

export const SECTION_IDS = [
  "scratchpad",
  "general",
  "misc",
  "animated",
  "ai",
  "advanced",
  "basic",
  "arrows",
  "lines",
  "flowchart",
  "bpmn",
  "uml",
  "c4",
  "entity-relation",
  "dfd",
  "network",
  "azure",
  "aws",
  "gcp",
  "business",
] as const;

export type SectionId = (typeof SECTION_IDS)[number];

const LOADERS: Partial<Record<SectionId, () => Promise<{ default: StencilSection }>>> = {
  general: () => import("./general"),
  misc: () => import("./misc"),
  animated: () => import("./animated"),
  ai: () => import("./ai"),
  advanced: () => import("./advanced"),
  basic: () => import("./basic"),
  arrows: () => import("./arrows"),
  lines: () => import("./lines"),
  flowchart: () => import("./flowchart"),
  bpmn: () => import("./bpmn"),
  uml: () => import("./uml"),
  c4: () => import("./c4"),
  "entity-relation": () => import("./entity-relation"),
  dfd: () => import("./dfd"),
  network: () => import("./network"),
  azure: () => import("./azure"),
  aws: () => import("./aws"),
  gcp: () => import("./gcp"),
  business: () => import("./business"),
};

export async function loadSection(id: SectionId): Promise<StencilSection | null> {
  const loader = LOADERS[id];
  if (!loader) return null;
  const mod = await loader();
  return mod.default;
}

// "scratchpad" stays the internal id (store field, storage keys, CSS module names all still
// key off it) — only the user-visible label changes to "Favorites".
const ACRONYMS: Partial<Record<SectionId, string>> = {
  aws: "AWS",
  gcp: "GCP",
  uml: "UML",
  bpmn: "BPMN",
  dfd: "Data Flow (DFD)",
  scratchpad: "Favorites",
  ai: "AI & Agents",
};

export function sectionLabel(id: SectionId): string {
  if (ACRONYMS[id]) return ACRONYMS[id];
  return id
    .split("-")
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(" ");
}

/**
 * Stencils withdrawn from the picker, mapped to the one that replaced them. Every entry here
 * was a byte-identical duplicate of its target: the same Material Symbols glyph shipped twice
 * under two of Google's own icon names (see the "no two shapes in a section draw the same
 * glyph" test in index.test.ts, which is what found them).
 *
 * They are aliased rather than simply deleted because a shapeRef that no longer resolves does
 * not fail loudly — canvas/ShapeNode.tsx falls back to a plain white box, so a saved diagram
 * would quietly lose the picture with no error anywhere. Any future retirement belongs here
 * too, for the same reason.
 */
export const RETIRED_STENCIL_IDS: Record<string, string> = {
  // The AI and agent icons, first shipped inside Animated with their still twins in Misc, now in
  // a section of their own. Ids moved with them; these keep every diagram drawn in between whole.
  "animated/inference": "ai/inference",
  "animated/token-stream": "ai/token-stream",
  "animated/embedding": "ai/embedding",
  "animated/vector-search": "ai/vector-search",
  "animated/retrieval": "ai/retrieval",
  "animated/agent-thinking": "ai/agent-thinking",
  "animated/tool-call": "ai/tool-call",
  "animated/guardrail": "ai/guardrail",
  "animated/human-in-the-loop": "ai/human-in-the-loop",
  "misc/model": "ai/model",
  "misc/tokens": "ai/tokens",
  "misc/embedding": "ai/vector",
  "misc/vector-search": "ai/similarity",
  "misc/retrieval": "ai/context",
  "misc/agent": "ai/agent",
  "misc/tool-call": "ai/tool",
  "misc/guardrail": "ai/blocked",
  "misc/approval": "ai/approval",
  "misc/grade": "misc/star",
  "misc/new-releases": "misc/verified",
  "arrows/call-made": "arrows/north-east",
  "network/backup": "network/cloud-upload",
  // The flowchart symbols that lived in Advanced, now with the rest of ISO 5807 (D84).
  "advanced/manual-operation": "flowchart/manual-operation",
  "advanced/delay": "flowchart/delay",
  "advanced/display": "flowchart/display",
  "advanced/off-page-connector": "flowchart/off-page-connector",
  "advanced/on-page-connector": "flowchart/on-page-connector",
  "advanced/stored-data": "flowchart/stored-data",
  "advanced/sort": "flowchart/sort",
  "advanced/collate": "flowchart/collate",
  "advanced/merge": "flowchart/merge",
  "advanced/extract": "flowchart/extract",
  "advanced/summing-junction": "flowchart/summing-junction",
  "advanced/loop-limit": "flowchart/loop-limit",
  "advanced/parallel-mode": "flowchart/parallel-mode",
  "advanced/manual-input": "flowchart/manual-input",
  "advanced/preparation": "flowchart/preparation",
  // Lines have a section of their own (D85).
  "advanced/line-horizontal": "lines/line",
  "advanced/line-vertical": "lines/line-vertical",
};

const stencilCache = new Map<string, StencilDef>();

// The cache is filled asynchronously — ShapeLibrary loads every section when it mounts — but it
// used to be read synchronously and never announced anything. A node rendered before its section
// arrived therefore stayed blank for the whole session: the Azure section was in the cache within
// a second or so, and a node drawn in that second never showed its icon, while an export made a
// moment later drew it perfectly. So filling the cache now bumps a
// revision that components can subscribe to, via useStencil / useStencilCacheRevision.
let cacheRevision = 0;
const cacheListeners = new Set<() => void>();

export function cacheStencils(shapes: StencilDef[]): void {
  for (const s of shapes) stencilCache.set(s.id, s);
  cacheRevision += 1;
  for (const listener of cacheListeners) listener();
}

/** For useSyncExternalStore: call `onChange` whenever more stencils land in the cache. */
export function subscribeStencilCache(onChange: () => void): () => void {
  cacheListeners.add(onChange);
  return () => cacheListeners.delete(onChange);
}

/** Changes every time the cache grows. */
export function stencilCacheRevision(): number {
  return cacheRevision;
}

/** The id a shape is drawn from: itself, or what a retired id now points at. */
export function resolveStencilId(id: string): string {
  return RETIRED_STENCIL_IDS[id] ?? id;
}

/** The shapes a section offers in the picker: everything but the hidden ones. */
export function pickerShapes(section: StencilSection): StencilDef[] {
  return section.shapes.filter((s) => !s.hidden);
}

export function getStencil(id: string): StencilDef | undefined {
  const direct = stencilCache.get(id);
  if (direct) return direct;
  const replacement = RETIRED_STENCIL_IDS[id];
  return replacement ? stencilCache.get(replacement) : undefined;
}

export function listCachedStencils(): StencilDef[] {
  return Array.from(stencilCache.values());
}
