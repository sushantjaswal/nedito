// The open note, over the canvas — and, since NT3, the place it is written.
//
// It takes the side the lit shapes are not on, which the camera has already been told about
// (revealNote.ts), so the two agree rather than each deciding for itself. On a narrow canvas it
// spans the top instead and the camera reserves height rather than width.
//
// The title and body are ordinary fields styled to read as text until you touch them: there is no
// edit mode to enter or leave, which is one fewer thing to get stuck in. Each is wrapped in an edit
// session (format-panel/useEditSession.ts), so typing a sentence is one undo step and not one per
// keystroke. In the share-link viewer they are plain text, because nothing there is editable.
import { useEffect, useRef } from "react";
import { useEditSession } from "../format-panel/useEditSession";
import { useDocStore } from "../model/store";
import { CARD_WIDTH, frameNote, NARROW_CANVAS, openNoteAndReveal } from "./revealNote";
import { noteEntries, stepNote } from "./noteNavigation";
import styles from "./NoteCard.module.css";

export function NoteCard() {
  const openNoteId = useDocStore((s) => s.ui.openNoteId);
  const cardSide = useDocStore((s) => s.ui.cardSide);
  const viewerMode = useDocStore((s) => s.ui.viewerMode);
  const doc = useDocStore((s) => s.doc);
  const selection = useDocStore((s) => s.selection);
  const closeNote = useDocStore((s) => s.closeNote);
  const setTrace = useDocStore((s) => s.setTrace);
  const updateNote = useDocStore((s) => s.updateNote);
  const setNoteFocus = useDocStore((s) => s.setNoteFocus);
  const title = useEditSession();
  const body = useEditSession();
  const titleField = useRef<HTMLInputElement>(null);

  const entries = noteEntries(doc);
  const entry = entries.find((e) => e.note.id === openNoteId);
  const justAdded = useDocStore((s) => s.ui.noteAwaitingTitle);

  // The canvas can change size under an open card — a window resize, the sidebar folding — and the
  // frame it was given no longer holds. Reframing is cheap and keeps the card off its own subject.
  useEffect(() => {
    if (!openNoteId) return;
    const onResize = () => frameNote(openNoteId);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [openNoteId]);

  // A note just added opens with its title ready for typing, as a new Nested Block's name does.
  useEffect(() => {
    if (justAdded && titleField.current) {
      titleField.current.focus();
      titleField.current.select();
    }
  }, [justAdded, openNoteId]);

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
  // What the note would be about if it were re-pointed at what is selected now.
  const selected = [...selection.nodeIds, ...selection.edgeIds];
  const describesSelection =
    selected.length > 0 &&
    selected.length === (entry.note.focus.nodeIds?.length ?? 0) + (entry.note.focus.edgeIds?.length ?? 0) &&
    selected.every((id) => entry.note.focus.nodeIds?.includes(id) || entry.note.focus.edgeIds?.includes(id));

  return (
    <div
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

      {viewerMode ? (
        <>
          <h2 className={styles.title}>{entry.title}</h2>
          {entry.note.body.trim() !== "" && <p className={styles.body}>{entry.note.body}</p>}
        </>
      ) : (
        <>
          <input
            ref={titleField}
            className={styles.titleField}
            value={entry.note.title ?? ""}
            placeholder={entry.title}
            aria-label="Note title"
            onFocus={title.begin}
            onChange={(e) => title.commit(() => updateNote(entry.note.id, { title: e.target.value }))}
            onBlur={title.end}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === "Escape") e.currentTarget.blur();
            }}
            data-testid="nd-note-card-title"
          />
          <textarea
            className={styles.bodyField}
            value={entry.note.body}
            rows={4}
            placeholder="What is worth knowing here?"
            aria-label="Note text"
            onFocus={body.begin}
            onChange={(e) => body.commit(() => updateNote(entry.note.id, { body: e.target.value }))}
            onBlur={body.end}
            // Escape leaves the field; it does not close the note, which is the next step in the
            // chain and would lose the reader their place mid-sentence.
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.stopPropagation();
                e.currentTarget.blur();
              }
            }}
            data-testid="nd-note-card-body"
          />
          {selected.length > 0 && !describesSelection && (
            <button
              type="button"
              className={styles.retarget}
              onClick={() =>
                setNoteFocus(entry.note.id, {
                  diagramId: entry.note.focus.diagramId,
                  ...(selection.nodeIds.length > 0 ? { nodeIds: selection.nodeIds } : {}),
                  ...(selection.edgeIds.length > 0 ? { edgeIds: selection.edgeIds } : {}),
                })
              }
              data-testid="nd-note-card-retarget"
            >
              Set to selection ({selected.length})
            </button>
          )}
        </>
      )}

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
