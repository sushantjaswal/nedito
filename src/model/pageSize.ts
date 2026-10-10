// Page size for print/PDF layout. Deferred through M4/Phase 2 (see CLAUDE_HISTORY.md D14)
// because the canvas is infinite and "page size" had nothing to mean yet; PDF export and print
// are what finally give it a job, so the two shipped together.
//
// Sizes are in the same units as node positions — CSS pixels at 96dpi, the unit the canvas and
// the SVG/PNG exporters already work in. PDF points (72/inch) are converted at the boundary.

export interface PageSize {
  w: number;
  h: number;
}

export interface PagePreset {
  id: string;
  name: string;
  /** Portrait dimensions; landscape is the same preset with the axes swapped. */
  size: PageSize;
}

const MM = 96 / 25.4;
const IN = 96;

const mm = (w: number, h: number): PageSize => ({ w: Math.round(w * MM), h: Math.round(h * MM) });
const inch = (w: number, h: number): PageSize => ({ w: Math.round(w * IN), h: Math.round(h * IN) });

export const PAGE_PRESETS: PagePreset[] = [
  { id: "a4", name: "A4", size: mm(210, 297) },
  { id: "letter", name: "Letter", size: inch(8.5, 11) },
  { id: "legal", name: "Legal", size: inch(8.5, 14) },
  { id: "a3", name: "A3", size: mm(297, 420) },
  { id: "a5", name: "A5", size: mm(148, 210) },
  { id: "tabloid", name: "Tabloid", size: inch(11, 17) },
];

export type Orientation = "portrait" | "landscape";

export function withOrientation(size: PageSize, orientation: Orientation): PageSize {
  const portrait = size.w <= size.h ? size : { w: size.h, h: size.w };
  return orientation === "portrait" ? portrait : { w: portrait.h, h: portrait.w };
}

export function orientationOf(size: PageSize): Orientation {
  return size.w > size.h ? "landscape" : "portrait";
}

/** Preset id whose portrait dimensions match, in either orientation; "custom" when none do. */
export function matchPreset(size: PageSize): string {
  const [a, b] = size.w <= size.h ? [size.w, size.h] : [size.h, size.w];
  const hit = PAGE_PRESETS.find((p) => p.size.w === a && p.size.h === b);
  return hit ? hit.id : "custom";
}

/** CSS px at 96dpi -> PDF points at 72dpi. */
export function pxToPt(px: number): number {
  return (px * 72) / 96;
}

/**
 * How many pages of `page` it takes to cover `content`, and where that grid starts. Pages are
 * anchored to the origin rather than to the content, so page 1 is always the same region of the
 * canvas no matter what gets drawn later — the same stable-page-grid behaviour draw.io has.
 * Content extending into negative coordinates simply extends the grid backwards.
 */
export function pageGrid(
  content: { minX: number; minY: number; maxX: number; maxY: number },
  page: PageSize,
): { originX: number; originY: number; cols: number; rows: number } {
  const startCol = Math.min(0, Math.floor(content.minX / page.w));
  const startRow = Math.min(0, Math.floor(content.minY / page.h));
  const endCol = Math.max(1, Math.ceil(content.maxX / page.w));
  const endRow = Math.max(1, Math.ceil(content.maxY / page.h));
  return {
    originX: startCol * page.w,
    originY: startRow * page.h,
    cols: Math.max(1, endCol - startCol),
    rows: Math.max(1, endRow - startRow),
  };
}
