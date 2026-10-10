// The Help menu's actions, now reached from the app menu and the command palette (R2, D91).
import { useDocStore } from "../model/store";
import { buildDemoDoc } from "../onboarding/demoDiagram";
import { BRAND } from "./brand";

/**
 * The tour walks through a nested box, so it needs one to point at. On a page that has one it
 * starts there; on an empty canvas it brings in the sample (and starts once the sample has
 * painted, as on a first visit); on someone's own diagram it explains rather than replacing their
 * work with the sample — starting the tour with nothing to point at just ended it at once.
 */
export function startQuickTour(): void {
  const s = useDocStore.getState();
  const page = s.doc.diagrams[s.navStack[0]];
  if (page?.nodes.some((n) => n.type === "nested")) {
    s.setTourStep(1);
    return;
  }
  const empty = Object.values(s.doc.diagrams).every((d) => d.nodes.length === 0 && d.edges.length === 0);
  if (empty) {
    s.setTourStep(0);
    s.startDemo(buildDemoDoc());
    return;
  }
  s.showNotice({
    tone: "info",
    message: `The quick tour walks through the sample diagram. Start a new diagram (${BRAND.name} menu › New), then choose Take the tour.`,
  });
}

/** Opens the About dialog (N4, app/AboutDialog.tsx). */
export function showAbout(): void {
  useDocStore.getState().setAboutOpen(true);
}
