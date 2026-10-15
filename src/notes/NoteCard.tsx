// The open note, over the canvas. Reading only in this stage: the card becomes the editor later.
//
// It takes the side the lit shapes are not on, which the camera has already been told about
// (revealNote.ts), so the two agree rather than each deciding for itself. On a narrow canvas it
// spans the top instead and the camera reserves height rather than width.
import { useEffect, useRef } from "react";
import { useDocStore } from "../model/store";
import { CARD_WIDTH, frameNote, NARROW_CANVAS, openNoteAndReveal } from "./revealNote";
import { noteEntries, stepNote } from "./noteNavigation";
import styles from "./NoteCard.module.css";

export function NoteCard() {
  const openNoteId = useDocStore((s) => s.ui.openNoteId);
  const cardSide = useDocStore((s) => s.ui.cardSide);
  const doc = useDocStore((s) => s.doc);
  const closeNote = useDocStore((s) => s.closeNote);
  const setTrace = useDocStore((s) => s.setTrace);
  const card = useRef<HTMLDivElement>(null);

  const entries = noteEntries(doc);
  const entry = entries.find((e) => e.note.id === openNoteId);

  // The canvas can change size under an open card — a window resize, the sidebar folding — and the
  // frame it was given no longer holds. Reframing is cheap and keeps the card off its own subject.
  useEffect(() => {
    if (!openNoteId) return;
    const onResize = () => frameNote(openNoteId);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [openNoteId]);

  if (!entry) return null;

  const narrow = typeof window !== "undefined" && window.innerWidth < NARROW_CANVAS;
  const step = (by: 1 | -1) => {
    const next = stepNote(doc, entry.note.id, by);
    if (next) openNoteAndReveal(next.id);
  };
  const close = () => {
    // Leaving a note takes its trace with it, and leaves the reader where they are.
    setTrace(null);
    closeNote();
  };

  return (
    <div
      ref={card}
      className={`${styles.card} ${narrow ? styles.narrow : cardSide === "left" ? styles.left : styles.right} nodrag nopan nowheel`}
      role="dialog"
      aria-label={`Note ${entry.number} of ${entries.length}`}
      style={{ "--nd-note-card-width": `${CARD_WIDTH}px` } as React.CSSProperties}
      data-testid="nd-note-card"
    >
      <p className={styles.level} data-testid="nd-note-card-level">
        {entry.levelTitle}
        {entry.wholeLevel && <span className={styles.whole}> · whole level</span>}
      </p>
      <h2 className={styles.title}>{entry.title}</h2>
      {entry.note.body.trim() !== "" && <p className={styles.body}>{entry.note.body}</p>}
      <div className={styles.footer}>
        <button
          type="button"
          className={styles.step}
          onClick={() => step(-1)}
          disabled={entries.length < 2}
          aria-label="Previous note"
          data-testid="nd-note-card-prev"
        >
          ←
        </button>
        <span className={styles.count} data-testid="nd-note-card-count">
          {entry.number} of {entries.length}
        </span>
        <button
          type="button"
          className={styles.step}
          onClick={() => step(1)}
          disabled={entries.length < 2}
          aria-label="Next note"
          data-testid="nd-note-card-next"
        >
          →
        </button>
        <button type="button" className={styles.close} onClick={close} aria-label="Close note" data-testid="nd-note-card-close">
          ✕
        </button>
      </div>
    </div>
  );
}
