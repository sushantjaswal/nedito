// Adding a note, from wherever the author asked for one.
//
// One function because there are four ways in — the context bar, the right-click menu, Alt+N and
// the command palette — and they must agree about what the note is about: whatever is selected,
// or the level itself when nothing is.
import { useDocStore } from "../model/store";
import { notesNaming } from "./noteNavigation";
import { openNoteAndReveal } from "./revealNote";

/**
 * The note already written about anything in the current selection, if there is one. What stops a
 * shape collecting a second note, whichever way someone asks for one.
 */
export function alreadyNoted(): string | null {
  const store = useDocStore.getState();
  const diagramId = store.currentDiagramId();
  const { nodeIds, edgeIds } = store.selection;
  for (const id of [...nodeIds, ...edgeIds]) {
    const found = notesNaming(store.doc.notes, diagramId, id);
    if (found.length > 0) return found[0].id;
  }
  return null;
}

/**
 * Adds a note about what is selected, and opens it.
 *
 * **A note belongs to an icon.** Nothing happens when nothing is selected: a note about the level
 * as a whole showed up nowhere on the canvas — no marker, no shape to find it from — so writing
 * one felt like it had gone missing. Documents that already hold one still read and open it; there
 * is simply no way to write another for now.
 *
 * **One note per icon.** Asking again for something already written about opens that note instead,
 * so a shape never collects a second — two on one box made the reading order claim to visit it
 * twice, and a marker read as a span across notes that had nothing to do with each other.
 */
export function addNoteHere(): string | null {
  const store = useDocStore.getState();
  if (store.ui.viewerMode) return null;
  const { nodeIds, edgeIds } = store.selection;
  if (nodeIds.length === 0 && edgeIds.length === 0) return null;

  const existing = alreadyNoted();
  if (existing) {
    openNoteAndReveal(existing);
    return existing;
  }

  return store.addNote(
    {
      diagramId: store.currentDiagramId(),
      ...(nodeIds.length > 0 ? { nodeIds } : {}),
      ...(edgeIds.length > 0 ? { edgeIds } : {}),
    },
    "",
  );
}
