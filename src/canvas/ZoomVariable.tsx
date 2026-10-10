import { useEffect } from "react";
import { useStoreApi } from "@xyflow/react";

/**
 * Below this zoom the canvas draws in less detail (P1, D115): shapes keep their outline and fill,
 * but labels, handles, shadows, Nested Block miniatures, arrowheads and line labels go. Text is
 * unreadable this far out anyway, and with a large diagram on screen they are most of the cost of
 * every pan (docs/performance-2026-10-07.md). Selected nodes keep full detail.
 */
export const LOW_DETAIL_ZOOM = 0.35;
/** The class that switches it, on the React Flow element. */
export const LOW_DETAIL_CLASS = "nd-lod";

/**
 * Publishes the canvas zoom to CSS as `--nd-inverse-zoom` on the React Flow element, for the
 * few on-canvas controls that should stay one size on screen however far the canvas is zoomed
 * — the ＋ handles (R3, D92), as draw.io's hover arrows do — and switches low detail on and off
 * at LOW_DETAIL_ZOOM. Written straight onto the element from a store subscription, so zooming
 * re-renders no node; crossing the threshold costs one style pass.
 */
export function ZoomVariable() {
  const store = useStoreApi();
  useEffect(() => {
    let last = NaN;
    const apply = () => {
      const { domNode, transform } = store.getState();
      const zoom = transform[2];
      if (!domNode || zoom === last) return;
      last = zoom;
      domNode.style.setProperty("--nd-inverse-zoom", String(1 / zoom));
      domNode.classList.toggle(LOW_DETAIL_CLASS, zoom < LOW_DETAIL_ZOOM);
    };
    apply();
    return store.subscribe(apply);
  }, [store]);
  return null;
}
