import { useState } from "react";
import { downloadText } from "../file/download";
import { toFilename } from "../file/saveDocument";
import { BRAND } from "./brand";
import { acknowledgeMove, localAutosave } from "./originGuard";
import styles from "./MovedNotice.module.css";

/**
 * Shown instead of a redirect on an alias host that holds the visitor's own work (originGuard.ts,
 * D100): this address's browser storage cannot be read from the new one, so going straight on
 * would land them on an empty canvas with their diagram left behind. They download it first —
 * then open that file at the new address — or knowingly go on without it.
 */
export function MovedNotice({ to }: { to: string }) {
  const [downloaded, setDownloaded] = useState(false);

  const download = () => {
    const text = localAutosave(localStorage);
    if (!text) return;
    let title = "diagram";
    try {
      title = (JSON.parse(text) as { meta?: { title?: string } }).meta?.title || title;
    } catch {
      // an unreadable autosave is downloaded as it is, under a plain name
    }
    downloadText(text, toFilename(title, BRAND.fileExt), "application/json");
    setDownloaded(true);
  };

  const go = () => {
    if (
      !downloaded &&
      !window.confirm(`Go to ${BRAND.host} without your diagram? It stays in this browser at ${window.location.host} only.`)
    ) {
      return;
    }
    acknowledgeMove();
    window.location.replace(to);
  };

  return (
    <div className={styles.veil}>
      <div className={styles.card} role="alertdialog" aria-modal="true" aria-labelledby="nd-moved-title" aria-describedby="nd-moved-body" data-testid="nd-moved-notice">
        <h2 id="nd-moved-title" className={styles.title}>
          {BRAND.name} has moved to {BRAND.host}
        </h2>
        <p id="nd-moved-body" className={styles.body}>
          Your unsaved diagram is kept by this browser at <strong>{window.location.host}</strong>, and {BRAND.host} can't read it
          from there. Download it first, then open the file at {BRAND.host}.
        </p>
        <div className={styles.actions}>
          <button type="button" className={styles.primary} onClick={download} autoFocus data-testid="nd-moved-download">
            {downloaded ? "Downloaded — download again" : "Download my diagram"}
          </button>
          <button type="button" className={styles.secondary} onClick={go} data-testid="nd-moved-continue">
            Continue to {BRAND.host}
          </button>
        </div>
      </div>
    </div>
  );
}
