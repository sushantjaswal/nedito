// UI-level navigation orchestration: coordinates the store's navStack (pure data) with the
// mounted React Flow instance (viewport save/restore + the animated zoom transition).
// Kept out of model/store.ts so the store itself stays decoupled from React Flow.
import { getCanvasInstance } from "../canvas/canvasApi";
import { useDocStore, type ViewportState } from "../model/store";
import type { DiagramDocument } from "../model/types";

const TRANSITION_MS = 300;

/**
 * Converts the selection to a Nested Block, then selects it with its name open for typing:
 * CLAUDE.md's convert "prompts the author", and a name is the first thing a new level needs —
 * otherwise every converted block and its breadcrumb read "New Diagram" (D113).
 */
export function convertSelectionAndName(): void {
  const store = useDocStore.getState();
  const result = store.convertSelectionToNested();
  if (!result) return;
  store.setSelection([result.nestedNodeId], []);
  store.setEditingNodeId(result.nestedNodeId);
}

/** Room for a ghost pill at the canvas's left edge: its 200px cap plus the insets around it. */
export const GHOST_ROOM = 220;

/**
 * Where a level opens the first time it is visited (a saved viewport always wins). 100% from the
 * origin, as before — except inside a Nested Block whose ports reach in: there the content starts
 * GHOST_ROOM from the left, so the incoming ghost pills have room for their names instead of
 * being squeezed to "←…" between the canvas edge and the shapes (D113).
 */
export function firstVisitViewport(doc: DiagramDocument, navStack: string[], diagramId: string): ViewportState {
  const plain = { x: 0, y: 0, zoom: 1 };
  const parentId = navStack[navStack.length - 2];
  const block = parentId
    ? doc.diagrams[parentId]?.nodes.find((n) => n.type === "nested" && n.childDiagramId === diagramId)
    : undefined;
  const nodes = doc.diagrams[diagramId]?.nodes ?? [];
  if (block?.type !== "nested" || !block.ports.some((p) => p.innerNodeId) || nodes.length === 0) return plain;
  const left = Math.min(...nodes.map((n) => n.position.x));
  return { ...plain, x: Math.max(0, GHOST_ROOM - left) };
}

export function navigateIntoNested(nestedNodeId: string): void {
  const store = useDocStore.getState();
  const api = getCanvasInstance();
  const fromDiagramId = store.currentDiagramId();

  if (!api) {
    store.navigateInto(nestedNodeId);
    return;
  }

  store.saveViewport(fromDiagramId, api.getViewport());
  // Zoom toward the box on the diagram we're leaving, giving a "diving in" lead-in before the
  // content swaps to the child diagram.
  //
  // The swap waits for that animation to *finish* rather than jumping in 40ms early as it used
  // to: the canvas restores the incoming diagram's viewport as soon as the diagram id changes,
  // and an animation still in flight would land on top of it — you'd arrive in the child at
  // whatever zoom the fit had reached (typically 400%) looking at empty canvas.
  const enter = () => useDocStore.getState().navigateInto(nestedNodeId);
  api.fitView({ nodes: [{ id: nestedNodeId }], duration: TRANSITION_MS, padding: 0.3 }).then(enter, enter);
}

export function navigateBackOut(): void {
  const store = useDocStore.getState();
  const api = getCanvasInstance();
  if (api) store.saveViewport(store.currentDiagramId(), api.getViewport());
  store.navigateBack();
}

export function navigateToBreadcrumb(index: number): void {
  const store = useDocStore.getState();
  const api = getCanvasInstance();
  if (api) store.saveViewport(store.currentDiagramId(), api.getViewport());
  store.navigateToLevel(index);
}
