import { DiagramCanvas } from "../canvas/DiagramCanvas";
import { Breadcrumbs } from "../app/Breadcrumbs";
import { BRAND } from "../app/brand";
import { BrandMark } from "../app/BrandMark";
import { PageTabStrip } from "../app/PageTabStrip";
import { saveDocument } from "../file/saveDocument";
import { useDocStore } from "../model/store";
import { useSyncTheme } from "../app/useSyncTheme";
import { hasMotion } from "../model/motion";
import { useSyncMotion } from "../app/useSyncMotion";
import styles from "./ViewerShell.module.css";
import { useViewerShortcuts } from "./useViewerShortcuts";

interface ViewerShellProps {
  /** Hands the shared document over to the full editor. See App.tsx for the confirm step. */
  onEditCopy: () => void;
}

// Read-only view of a diagram opened from a share link.
//
// It renders INSTEAD OF AppShell, which is the real guarantee behind "opening someone's link
// never touches your own work": the autosave hook, the restore prompt and the first-visit
// sample are all mounted by AppShell, so none of them exist here. A flag checked inside those
// hooks would have been one forgotten early-return away from overwriting a stranger's diagram.
//
// Pan, zoom, page switching and the full nesting drill-down all work — the point of sharing a
// nested diagram is that the reader can open the boxes.
export function ViewerShell({ onEditCopy }: ViewerShellProps) {
  useViewerShortcuts();
  // A reader who runs the app in dark mode should get a dark viewer; the preference is read
  // from their own localStorage at store init and only reaches the DOM through this hook,
  // which normally lives in AppShell.
  useSyncTheme();
  useSyncMotion();
  const doc = useDocStore((s) => s.doc);
  const multiPage = useDocStore((s) => s.doc.rootDiagramIds.length > 1);
  // The reader's own say over the author's motion (D116): shown only when there is motion.
  const hasMotionHere = useDocStore((s) => hasMotion(s.doc));
  const motionEnabled = useDocStore((s) => s.ui.motionEnabled);
  const setMotionEnabled = useDocStore((s) => s.setMotionEnabled);

  return (
    <div className={styles.shell} data-testid="nd-viewer-shell">
      <header className={styles.strip}>
        <span className={styles.brand}>
          <BrandMark className={styles.brandMark} />
          {BRAND.name}
        </span>
        <span className={styles.readOnly} data-testid="nd-viewer-readonly">
          <span className={styles.dot} aria-hidden="true" />
          Viewing a shared diagram · read-only
        </span>
        <Breadcrumbs />
        <div className={styles.actions}>
          {hasMotionHere && (
            <button
              type="button"
              className={styles.button}
              aria-pressed={motionEnabled}
              onClick={() => setMotionEnabled(!motionEnabled)}
              title={motionEnabled ? "Stop the diagram's motion" : "Play the diagram's motion"}
              data-testid="nd-viewer-motion"
            >
              {motionEnabled ? "Motion on" : "Motion off"}
            </button>
          )}
          <button
            type="button"
            className={styles.button}
            onClick={() => saveDocument(doc)}
            data-testid="nd-viewer-download"
          >
            Download {BRAND.fileExt}
          </button>
          <button
            type="button"
            className={`${styles.button} ${styles.buttonPrimary}`}
            onClick={onEditCopy}
            data-testid="nd-viewer-edit-copy"
          >
            Edit a copy
          </button>
        </div>
      </header>
      <div className={styles.canvas}>
        <DiagramCanvas />
      </div>
      {/* Only worth the row when there is actually a choice of pages to make. */}
      <div className={styles.footer}>{multiPage && <PageTabStrip />}</div>
    </div>
  );
}

/**
 * Shown when a link cannot be read. Deliberately a full page rather than a toast over an empty
 * canvas: the reader followed a link expecting a diagram, and the honest answer is that there
 * isn't one, plus the one thing they can do about it.
 */
export function ShareErrorCard({ message, onStartFresh }: { message: string; onStartFresh: () => void }) {
  return (
    <div className={styles.centred}>
      <div className={styles.card} data-testid="nd-share-error">
        <h1 className={styles.cardTitle}>This shared diagram couldn&rsquo;t be opened</h1>
        <p className={styles.cardBody}>{message}</p>
        <p className={styles.cardBody}>
          Links carry the whole diagram inside them, so a link that was shortened, wrapped onto two lines by a
          mail client, or only partly copied can&rsquo;t be recovered here. Ask whoever sent it for the link
          again, or for the {BRAND.fileExt} file.
        </p>
        <div className={styles.cardActions}>
          <button
            type="button"
            className={styles.cardButton}
            onClick={onStartFresh}
            data-testid="nd-share-error-dismiss"
          >
            Open {BRAND.name}
          </button>
        </div>
      </div>
    </div>
  );
}

/** The brief moment between "this is a share link" and having a document to show. */
export function ShareLoading() {
  return (
    <div className={styles.centred}>
      <span className={styles.loading} data-testid="nd-share-loading">
        Opening shared diagram&hellip;
      </span>
    </div>
  );
}
