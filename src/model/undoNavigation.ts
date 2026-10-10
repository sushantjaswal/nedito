// Cross-level undo/redo: "undoing while viewing a child can affect the parent (e.g., undo
// 'convert to nested'); in that case navigate the user to where the change happened" (CLAUDE.md).
import { useDocStore } from "./store";
import { findDiagramPath } from "./nesting";
import type { DiagramDocument } from "./types";

// Finds the diagram most likely to be "where the change happened": prefers a diagram that
// exists before and after but with different content (a diagram that was edited in place,
// e.g. the parent when converting a selection to nested) over one that was purely added or
// removed (e.g. the freshly created child diagram), since the in-place edit is what the user
// actually did and the added/removed diagram is more of a side effect.
export function findPrimaryChangedDiagramId(before: DiagramDocument, after: DiagramDocument): string | null {
  const allIds = new Set([...Object.keys(before.diagrams), ...Object.keys(after.diagrams)]);
  let modified: string | null = null;
  let anyChanged: string | null = null;

  for (const id of allIds) {
    const b = before.diagrams[id];
    const a = after.diagrams[id];
    if (b === a) continue;
    if (b && a) modified = id;
    else anyChanged ??= id;
  }

  return modified ?? anyChanged;
}

function relocateIfNeeded(before: DiagramDocument, after: DiagramDocument): void {
  const store = useDocStore.getState();
  const currentDiagramId = store.currentDiagramId();
  const currentStillExists = !!after.diagrams[currentDiagramId];
  const changedId = findPrimaryChangedDiagramId(before, after);

  if (currentStillExists && (changedId === null || changedId === currentDiagramId)) {
    return; // nothing changed, or the change is already visible where the user is
  }

  const targetId = currentStillExists ? changedId! : (changedId ?? before.rootDiagramIds[0]);
  const path = findDiagramPath(after, targetId);
  if (path) store.navigateToDiagram(targetId);
  else if (!currentStillExists) {
    // Current diagram vanished and we couldn't find the changed one either (rare) — fall
    // back to the nearest ancestor still in the doc, walking up the current nav stack.
    const survivingAncestor = [...useDocStore.getState().navStack].reverse().find((id) => after.diagrams[id]);
    if (survivingAncestor) store.navigateToLevel(useDocStore.getState().navStack.indexOf(survivingAncestor));
  }
}

export function undoWithNavigation(): void {
  const before = useDocStore.getState().doc;
  useDocStore.temporal.getState().undo();
  const after = useDocStore.getState().doc;
  if (before !== after) relocateIfNeeded(before, after);
}

export function redoWithNavigation(): void {
  const before = useDocStore.getState().doc;
  useDocStore.temporal.getState().redo();
  const after = useDocStore.getState().doc;
  if (before !== after) relocateIfNeeded(before, after);
}
