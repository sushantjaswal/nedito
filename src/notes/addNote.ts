// Adding a note, from wherever the author asked for one.
//
// One function because there are four ways in — the context bar, the right-click menu, Alt+N and
// the command palette — and they must agree about what the note is about: whatever is selected,
// or the level itself when nothing is.
import { useDocStore } from "../model/store";

/**
 * Adds a note about the current selection, or about the level when nothing is selected.
 *
 * `scope: "level"` is for the entry points that say so — the right-click menu on bare canvas offers
 * "Add note about this level", and it has to mean it even when something is still selected
 * elsewhere on the canvas, or the menu item would be lying about what it does.
 */
export function addNoteHere(scope: "selection" | "level" = "selection"): string | null {
  const store = useDocStore.getState();
  if (store.ui.viewerMode) return null;
  const { nodeIds, edgeIds } = store.selection;
  const about = scope === "level" ? { nodeIds: [], edgeIds: [] } : { nodeIds, edgeIds };
  return store.addNote(
    {
      diagramId: store.currentDiagramId(),
      ...(about.nodeIds.length > 0 ? { nodeIds: about.nodeIds } : {}),
      ...(about.edgeIds.length > 0 ? { edgeIds: about.edgeIds } : {}),
    },
    "",
  );
}
