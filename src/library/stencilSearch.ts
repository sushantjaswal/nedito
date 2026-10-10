import type { StencilDef } from "./stencils/types";

/**
 * Whether the sidebar search finds a shape: by its label, its id's own words or any of its
 * keywords. The id is in there deliberately: every pictogram's id is the Material Symbols name it
 * was originally labelled with, so renaming "Filter Drama" to "Cloud" costs nobody the ability
 * to find it by the old name.
 */
export function stencilMatches(stencil: StencilDef, q: string): boolean {
  if (stencil.label.toLowerCase().includes(q)) return true;
  if (stencil.id.replace(/[/-]/g, " ").toLowerCase().includes(q)) return true;
  return (stencil.keywords ?? []).some((k) => k.toLowerCase().includes(q));
}
