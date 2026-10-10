// What an import that worked, but changed something along the way, tells the user.
//
// "Best-effort" import (CLAUDE.md) has to mean *stated* effort: a diagram that came across with
// six shapes quietly turned into rectangles, and no mention of it, is the failure this exists to
// prevent. It used to be said in a `window.alert` — honest and unmissable, but it vanished the
// moment it was dismissed and could not point at anything, so a user told "drew 12 shapes as
// plain rectangles" then had to hunt for twelve rectangles by eye.
//
// So each notice now carries where it applies and which nodes it is about, and the panel
// (app/ImportNoticesPanel.tsx) can take the user to them.

export interface ImportNotice {
  /** The page (a root diagram of the imported document) this notice is about. */
  diagramId: string;
  /** One sentence, already written for a person to read. */
  message: string;
  /**
   * The nodes the notice is about, for "Show". Empty when nothing survived to point at — a
   * connection skipped for having no shape at one end, say — in which case "Show" opens the page.
   */
  nodeIds: string[];
}
