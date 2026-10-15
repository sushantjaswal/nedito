// A small mark on a shape that somebody has written about, so the writing is findable from the
// diagram rather than only from the pager.
//
// Muted ink, not a status colour: a note is not a warning. It sits in the corner opposite the
// Health badge so the two never argue over the same space, and it disappears with every other
// per-shape ornament once the canvas is zoomed too far out to read them.
import { useMemo } from "react";
import { useDocStore } from "../model/store";
import { notePeek, notesBelow, notesNaming } from "./noteNavigation";
import { noteTitle } from "../model/notes";
import { openNoteAndReveal } from "./revealNote";
import type { Note } from "../model/types";
import styles from "./NoteMarker.module.css";

/** What the hover shows: the titles, and the first line of the one note when there is only one. */
function peekOf(notes: Note[]): string {
  if (notes.length === 1) {
    const body = notePeek(notes[0]);
    return body ? `${noteTitle(notes[0])}\n${body}` : noteTitle(notes[0]);
  }
  return notes.map((n, i) => `${i + 1}. ${noteTitle(n)}`).join("\n");
}

/** The mark on a shape or line that notes on this level name. */
export function NoteMarker({ nodeId }: { nodeId: string }) {
  const diagramId = useDocStore((s) => s.currentDiagramId());
  // The notes array, not a filtered one: a selector that builds a list returns a new array every
  // call, which a store compares by identity and reads as a change — one marker on the canvas was
  // enough to re-render the editor until React gave up. Filter after selecting, memoised.
  const all = useDocStore((s) => s.doc.notes);
  const notes = useMemo(() => notesNaming(all, diagramId, nodeId), [all, diagramId, nodeId]);
  if (notes.length === 0) return null;

  const label = notes.length === 1 ? "1 note about this" : `${notes.length} notes about this`;
  return (
    <button
      type="button"
      className={`${styles.marker} nd-note-marker nodrag`}
      title={peekOf(notes)}
      aria-label={label}
      onClick={(e) => {
        e.stopPropagation();
        openNoteAndReveal(notes[0].id);
      }}
      data-testid={`nd-note-marker-${nodeId}`}
    >
      {/* A bare dot on a shape three notes talk about would be a lie, so past one it counts. */}
      {notes.length > 1 ? notes.length : ""}
    </button>
  );
}

/**
 * The mark on a Nested Block whose child levels hold notes: `N↓`, dashed, so a parent advertises
 * the writing beneath it instead of hiding it. Clicking opens the first, which drills down.
 */
export function NestedNoteMarker({ childDiagramId }: { childDiagramId: string }) {
  // Counting what is below needs the diagram graph as well as the notes, so this one selects the
  // document and memoises on it — same reason as above: never return a fresh array from a selector.
  const doc = useDocStore((s) => s.doc);
  const notes = useMemo(() => notesBelow(doc, childDiagramId), [doc, childDiagramId]);
  if (notes.length === 0) return null;

  return (
    <button
      type="button"
      className={`${styles.marker} ${styles.below} nd-note-marker nodrag`}
      title={peekOf(notes)}
      aria-label={notes.length === 1 ? "1 note inside this block" : `${notes.length} notes inside this block`}
      onClick={(e) => {
        e.stopPropagation();
        openNoteAndReveal(notes[0].id);
      }}
      data-testid={`nd-note-marker-below-${childDiagramId}`}
    >
      {notes.length}
      <span className={styles.down} aria-hidden="true">
        ↓
      </span>
    </button>
  );
}
