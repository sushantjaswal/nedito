// The open comment, over the canvas — and, since NT3, the place it is written.
//
// It takes the side the lit shapes are not on, which the camera has already been told about
// (revealComment.ts), so the two agree rather than each deciding for itself. On a narrow canvas it
// spans the top instead and the camera reserves height rather than width.
//
// The title and body are ordinary fields styled to read as text until you touch them: there is no
// edit mode to enter or leave, which is one fewer thing to get stuck in. Each is wrapped in an edit
// session (format-panel/useEditSession.ts), so typing a sentence is one undo step and not one per
// keystroke. In the share-link viewer they are plain text, because nothing there is editable.
import { useEffect, useRef } from "react";
import { useEditSession } from "../format-panel/useEditSession";
import { useDocStore } from "../model/store";
import { CARD_WIDTH, frameComment, NARROW_CANVAS, openCommentAndReveal } from "./revealComment";
import { commentEntries, stepComment } from "./commentNavigation";
import styles from "./CommentCard.module.css";

export function CommentCard() {
  const openCommentId = useDocStore((s) => s.ui.openCommentId);
  const cardSide = useDocStore((s) => s.ui.cardSide);
  const viewerMode = useDocStore((s) => s.ui.viewerMode);
  const doc = useDocStore((s) => s.doc);
  const closeComment = useDocStore((s) => s.closeComment);
  const setTrace = useDocStore((s) => s.setTrace);
  const updateComment = useDocStore((s) => s.updateComment);
  const deleteComment = useDocStore((s) => s.deleteComment);
  const title = useEditSession();
  const body = useEditSession();
  const titleField = useRef<HTMLInputElement>(null);

  const entries = commentEntries(doc);
  const entry = entries.find((e) => e.comment.id === openCommentId);
  const justAdded = useDocStore((s) => s.ui.commentAwaitingTitle);

  // The canvas can change size under an open card — a window resize, the sidebar folding — and the
  // frame it was given no longer holds. Reframing is cheap and keeps the card off its own subject.
  useEffect(() => {
    if (!openCommentId) return;
    const onResize = () => frameComment(openCommentId);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [openCommentId]);

  // A comment just added opens with its title ready for typing, as a new Nested Block's name does.
  useEffect(() => {
    if (justAdded && titleField.current) {
      titleField.current.focus();
      titleField.current.select();
    }
  }, [justAdded, openCommentId]);

  if (!entry) return null;

  const narrow = typeof window !== "undefined" && window.innerWidth < NARROW_CANVAS;
  const step = (by: 1 | -1) => {
    const next = stepComment(doc, entry.comment.id, by);
    if (next) openCommentAndReveal(next.id);
  };
  const close = () => {
    // Leaving a comment takes its trace with it, and leaves the reader where they are.
    setTrace(null);
    closeComment();
  };
  return (
    <div
      className={`${styles.card} ${narrow ? styles.narrow : cardSide === "left" ? styles.left : styles.right} nodrag nopan nowheel`}
      role="dialog"
      aria-label={`Comment ${entry.number} of ${entries.length}`}
      style={{ "--nd-comment-card-width": `${CARD_WIDTH}px` } as React.CSSProperties}
      data-testid="nd-comment-card"
    >
      <p className={styles.level} data-testid="nd-comment-card-level">
        {entry.levelTitle}
        {entry.wholeLevel && <span className={styles.whole}> · whole level</span>}
      </p>

      {viewerMode ? (
        <>
          <h2 className={styles.title}>{entry.title}</h2>
          {entry.comment.body.trim() !== "" && <p className={styles.body}>{entry.comment.body}</p>}
        </>
      ) : (
        <>
          <input
            ref={titleField}
            className={styles.titleField}
            value={entry.comment.title ?? ""}
            placeholder={entry.title}
            aria-label="Comment title"
            onFocus={title.begin}
            onChange={(e) => title.commit(() => updateComment(entry.comment.id, { title: e.target.value }))}
            onBlur={title.end}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === "Escape") e.currentTarget.blur();
            }}
            data-testid="nd-comment-card-title"
          />
          <textarea
            className={styles.bodyField}
            value={entry.comment.body}
            rows={4}
            placeholder="What is worth knowing here?"
            aria-label="Comment text"
            onFocus={body.begin}
            onChange={(e) => body.commit(() => updateComment(entry.comment.id, { body: e.target.value }))}
            onBlur={body.end}
            // Escape leaves the field; it does not close the comment, which is the next step in the
            // chain and would lose the reader their place mid-sentence.
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.stopPropagation();
                e.currentTarget.blur();
              }
            }}
            data-testid="nd-comment-card-body"
          />
        </>
      )}

      <div className={styles.footer}>
        <button
          type="button"
          className={styles.step}
          onClick={() => step(-1)}
          disabled={entries.length < 2}
          aria-label="Previous comment"
          data-testid="nd-comment-card-prev"
        >
          ←
        </button>
        <span className={styles.count} data-testid="nd-comment-card-count">
          {entry.number} of {entries.length}
        </span>
        <button
          type="button"
          className={styles.step}
          onClick={() => step(1)}
          disabled={entries.length < 2}
          aria-label="Next comment"
          data-testid="nd-comment-card-next"
        >
          →
        </button>
        {!viewerMode && (
          <button
            type="button"
            className={styles.delete}
            onClick={() => {
              setTrace(null);
              deleteComment(entry.comment.id);
            }}
            // No prompt: this is one undo step like everything else, and a dialog over a sentence
            // someone wrote is heavier than the thing it guards.
            title="Delete this comment (Ctrl+Z puts it back)"
            aria-label="Delete comment"
            data-testid="nd-comment-card-delete"
          >
            Delete
          </button>
        )}
        <button type="button" className={styles.close} onClick={close} aria-label="Close comment" data-testid="nd-comment-card-close">
          ✕
        </button>
      </div>
    </div>
  );
}
