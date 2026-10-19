// "Add comment" where someone looks for it: on the bar that appears over the shape they just clicked.
//
// Adding a comment was reachable by right-click, by Alt+C and from the command palette, and from none
// of them if you simply selected a shape and looked at its own controls — which is the first place
// anyone looks. This is that control, used by every popover a selected thing can have.
import { useMemo } from "react";
import { useDocStore } from "../model/store";
import { addCommentHere } from "./addComment";
import { commentsNaming } from "./commentNavigation";
import { openCommentAndReveal } from "./revealComment";
import styles from "./CommentControl.module.css";

/**
 * Offers to write a comment about the current selection, and to open what is already written about
 * it. `nodeId` names the one thing selected, so the count can be about it rather than about the
 * whole level; with several selected there is nothing single to count and only Add is offered.
 */
export function CommentControl() {
  const diagramId = useDocStore((s) => s.currentDiagramId());
  const viewerMode = useDocStore((s) => s.ui.viewerMode);
  // The stored array, filtered outside the selector: one that builds a list returns a new array
  // every call and the store reads that as a change on every render.
  const all = useDocStore((s) => s.doc.comments);
  const selection = useDocStore((s) => s.selection);
  const deleteComment = useDocStore((s) => s.deleteComment);
  /**
   * What is already written about anything in the selection — the whole selection, not just a
   * lone shape. Several selected with one of them already noted was still offering to add,
   * which is how a shape ended up with two.
   */
  const existing = useMemo(() => {
    for (const id of [...selection.nodeIds, ...selection.edgeIds]) {
      const found = commentsNaming(all, diagramId, id);
      if (found.length > 0) return found;
    }
    return [];
  }, [all, diagramId, selection]);

  if (viewerMode) return null;

  // A comment is about one icon. With several selected there is nothing single to write about, so
  // the control says so instead of offering an Add that would attach one comment to all of them.
  if (selection.nodeIds.length + selection.edgeIds.length !== 1) {
    return (
      <div className={styles.group} data-testid="nd-comment-control">
        <p className={styles.hint}>Select one shape on its own to write a comment about it.</p>
      </div>
    );
  }

  // One comment per shape: once there is one, the only thing on offer is opening it. Adding a second
  // made the reading order visit the same box twice and the markers say things like "1-8".
  return (
    <div className={styles.group} data-testid="nd-comment-control">
      <div className={styles.row}>
        {existing.length > 0 ? (
          <>
            <button
              type="button"
              className={styles.open}
              onClick={() => openCommentAndReveal(existing[0].id)}
              data-testid="nd-open-comment"
            >
              Open comment
            </button>
            <button
              type="button"
              className={styles.remove}
              onClick={() => deleteComment(existing[0].id)}
              title="Delete this comment (Ctrl+Z puts it back)"
              data-testid="nd-remove-comment"
            >
              Remove
            </button>
          </>
        ) : (
          <button type="button" className={styles.add} onClick={() => void addCommentHere()} data-testid="nd-add-comment">
            Add comment
          </button>
        )}
      </div>
      <p className={styles.hint}>
        {existing.length > 0
          ? "This already has a comment. Open it to change what it says, or remove it."
          : "Write down why this is here. Comments read back in order, with a card beside the shape."}
      </p>
    </div>
  );
}
