// Makes sure a document's shapes can actually be drawn before it is put on screen.
//
// Stencil SVG bodies live in lazy-loaded section modules and reach the renderer through a
// module-level cache (library/stencils/index.ts). In the editor, ShapeLibrary fills that cache
// for every section when it mounts — so the cache is simply always warm and nothing else has
// ever had to think about it. The share viewer doesn't mount the library, and the result was
// shapes rendering as bare labels with no geometry at all.
//
// Loading all thirteen sections would fix it and undo the reason they are split up (thousands of
// stencils never go into the main bundle — Azure alone is 714 icons). So
// this loads only the sections the document actually refers to: a diagram of rectangles and
// flowchart symbols pulls two modules, not the whole library.
import { cacheStencils, loadSection, resolveStencilId, SECTION_IDS, type SectionId } from "../library/stencils";
import type { DiagramDocument } from "../model/types";

const KNOWN = new Set<string>(SECTION_IDS);

/** Stencil ids are "<section>/<name>", e.g. "general/rect", "azure/vm". */
function sectionOf(stencilRef: string): SectionId | null {
  // A retired id is drawn from its replacement, which may live in another section.
  const section = resolveStencilId(stencilRef).split("/")[0];
  return KNOWN.has(section) ? (section as SectionId) : null;
}

/** Every stencil section referenced anywhere in the document, across all nesting levels. */
export function sectionsUsedBy(doc: DiagramDocument): SectionId[] {
  const used = new Set<SectionId>();
  const add = (ref: string) => {
    const section = sectionOf(ref);
    if (section) used.add(section);
  };

  for (const diagram of Object.values(doc.diagrams)) {
    for (const node of diagram.nodes) {
      if (node.type === "shape") add(node.shapeRef);
      // A nested box can render an author-chosen icon row instead of the live miniature, and
      // those icons are stencils too.
      if (node.type === "nested") node.collapsed.icons.forEach(add);
    }
  }
  return [...used];
}

/**
 * Resolves once every stencil the document needs is in the cache. Never rejects: a section that
 * fails to load leaves those shapes without geometry, which is a degraded diagram but still a
 * readable one — far better than refusing to open the link at all.
 */
export async function loadStencilsForDoc(doc: DiagramDocument): Promise<void> {
  await Promise.all(
    sectionsUsedBy(doc).map(async (id) => {
      try {
        const section = await loadSection(id);
        if (section) cacheStencils(section.shapes);
      } catch {
        /* best-effort — see above */
      }
    }),
  );
}
