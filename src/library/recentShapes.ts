// Recently used shapes: the last few different stencils placed from
// the shape library, newest first, shown as a row above Favorites. A per-browser convenience, so
// localStorage under BRAND.storagePrefix, like the sidebar's other settings.
import { BRAND } from "../app/brand";

export const RECENT_SHAPES_LIMIT = 8;
const KEY = `${BRAND.storagePrefix}:recentShapes`;

const listeners = new Set<() => void>();

export function readRecentShapes(): string[] {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string").slice(0, RECENT_SHAPES_LIMIT) : [];
  } catch {
    return [];
  }
}

/** Records a stencil placed from the library: it moves to the front, the list keeps RECENT_SHAPES_LIMIT. */
export function recordShapeUse(stencilId: string): void {
  const next = [stencilId, ...readRecentShapes().filter((id) => id !== stencilId)].slice(0, RECENT_SHAPES_LIMIT);
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // best-effort: the row simply doesn't update
  }
  for (const listener of listeners) listener();
}

/** Calls back whenever a shape is recorded, so the row updates as shapes are placed. */
export function subscribeRecentShapes(listener: () => void): () => void {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}
