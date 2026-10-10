import { useSyncExternalStore } from "react";
import { getStencil, stencilCacheRevision, subscribeStencilCache } from "./index";
import type { StencilDef } from "./types";

/**
 * A stencil by id, re-rendering the caller when it arrives in the cache.
 *
 * Returns undefined while the stencil's section is still loading. The snapshot is the cached
 * object itself, so a component re-renders only when *its* stencil changes from missing to
 * present, not every time some unrelated section finishes loading.
 */
export function useStencil(id: string): StencilDef | undefined {
  return useSyncExternalStore(subscribeStencilCache, () => getStencil(id));
}

/**
 * The cache revision, for components that read many stencils at once (a Nested Block's miniature
 * of its whole child diagram) and cannot name one to wait for.
 */
export function useStencilCacheRevision(): number {
  return useSyncExternalStore(subscribeStencilCache, stencilCacheRevision);
}
