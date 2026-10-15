// The pager: one control at the foot of the canvas for moving between notes.
//
// Its width must not grow with the note count, which is why the dots stop at twelve and why titles
// live in a hover peek and in the list rather than on the control itself.
import { useEffect, useRef } from "react";
import { useDocStore } from "../model/store";
import { depthMark, noteEntries, notePeek, stepNote } from "./noteNavigation";
import { openNoteAndReveal } from "./revealNote";
import styles from "./NotePager.module.css";

/** Above this many notes the dots are dropped; the pager stays the same width either way. */
export const MAX_DOTS = 12;

export function NotePager() {
  const doc = useDocStore((s) => s.doc);
  const openNoteId = useDocStore((s) => s.ui.openNoteId);
  const listOpen = useDocStore((s) => s.ui.noteListOpen);
  const setNoteListOpen = useDocStore((s) => s.setNoteListOpen);
  const list = useRef<HTMLDivElement>(null);

  const entries = noteEntries(doc);

  // A menu closes when you click away from it.
  useEffect(() => {
    if (!listOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!list.current?.contains(e.target as Node)) setNoteListOpen(false);
    };
    window.addEventListener("pointerdown", onPointerDown);
    return () => window.removeEventListener("pointerdown", onPointerDown);
  }, [listOpen, setNoteListOpen]);

  if (entries.length === 0) return null;

  const current = entries.find((e) => e.note.id === openNoteId);
  const step = (by: 1 | -1) => {
    const next = stepNote(doc, openNoteId, by);
    if (next) openNoteAndReveal(next.id);
  };
  const open = (id: string) => {
    setNoteListOpen(false);
    openNoteAndReveal(id);
  };

  return (
    <div className={`${styles.pager} nodrag nopan`} data-testid="nd-note-pager">
      <button type="button" className={styles.arrow} onClick={() => step(-1)} aria-label="Previous note" data-testid="nd-note-prev">
        ←
      </button>

      {entries.length <= MAX_DOTS && (
        <span className={styles.dots}>
          {entries.map((entry) => (
            <button
              key={entry.note.id}
              type="button"
              className={entry.note.id === openNoteId ? `${styles.dot} ${styles.dotOpen}` : styles.dot}
              // The title, not the number: a number tells a reader nothing about what is in the note.
              aria-label={entry.title}
              aria-current={entry.note.id === openNoteId ? "true" : undefined}
              title={`${entry.title}${entry.note.body.trim() ? `\n${notePeek(entry.note)}` : ""}`}
              onClick={() => open(entry.note.id)}
              data-testid={`nd-note-dot-${entry.number}`}
            >
              {entry.number}
              {entry.depth > 0 && <span className={styles.depth}>{depthMark(entry.depth)}</span>}
            </button>
          ))}
        </span>
      )}

      <button type="button" className={styles.arrow} onClick={() => step(1)} aria-label="Next note" data-testid="nd-note-next">
        →
      </button>

      <span className={styles.divider} aria-hidden="true" />
      <span className={styles.count} data-testid="nd-note-count">
        {current ? current.number : "–"} / {entries.length}
      </span>

      <div className={styles.listWrap} ref={list}>
        <button
          type="button"
          className={styles.arrow}
          aria-haspopup="menu"
          aria-expanded={listOpen}
          aria-label="All notes"
          onClick={() => setNoteListOpen(!listOpen)}
          data-testid="nd-note-list-toggle"
        >
          ☰
        </button>
        {listOpen && (
          <div className={styles.list} role="menu" data-testid="nd-note-list">
            {entries.map((entry) => (
              <button
                key={entry.note.id}
                type="button"
                role="menuitem"
                className={entry.note.id === openNoteId ? `${styles.row} ${styles.rowOpen}` : styles.row}
                onClick={() => open(entry.note.id)}
                data-testid={`nd-note-list-row-${entry.number}`}
              >
                <span className={styles.rowNumber}>{entry.number}</span>
                {entry.depth > 0 && <span className={styles.depth}>{depthMark(entry.depth)}</span>}
                <span className={styles.rowTitle}>{entry.title}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
