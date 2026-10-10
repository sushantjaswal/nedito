import type { StencilDef } from "./types";

export interface IconManifestEntry {
  id: string;
  label: string;
}

const DEFAULT_ICON_SIZE = { w: 60, h: 60 };

// Shared by azure.ts/aws.ts/gcp.ts: pairs each glob-imported raw SVG (keyed by its relative
// path, per Vite's import.meta.glob) with the id/label recorded for that path in the vendor's
// generated manifest.ts (see scratchpad/icon-packs/bulk-import.js at the time these were
// sourced — not re-run automatically, so re-run it by hand if the underlying icon pack changes).
export function buildVendorStencils(modules: Record<string, string>, manifest: Record<string, IconManifestEntry>): StencilDef[] {
  const shapes: StencilDef[] = [];
  for (const [path, raw] of Object.entries(modules)) {
    const meta = manifest[path];
    if (!meta) continue;
    shapes.push({ id: meta.id, label: meta.label, defaultSize: DEFAULT_ICON_SIZE, svgBody: "", raw });
  }
  shapes.sort((a, b) => a.label.localeCompare(b.label));
  return shapes;
}
