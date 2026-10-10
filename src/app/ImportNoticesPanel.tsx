import { useCallback, useEffect } from "react";
import { getCanvasInstance } from "../canvas/canvasApi";
import type { ImportNotice } from "../file/importNotices";
import { useDocStore } from "../model/store";
import styles from "./ImportNoticesPanel.module.css";

// What a best-effort import changed, kept on screen until the user is done with it.
//
// draw.io itself says nothing when it cannot map something it opens; Nedito promises to say
// (CLAUDE.md: best-effort mapping). It used to say so in a window.alert, which could not be read
// again once dismissed and could not point at anything — "drew 12 shapes as plain rectangles"
// left the user hunting for twelve rectangles by eye. This panel stays until closed, and each
// notice can open its page and select the shapes it is about.

/** Waits for React Flow to have drawn `nodeId` after a page change, so fitting has something to fit. */
function whenDrawn(nodeId: string, then: () => void, deadline = Date.now() + 1500): void {
  if (document.querySelector(`.react-flow__node[data-id="${CSS.escape(nodeId)}"]`) || Date.now() > deadline) {
    then();
    return;
  }
  requestAnimationFrame(() => whenDrawn(nodeId, then, deadline));
}

export function ImportNoticesPanel() {
  const notices = useDocStore((s) => s.ui.importNotices);
  const diagrams = useDocStore((s) => s.doc.diagrams);
  const dismiss = useDocStore((s) => s.dismissImportNotices);

  // A notice about a page that has since been deleted has nothing left to show.
  const live = (notices ?? []).filter((n) => diagrams[n.diagramId]);

  const show = useCallback((notice: ImportNotice) => {
    const store = useDocStore.getState();
    store.navigateToDiagram(notice.diagramId);
    if (notice.nodeIds.length === 0) return;
    // Only the ones still there: the user may have deleted some since the import.
    const present = notice.nodeIds.filter((id) => store.doc.diagrams[notice.diagramId]?.nodes.some((n) => n.id === id));
    if (present.length === 0) return;
    useDocStore.getState().setSelection(present);
    whenDrawn(present[0], () => {
      void getCanvasInstance()?.fitView({ nodes: present.map((id) => ({ id })), duration: 250, padding: 0.4, maxZoom: 1 });
    });
  }, []);

  useEffect(() => {
    if (!live.length) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") dismiss();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [live.length, dismiss]);

  if (!live.length) return null;

  return (
    <section className={styles.panel} role="region" aria-label="Import notes" data-testid="nd-import-notices">
      <header className={styles.header}>
        <h2 className={styles.title}>Imported, with changes</h2>
        <button
          type="button"
          className={styles.close}
          onClick={dismiss}
          aria-label="Close import notes"
          data-testid="nd-import-notices-close"
        >
          ×
        </button>
      </header>
      <p className={styles.intro}>
        {live.length === 1 ? "One thing" : `${live.length} things`} didn&apos;t come across exactly. Everything else did.
      </p>
      <ul className={styles.list}>
        {live.map((notice, i) => (
          <li key={`${notice.diagramId}-${i}`} className={styles.item}>
            <span className={styles.message}>{notice.message}</span>
            <button
              type="button"
              className={styles.show}
              onClick={() => show(notice)}
              data-testid={`nd-import-notice-show-${i}`}
            >
              {notice.nodeIds.length ? "Show" : "Open page"}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
