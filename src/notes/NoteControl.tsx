// "Add note" where someone looks for it: on the bar that appears over the shape they just clicked.
//
// Adding a note was reachable by right-click, by Alt+N and from the command palette, and from none
// of them if you simply selected a shape and looked at its own controls — which is the first place
// anyone looks. This is that control, used by every popover a selected thing can have.
import { useMemo } from "react";
import { useDocStore } from "../model/store";
import { addNoteHere } from "./addNote";
import { notesNaming } from "./noteNavigation";
import { openNoteAndReveal } from "./revealNote";
import styles from "./NoteControl.module.css";

/**
 * Offers to write a note about the current selection, and to open what is already written about
 * it. `nodeId` names the one thing selected, so the count can be about it rather than about the
 * whole level; with several selected there is nothing single to count and only Add is offered.
 */
export function NoteControl() {
  const diagramId = useDocStore((s) => s.currentDiagramId());
  const viewerMode = useDocStore((s) => s.ui.viewerMode);
  // The stored array, filtered outside the selector: one that builds a list returns a new array
  // every call and the store reads that as a change on every render.
  const all = useDocStore((s) => s.doc.notes);
  const selection = useDocStore((s) => s.selection);
  const deleteNote = useDocStore((s) => s.deleteNote);
  /**
   * What is already written about anything in the selection — the whole selection, not just a
   * lone shape. Several selected with one of them already noted was still offering to add,
   * which is how a shape ended up with two.
   */
  const existing = useMemo(() => {
    for (const id of [...selection.nodeIds, ...selection.edgeIds]) {
      const found = notesNaming(all, diagramId, id);
      if (found.length > 0) return found;
    }
    return [];
  }, [all, diagramId, selection]);

  if (viewerMode) return null;

  // One note per shape: once there is one, the only thing on offer is opening it. Adding a second
  // made the reading order visit the same box twice and the markers say things like "1-8".
  return (
    <div className={styles.group} data-testid="nd-note-control">
      <div className={styles.row}>
        {existing.length > 0 ? (
          <>
            <button
              type="button"
              className={styles.open}
              onClick={() => openNoteAndReveal(existing[0].id)}
              data-testid="nd-open-note"
            >
              Open note
            </button>
            <button
              type="button"
              className={styles.remove}
              onClick={() => deleteNote(existing[0].id)}
              title="Delete this note (Ctrl+Z puts it back)"
              data-testid="nd-remove-note"
            >
              Remove
            </button>
          </>
        ) : (
          <button type="button" className={styles.add} onClick={() => void addNoteHere()} data-testid="nd-add-note">
            Add note
          </button>
        )}
      </div>
      <p className={styles.hint}>
        {existing.length > 0
          ? "This already has a note. Open it to change what it says, or remove it."
          : "Write down why this is here. Notes read back in order, with a card beside the shape."}
      </p>
    </div>
  );
}
