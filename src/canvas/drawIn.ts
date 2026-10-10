// Draw in: a one-shot. When a share link first opens on a diagram
// with Draw in set, its lines trace themselves once and the diagram settles. Only in the viewer —
// the author would see it on every level change — only on the first level shown, never on a later
// one, and never when the reader's motion is off.
import { useDocStore } from "../model/store";
import { pathPoints } from "./edgeGeometry";

/** How long the lines take to draw, and when the canvas lets go of the effect. */
export const DRAW_IN_MS = 900;
const SETTLE_MS = DRAW_IN_MS + 250;

let played = false;

function motionAllowed(): boolean {
  const reduced = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  return useDocStore.getState().ui.motionEnabled && !reduced;
}

/** Called when the canvas first comes up (DiagramCanvas's onInit). Plays at most once a page. */
export function maybeDrawIn(): void {
  if (played) return;
  played = true;
  const s = useDocStore.getState();
  const id = s.currentDiagramId();
  if (!s.ui.viewerMode || !s.doc.diagrams[id]?.motion?.drawIn || !motionAllowed()) return;
  s.setDrawingIn(id);
  window.setTimeout(() => useDocStore.getState().setDrawingIn(null), SETTLE_MS);
}

/** A path's drawn length, for its draw-in stroke. */
export function drawnLength(d: string): number {
  const pts = pathPoints(d);
  let total = 0;
  for (let i = 1; i < pts.length; i++) total += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  return Math.ceil(total) + 2;
}

/** Tests only. */
export function resetDrawInForTests(): void {
  played = false;
}
