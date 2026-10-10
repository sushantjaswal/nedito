// R5's restore note (CLAUDE_HISTORY.md D94): its timing, and what Start new does.
import { hasContent, rememberDocument } from "../file/recentDocs";
import { createEmptyDoc, useDocStore } from "../model/store";
import { BRAND } from "./brand";

/** How long the "Restored" note stays before it fades, unless the pointer or focus is on it. */
export const RESTORED_NOTE_MS = 6000;
export const FADE_MS = 400;

/**
 * Starts a blank diagram after a restore, without ever losing the restored one: it is put under
 * Recent first (the IndexedDB store R2 added, D91), and only if this browser cannot keep it there
 * is the user asked before it is replaced.
 */
export async function startNewKeepingRestored(): Promise<boolean> {
  const { doc } = useDocStore.getState();
  const kept = hasContent(doc) ? await rememberDocument(doc).catch(() => false) : true;
  if (
    !kept &&
    !window.confirm(
      `This browser can't keep your restored diagram under Recent. Start a new one anyway? (Save a copy first with Ctrl+S to keep it.)`,
    )
  ) {
    return false;
  }
  useDocStore.getState().loadDoc(createEmptyDoc());
  if (hasContent(doc)) {
    useDocStore.getState().showNotice({ message: `New blank diagram. Your previous one is under Recent in the ${BRAND.name} menu.`, tone: "info" });
  }
  return true;
}
