// Adding a comment, from wherever the author asked for one.
//
// One function because there are four ways in — the context bar, the right-click menu, Alt+C and
// the command palette — and they must agree about what the comment is about: whatever is selected,
// or the level itself when nothing is.
import { useDocStore } from "../model/store";
import { commentsNaming } from "./commentNavigation";
import { openCommentAndReveal } from "./revealComment";

/**
 * The comment already written about anything in the current selection, if there is one. What stops a
 * shape collecting a second comment, whichever way someone asks for one.
 */
export function alreadyCommented(): string | null {
  const store = useDocStore.getState();
  const diagramId = store.currentDiagramId();
  const { nodeIds, edgeIds } = store.selection;
  for (const id of [...nodeIds, ...edgeIds]) {
    const found = commentsNaming(store.doc.comments, diagramId, id);
    if (found.length > 0) return found[0].id;
  }
  return null;
}

/** Exactly one shape or line is selected — the only thing a comment can be written about. */
export function singleSelection(): { diagramId: string; nodeIds?: string[]; edgeIds?: string[] } | null {
  const store = useDocStore.getState();
  const { nodeIds, edgeIds } = store.selection;
  if (nodeIds.length + edgeIds.length !== 1) return null;
  const diagramId = store.currentDiagramId();
  return nodeIds.length === 1 ? { diagramId, nodeIds } : { diagramId, edgeIds };
}

/**
 * Adds a comment about the one thing selected, and opens it.
 *
 * **One icon, one comment, and a comment is about one icon.** Nothing happens with nothing selected, or
 * with more than one thing selected, or when that thing already has a comment — in which case its
 * comment opens instead. Every loosening of this was tried and taken back out: a comment about the level
 * appeared nowhere on the canvas; a second comment on a shape made the reading order visit the same
 * box twice; and a comment spanning several shapes gave a marker to each of them for writing that
 * belonged to none in particular.
 */
export function addCommentHere(): string | null {
  const store = useDocStore.getState();
  if (store.ui.viewerMode) return null;
  const focus = singleSelection();
  if (!focus) return null;

  const existing = alreadyCommented();
  if (existing) {
    openCommentAndReveal(existing);
    return existing;
  }
  return store.addComment(focus, "");
}
