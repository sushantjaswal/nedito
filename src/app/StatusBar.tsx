import { useSyncExternalStore } from "react";
import { isAutosaveWorking, subscribeAutosave } from "../file/autosave";
import { useDocStore } from "../model/store";
import { LocalOnlyBadge } from "./LocalOnlyBadge";
import styles from "./StatusBar.module.css";

// The app's status bar: local-only disclosure on the left, the diagram being viewed on the
// right. Added with the first-visit flow because the disclosure needed a permanent home that
// wasn't the page-tab row — it previously sat among the tabs, which read as if it were a tab.
// No zoom here (D108): the zoom bar's slider and percentage sit directly above and are what
// people use, so a second readout only repeated it.
export function StatusBar() {
  const title = useDocStore((s) => s.doc.diagrams[s.currentDiagramId()]?.title ?? "");
  // Stays up until an autosave succeeds again — a toast alone is too easy to miss (D79).
  const autosaveWorking = useSyncExternalStore(subscribeAutosave, isAutosaveWorking, isAutosaveWorking);

  return (
    <div className={styles.bar} data-testid="nd-status-bar">
      <LocalOnlyBadge />
      {!autosaveWorking && (
        <span
          className={styles.autosaveOff}
          role="status"
          data-testid="nd-autosave-off"
          title="This diagram is too big for browser storage, so recent changes are not autosaved. Save the file to keep your work."
        >
          ⚠ Autosave off — save the file
        </span>
      )}
      <span className={styles.context} data-testid="nd-status-context">
        {title}
      </span>
    </div>
  );
}
