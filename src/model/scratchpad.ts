// The Scratchpad section (shown as Favorites): shapes kept to reuse, persisted in localStorage.
// A scratchpad item is a reusable snapshot of a shape node's appearance — shapeRef, size,
// style, label — captured from the canvas and stored outside the document (a per-browser
// convenience library, not part of the .nedito file, so it isn't part of DiagramDocument).
import { nanoid } from "nanoid";
import { BRAND } from "../app/brand";
import type { RichLabel, ShapeNode, StyleMap } from "./types";
import { getStencil } from "../library/stencils";

export interface ScratchpadItem {
  id: string;
  shapeRef: string;
  size: { w: number; h: number };
  style: StyleMap;
  label?: RichLabel;
}

const KEY = `${BRAND.storagePrefix}:scratchpad`;

export function readScratchpad(): ScratchpadItem[] {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as ScratchpadItem[]) : [];
  } catch {
    return [];
  }
}

export function writeScratchpad(items: ScratchpadItem[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(items));
  } catch {
    // best-effort, same pattern as file/autosave.ts
  }
}

export function captureScratchpadItem(node: ShapeNode): ScratchpadItem {
  return { id: nanoid(), shapeRef: node.shapeRef, size: node.size, style: node.style, label: node.label };
}

// A favourite captured straight from the sidebar rather than from a placed shape: no style
// overrides and no label, so it behaves exactly like picking that stencil from the library.
export function scratchpadItemFromStencil(shapeRef: string, size: { w: number; h: number }): ScratchpadItem {
  return { id: nanoid(), shapeRef, size, style: { ...getStencil(shapeRef)?.defaultStyle } };
}
