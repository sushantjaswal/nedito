// Notes, where every other canvas-wide switch lives: in the chip beside Grid, Snap, Layers and
// Outline, rather than as a separate bar that appeared beside it from nowhere the moment a note
// existed. What this holds is what belongs to the whole canvas — whether markers show, whether
// they are numbered, and the list of everything written on this document.
import { useState } from "react";
import { useDocStore } from "../model/store";
import { depthMark, noteEntries } from "./noteNavigation";
import { openNoteAndReveal } from "./revealNote";
import styles from "./NotesChipPopover.module.css";

export function NotesChipPopover() {
  const doc = useDocStore((s) => s.doc);
  const openNoteId = useDocStore((s) => s.ui.openNoteId);
  const markers = useDocStore((s) => s.ui.noteMarkers);
  const numbers = useDocStore((s) => s.ui.noteNumbers);
  const toggleNoteMarkers = useDocStore((s) => s.toggleNoteMarkers);
  const toggleNoteNumbers = useDocStore((s) => s.toggleNoteNumbers);
  const setNoteListOpen = useDocStore((s) => s.setNoteListOpen);
  const reorderNotes = useDocStore((s) => s.reorderNotes);
  /** The row being dragged, by its place in the reading order. */
  const [dragging, setDragging] = useState<number | null>(null);

  const entries = noteEntries(doc);
  const open = (id: string) => {
    setNoteListOpen(false);
    openNoteAndReveal(id);
  };

  return (
    <div className={styles.panel}>
      <label className={styles.check}>
        <input type="checkbox" checked={markers} onChange={toggleNoteMarkers} data-testid="nd-notes-markers-toggle" />
        Show markers on shapes
      </label>
      <label className={styles.check}>
        <input
          type="checkbox"
          checked={numbers}
          disabled={!markers}
          onChange={toggleNoteNumbers}
          data-testid="nd-notes-numbers-toggle"
        />
        Number them in reading order
      </label>
      <p className={styles.hint}>
        {/* Numbering is what turns a set of notes into a walk through the diagram, which is not
            what most notes are — hence off until someone says otherwise. */}
        Numbered markers read as a walk through the diagram: 1, 2, 3. Drag to reorder below.
      </p>

      <div className={styles.list} role="menu" data-testid="nd-note-list">
        {entries.map((entry) => (
          <button
            key={entry.note.id}
            type="button"
            role="menuitem"
            className={entry.note.id === openNoteId ? `${styles.row} ${styles.rowOpen}` : styles.row}
            onClick={() => open(entry.note.id)}
            // Reading order is the author's to arrange, and with numbered markers it is also the
            // order the diagram is walked in, so this is where both are set.
            draggable={entries.length > 1}
            onDragStart={() => setDragging(entry.number - 1)}
            onDragOver={(e) => dragging !== null && e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              if (dragging !== null && dragging !== entry.number - 1) reorderNotes(dragging, entry.number - 1);
              setDragging(null);
            }}
            onDragEnd={() => setDragging(null)}
            data-testid={`nd-note-list-row-${entry.number}`}
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
