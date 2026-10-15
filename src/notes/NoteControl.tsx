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
export function NoteControl({ nodeId }: { nodeId?: string }) {
  const diagramId = useDocStore((s) => s.currentDiagramId());
  const viewerMode = useDocStore((s) => s.ui.viewerMode);
  // The stored array, filtered outside the selector: one that builds a list returns a new array
  // every call and the store reads that as a change on every render.
  const all = useDocStore((s) => s.doc.notes);
  const existing = useMemo(() => (nodeId ? notesNaming(all, diagramId, nodeId) : []), [all, diagramId, nodeId]);

  if (viewerMode) return null;

  return (
    <div className={styles.group} data-testid="nd-note-control">
      <div className={styles.row}>
        <button type="button" className={styles.add} onClick={() => void addNoteHere()} data-testid="nd-add-note">
          Add note
        </button>
        {existing.length > 0 && (
          <button
            type="button"
            className={styles.open}
            onClick={() => openNoteAndReveal(existing[0].id)}
            data-testid="nd-open-note"
          >
            {existing.length === 1 ? "Open note" : `Open notes (${existing.length})`}
          </button>
        )}
      </div>
      <p className={styles.hint}>
        {existing.length > 0
          ? "A note is about whatever is selected when you write it."
          : "Write down why this is here. Notes read back in order, with a card beside the shape."}
      </p>
    </div>
  );
}
