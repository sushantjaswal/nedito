// Comments, where every other canvas-wide switch lives: in the chip beside Grid, Snap, Layers and
// Outline, rather than as a separate bar that appeared beside it from nowhere the moment a comment
// existed. What this holds is what belongs to the whole canvas — whether markers show, whether
// they are numbered, and the list of everything written on this document.
import { useState } from "react";
import { useDocStore } from "../model/store";
import { depthMark, commentEntries } from "./commentNavigation";
import { isBlank } from "../model/comments";
import { openCommentAndReveal } from "./revealComment";
import styles from "./CommentsChipPopover.module.css";

export function CommentsChipPopover() {
  const doc = useDocStore((s) => s.doc);
  const openCommentId = useDocStore((s) => s.ui.openCommentId);
  const markers = useDocStore((s) => s.ui.commentMarkers);
  const toggleCommentMarkers = useDocStore((s) => s.toggleCommentMarkers);
  const setCommentListOpen = useDocStore((s) => s.setCommentListOpen);
  const reorderComments = useDocStore((s) => s.reorderComments);
  /** The row being dragged, by its place in the reading order. */
  const [dragging, setDragging] = useState<number | null>(null);

  // The one being written is not listed: it is blank, and discarded if it stays that way.
  const entries = commentEntries(doc).filter((e) => !isBlank(e.comment));
  const open = (id: string) => {
    setCommentListOpen(false);
    openCommentAndReveal(id);
  };

  return (
    <div className={styles.panel}>
      <label className={styles.check}>
        <input type="checkbox" checked={markers} onChange={toggleCommentMarkers} data-testid="nd-comments-markers-toggle" />
        Show markers on shapes
      </label>
      <p className={styles.hint}>
        {/* Numbering the markers was tried and taken out: the list's order is the order comments are
            read in, which is rarely the order the diagram flows in, so a 1 on the canvas and a 1
            in this list pointed at different shapes. A marker now says only that writing is here. */}
        Drag to reorder how they read. The order here is not shown on the diagram.
      </p>

      <div className={styles.list} role="menu" data-testid="nd-comment-list">
        {entries.map((entry) => (
          <button
            key={entry.comment.id}
            type="button"
            role="menuitem"
            className={entry.comment.id === openCommentId ? `${styles.row} ${styles.rowOpen}` : styles.row}
            onClick={() => open(entry.comment.id)}
            // Reading order is the author's to arrange, and with numbered markers it is also the
            // order the diagram is walked in, so this is where both are set.
            draggable={entries.length > 1}
            onDragStart={() => setDragging(entry.number - 1)}
            onDragOver={(e) => dragging !== null && e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              if (dragging !== null && dragging !== entry.number - 1) reorderComments(dragging, entry.number - 1);
              setDragging(null);
            }}
            onDragEnd={() => setDragging(null)}
            data-testid={`nd-comment-list-row-${entry.number}`}
          >
            <span className={styles.rowNumber}>{entry.number}</span>
            {entry.depth > 0 && <span className={styles.depth}>{depthMark(entry.depth)}</span>}
            <span className={styles.rowTitle}>{entry.title}</span>
          </button>
        ))}
      </div>

    </div>
  );
}
