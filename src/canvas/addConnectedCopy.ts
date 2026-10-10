import { useDocStore } from "../model/store";
import type { Side } from "../model/connectedCopy";
import { revealRect } from "./canvasApi";

/**
 * The ＋ handles' click, and its keyboard and palette equivalents (R3, CLAUDE_HISTORY.md D92):
 * adds the connected copy, then brings it into view — off screen it would not even be drawn
 * (the canvas only renders what is visible), and its label could not open for typing.
 */
export function addConnectedCopyAndReveal(nodeId: string, side: Side): string | null {
  const copyId = useDocStore.getState().addConnectedCopy(nodeId, side);
  if (!copyId) return null;
  const s = useDocStore.getState();
  const copy = s.doc.diagrams[s.currentDiagramId()]?.nodes.find((n) => n.id === copyId);
  if (copy) revealRect({ x: copy.position.x, y: copy.position.y, w: copy.size.w, h: copy.size.h });
  return copyId;
}
