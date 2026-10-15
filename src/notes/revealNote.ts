// Opening a note: what the reader sees when they go to one.
//
// In order — switch to its page, drill to its level, light what it names, and frame that with room
// left for the card. Only the last step is new; the rest already existed for the breadcrumb and for
// Trace, and are reused rather than rebuilt.
//
// Leaving a note clears the trace and leaves the reader where they are. It does not navigate back:
// they may want to keep looking around from where the note brought them.
import { revealRect } from "../canvas/canvasApi";
import { getCanvasInstance } from "../canvas/canvasApi";
import type { Diagram, DiagramDocument, Note } from "../model/types";
import { useDocStore } from "../model/store";

/** The card's width, and the room the pager needs at the foot of the canvas. */
export const CARD_WIDTH = 312;
export const CARD_MARGIN = 16;
export const PAGER_HEIGHT = 54;

/**
 * Below this the card spans the full width at the top instead of taking a side, so the camera
 * reserves vertical room rather than horizontal.
 */
export const NARROW_CANVAS = 860;

/** How far past the middle the lit shapes must sit before the card changes sides. */
const HYSTERESIS = 0.1;

export type CardSide = "left" | "right";

/**
 * Which side the card takes: the one the lit shapes are not on.
 *
 * The hysteresis is the whole point. Stepping through notes whose subjects sit near the middle,
 * a card that simply follows the midpoint flips from side to side and reads as a fault rather
 * than as a camera. It only changes sides once the lit shapes are clearly over, and otherwise
 * stays where it was.
 */
export function cardSideFor(
  litCentreX: number,
  viewportCentreX: number,
  viewportWidth: number,
  previous: CardSide | null,
): CardSide {
  const wanted: CardSide = litCentreX < viewportCentreX ? "right" : "left";
  if (!previous) return wanted;
  if (wanted === previous) return previous;
  const past = Math.abs(litCentreX - viewportCentreX);
  return past > viewportWidth * HYSTERESIS ? wanted : previous;
}

/** The box around what a note names, in diagram coordinates; the whole level when it names nothing. */
export function litBounds(diagram: Diagram, note: Note): { x: number; y: number; w: number; h: number } | null {
  const nodeIds = new Set(note.focus.nodeIds ?? []);
  // A line is lit by the shapes it runs between: that is what there is to look at.
  for (const edgeId of note.focus.edgeIds ?? []) {
    const edge = diagram.edges.find((e) => e.id === edgeId);
    if (!edge) continue;
    if (edge.source.nodeId) nodeIds.add(edge.source.nodeId);
    if (edge.target.nodeId) nodeIds.add(edge.target.nodeId);
  }
  // Ids deleted during this session have not been through the load-time tidy-up yet, so a note
  // may still name only shapes that are gone. It is a note about the level now, in the same way
  // reopening the document would make it one; framing nothing would be the wrong answer.
  const named = nodeIds.size > 0 ? diagram.nodes.filter((n) => nodeIds.has(n.id)) : [];
  const boxes = named.length > 0 ? named : diagram.nodes;
  if (boxes.length === 0) return null;
  const x = Math.min(...boxes.map((n) => n.position.x));
  const y = Math.min(...boxes.map((n) => n.position.y));
  const right = Math.max(...boxes.map((n) => n.position.x + n.size.w));
  const bottom = Math.max(...boxes.map((n) => n.position.y + n.size.h));
  return { x, y, w: right - x, h: bottom - y };
}

export function findNote(doc: DiagramDocument, noteId: string): Note | undefined {
  return doc.notes?.find((n) => n.id === noteId);
}

/**
 * Opens a note and takes the reader to it. Safe to call for a note that has since gone, or whose
 * level has: nothing happens rather than a half-finished journey.
 */
export function openNoteAndReveal(noteId: string): void {
  const store = useDocStore.getState();
  const note = findNote(store.doc, noteId);
  if (!note || !store.doc.diagrams[note.focus.diagramId]) return;

  // The page switch and the drill down are the same call: findDiagramPath searches from every
  // root, so a level on another page is reached by naming it.
  store.navigateToDiagram(note.focus.diagramId);
  const lit = [...(note.focus.nodeIds ?? []), ...(note.focus.edgeIds ?? [])];
  // navigateToDiagram clears the trace, so the note's own trace is set after it, not before.
  if (lit.length > 0) useDocStore.getState().setTrace(lit);
  useDocStore.getState().openNote(noteId);

  frameNote(noteId);
}

/**
 * Frames the open note's subject with the card's side kept clear. Split out because the card
 * remeasures when the canvas resizes, and because it reads the DOM, which the store does not.
 */
export function frameNote(noteId: string): void {
  const store = useDocStore.getState();
  const note = findNote(store.doc, noteId);
  const diagram = store.doc.diagrams[note?.focus.diagramId ?? ""];
  if (!note || !diagram) return;
  const rect = litBounds(diagram, note);
  if (!rect) return;

  const bounds = document.querySelector('[data-testid="nd-canvas"]')?.getBoundingClientRect();
  const instance = getCanvasInstance();
  if (!bounds || !instance) return;

  // Too narrow for a card beside the diagram: it goes across the top, and the room comes out of
  // the height instead.
  if (bounds.width < NARROW_CANVAS) {
    revealRect(rect, 40, { bottomPx: PAGER_HEIGHT });
    return;
  }

  const viewport = instance.getViewport();
  // Where the lit box sits now, in canvas pixels, against the middle of the canvas.
  const litCentreX = (rect.x + rect.w / 2) * viewport.zoom + viewport.x;
  const side = cardSideFor(litCentreX, bounds.width / 2, bounds.width, store.ui.cardSide);
  if (side !== store.ui.cardSide) store.setCardSide(side);
  revealRect(rect, 40, { side, px: CARD_WIDTH + CARD_MARGIN * 2, bottomPx: PAGER_HEIGHT });
}
