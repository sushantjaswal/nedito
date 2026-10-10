// The one-time tip shown after a user's first PNG export (tutorial spec item L2, with L3's
// rider folded in).
//
// The moment matters more than the wording: someone exporting a PNG is about to paste a dead
// picture into a document, and that is the one instant where "the same picture, but it stays
// clickable" is worth saying. Said at any other time it is a feature tour; said here it is
// useful.
//
// Kept as a pure function of a snapshot for the same reason exportReminder.ts is: every
// interesting part is a rule about when to speak, and that should be testable without a canvas.
import type { DiagramDocument } from "../model/types";

export interface LiveLinkTipSnapshot {
  /** Already shown once, ever. */
  alreadyShown: boolean;
  /** Someone reading a shared link has nothing to export and no document of their own. */
  viewerMode: boolean;
  /** The coach marks are running; a second surface would talk over them. */
  tourInProgress: boolean;
}

export function shouldShowLiveLinkTip(s: LiveLinkTipSnapshot): boolean {
  return !s.alreadyShown && !s.viewerMode && !s.tourInProgress;
}

/** True when any diagram in the document has a nested block. */
export function documentHasNestedBlock(doc: DiagramDocument): boolean {
  return Object.values(doc.diagrams).some((d) => d.nodes.some((n) => n.type === "nested"));
}

/**
 * The tip's text. Two variants, because the PowerPoint line is only worth saying when the
 * document actually has something to zoom into — offered on a flat diagram it points at a
 * feature the user cannot see the value of.
 */
export function liveLinkTipMessage(hasNestedBlock: boolean): string {
  // Pointed at the Export menu since R2 (D91), where both commands now live.
  const base =
    "Tip: Export ▾ › Copy image with live link gives you the same picture, but it stays clickable in Word and PowerPoint.";
  return hasNestedBlock
    ? `${base} Or Export ▾ › PowerPoint, for slides that zoom into each nested block.`
    : base;
}
