// The Scratchpad section (shown as Favorites): shapes kept to reuse, persisted in localStorage.
// A scratchpad item is a reusable snapshot of a shape node's appearance — shapeRef, size,
// style, label — captured from the canvas and stored outside the document (a per-browser
// convenience library, not part of the .nedito file, so it isn't part of DiagramDocument).
import { nanoid } from "nanoid";
import { BRAND } from "../app/brand";
import type { RichLabel, ShapeNode, StyleMap } from "./types";
import { getStencil } from "../library/stencils";
import { cleanStyle, isSafeColour } from "./validate";

export interface ScratchpadItem {
  id: string;
  shapeRef: string;
  size: { w: number; h: number };
  style: StyleMap;
  label?: RichLabel;
}

const KEY = `${BRAND.storagePrefix}:scratchpad`;

function readItems(parsed: unknown): ScratchpadItem[] {
  if (!Array.isArray(parsed)) return [];
  const finite = (v: unknown) => typeof v === "number" && Number.isFinite(v) && v > 0 && v <= 1e7;
  return parsed.flatMap((item): ScratchpadItem[] => {
    if (typeof item !== "object" || item === null) return [];
    const { id, shapeRef, size, style, label } = item as Record<string, unknown>;
    if (typeof id !== "string" || typeof shapeRef !== "string") return [];
    const s = size as { w?: unknown; h?: unknown } | undefined;
    if (!s || !finite(s.w) || !finite(s.h)) return [];
    const out: ScratchpadItem = { id, shapeRef, size: { w: s.w as number, h: s.h as number }, style: cleanStyle(style).style };
    if (label && typeof label === "object" && typeof (label as { text?: unknown }).text === "string") {
      const l = { ...(label as RichLabel) };
      if (l.color !== undefined && !isSafeColour(l.color)) delete l.color;
      if (l.fontSize !== undefined && !(typeof l.fontSize === "number" && l.fontSize >= 1 && l.fontSize <= 400)) delete l.fontSize;
      out.label = l;
    }
    return [out];
  });
}

export function readScratchpad(): ScratchpadItem[] {
  try {
    const raw = localStorage.getItem(KEY);
    // Favorites were saved from documents, and a document may come from anyone: what is stored is
    // checked as it is read back, like a document is, so a value saved before that check existed
    // cannot reach the glyphs that draw them.
    return raw ? readItems(JSON.parse(raw)) : [];
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
