// Keeps the system clipboard honest about what Nedito last copied.
//
// Shapes are copied to an in-app clipboard, but Ctrl+V now also accepts an image copied in
// another app. Without this, a screenshot left on the system clipboard from earlier would win
// over shapes the user had just copied here. So copying shapes also replaces the system
// clipboard's contents with a plain-text marker of
// its own — and Ctrl+V pastes an image only when the system clipboard really holds one.
import { BRAND } from "./brand";

export const SHAPES_MARKER = `${BRAND.name} shapes`;

/** For copy/cut events: overwrite the system clipboard with the marker. */
export function markShapesInEvent(e: ClipboardEvent): void {
  e.clipboardData?.setData("text/plain", SHAPES_MARKER);
  e.preventDefault();
}

/** For menu Copy/Cut, which have no clipboard event: best effort, never an error. */
export function markShapesOnSystemClipboard(): void {
  navigator.clipboard?.writeText(SHAPES_MARKER).catch(() => {});
}
