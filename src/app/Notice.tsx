import { useEffect, useRef, useState } from "react";
import { saveDocument } from "../file/saveDocument";
import { copyImageWithLiveLink } from "../share/copyImageLink";
import { useDocStore } from "../model/store";
import styles from "./Notice.module.css";

// A short, dismissible message about something the user just did — "copied", "too large for a
// link", "the clipboard was blocked". Deliberately not a modal: none of these need an answer
// before the user can carry on working.
//
// It can carry a URL, because the honest failure mode for "copy link to clipboard" is the
// browser refusing, and telling someone their link exists but not showing it would be useless.
export function Notice() {
  const notice = useDocStore((s) => s.ui.notice);
  const dismiss = useDocStore((s) => s.dismissNotice);
  const [copied, setCopied] = useState(false);
  const urlRef = useRef<HTMLInputElement>(null);

  // Auto-dismiss only when there is nothing to act on. A notice carrying a URL or a button is
  // the user's only route to that thing, so taking it away on a timer would be hostile.
  const selfDismissing = Boolean(notice) && !notice?.url && !notice?.action;
  useEffect(() => {
    if (!selfDismissing) return;
    const timer = window.setTimeout(dismiss, 6000);
    return () => window.clearTimeout(timer);
  }, [selfDismissing, notice, dismiss]);

  useEffect(() => setCopied(false), [notice]);

  if (!notice) return null;

  const copyUrl = async () => {
    const input = urlRef.current;
    if (!input) return;
    input.select();
    try {
      await navigator.clipboard.writeText(notice.url ?? "");
      setCopied(true);
    } catch {
      // The selection above is the fallback: Ctrl+C still works even when the API is blocked,
      // which is the exact situation that produced most of these notices in the first place.
      setCopied(false);
    }
  };

  const runAction = async () => {
    const store = useDocStore.getState();
    if (notice.action === "download-doc") {
      saveDocument(store.doc);
      store.noteExport();
      dismiss();
      return;
    }
    if (notice.action === "copy-live-link") {
      const outcome = await copyImageWithLiveLink(store.doc, store.doc.diagrams[store.currentDiagramId()]);
      // Replaces this notice rather than closing it: a "Try it" that silently does nothing
      // visible is worse than no button. Success or refusal, the user is told which.
      store.showNotice(
        outcome.ok
          ? { message: "Copied. Paste it into Word or PowerPoint to try it.", tone: "info" }
          : { message: outcome.error ?? "Couldn't copy the image.", tone: "warn", url: outcome.url },
      );
      return;
    }
    dismiss();
  };

  const ACTION_LABELS: Record<NonNullable<typeof notice.action>, string> = {
    "download-doc": "Download the file instead",
    "copy-live-link": "Try it",
  };

  return (
    <div
      className={`${styles.notice} ${notice.tone === "warn" ? styles.warn : ""}`}
      role="status"
      aria-live="polite"
      data-testid="nd-notice"
    >
      <button
        type="button"
        className={styles.close}
        onClick={dismiss}
        aria-label="Dismiss"
        data-testid="nd-notice-close"
      >
        ✕
      </button>
      <p className={styles.message}>{notice.message}</p>

      {notice.url && (
        <div className={styles.urlRow}>
          <input
            ref={urlRef}
            className={styles.url}
            value={notice.url}
            readOnly
            onFocus={(e) => e.target.select()}
            aria-label="Share link"
            data-testid="nd-notice-url"
          />
          <button type="button" className={styles.copy} onClick={copyUrl} data-testid="nd-notice-copy">
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
      )}

      {notice.action && (
        <button
          type="button"
          className={styles.action}
          onClick={() => void runAction()}
          data-testid="nd-notice-action"
        >
          {ACTION_LABELS[notice.action]}
        </button>
      )}
    </div>
  );
}
