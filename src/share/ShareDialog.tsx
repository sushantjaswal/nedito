import { useCallback, useEffect, useRef, useState } from "react";
import { BRAND } from "../app/brand";
import { useDocStore } from "../model/store";
import { createShareLink, formatShareSize, type ShareSizeLevel } from "./urlCodec";
import styles from "./ShareDialog.module.css";

// The share link dialog: the share link on its own, for when an image isn't
// what's wanted.
//
// Copy accuracy rule, inherited from docs/archive/onboarding-spec.md and enforced by a test: never say
// "secure", "encrypted" or "private". The true and checkable claim is that nothing is uploaded
// — the diagram travels inside the link itself.
export function ShareDialog() {
  const open = useDocStore((s) => s.ui.shareDialogOpen);
  const closeDialog = useDocStore((s) => s.closeShareDialog);

  const [openAtLevel, setOpenAtLevel] = useState(false);
  const [state, setState] = useState<{ url: string; chars: number; level: ShareSizeLevel } | null>(null);
  const [building, setBuilding] = useState(false);
  const [copied, setCopied] = useState(false);
  const urlRef = useRef<HTMLInputElement>(null);

  // How deep the sharer currently is. The checkbox is only meaningful below the top level —
  // "open at this level" when you are already at the top means nothing.
  const navStack = useDocStore((s) => s.navStack);
  const currentDiagramId = navStack[navStack.length - 1];
  const nested = navStack.length > 1;

  useEffect(() => {
    if (!open) {
      setState(null);
      setCopied(false);
      setOpenAtLevel(false);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setBuilding(true);
    void (async () => {
      const { doc } = useDocStore.getState();
      const link = await createShareLink(doc, undefined, {
        openAtDiagramId: openAtLevel && nested ? currentDiagramId : undefined,
      });
      if (cancelled) return;
      setState({ url: link.url, chars: link.chars, level: link.level });
      setBuilding(false);
      setCopied(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [open, openAtLevel, nested, currentDiagramId]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeDialog();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, closeDialog]);

  const copy = useCallback(async () => {
    const input = urlRef.current;
    if (!input || !state) return;
    // Select first, unconditionally: when the clipboard API is blocked this is what leaves
    // Ctrl+C working instead of leaving the user stuck.
    input.select();
    try {
      await navigator.clipboard.writeText(state.url);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }, [state]);

  if (!open) return null;

  const tooLarge = state?.level === "too-large";

  return (
    <div className={styles.backdrop} onPointerDown={(e) => e.target === e.currentTarget && closeDialog()}>
      <div
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-label="Share this diagram"
        data-testid="nd-share-dialog"
      >
        <div className={styles.header}>
          <h2 className={styles.title}>Share this diagram</h2>
          <button
            type="button"
            className={styles.close}
            onClick={closeDialog}
            aria-label="Close"
            data-testid="nd-share-dialog-close"
          >
            ✕
          </button>
        </div>

        {tooLarge ? (
          <p className={styles.tooLarge} data-testid="nd-share-too-large">
            This diagram is too big to travel inside a link ({formatShareSize(state.chars)}). Send the {BRAND.fileExt}{" "}
            file instead — Save a copy, in the {BRAND.name} menu (Ctrl+S).
          </p>
        ) : (
          <>
            <div className={styles.urlRow}>
              <input
                ref={urlRef}
                className={styles.url}
                value={building || !state ? "Building link…" : state.url}
                readOnly
                onFocus={(e) => e.target.select()}
                aria-label="Share link"
                data-testid="nd-share-url"
              />
              <button
                type="button"
                className={styles.copy}
                onClick={copy}
                disabled={building || !state}
                data-testid="nd-share-copy"
              >
                {copied ? "Copied" : "Copy"}
              </button>
            </div>

            {state && (
              <p
                className={`${styles.size} ${state.level === "warn" ? styles.sizeWarn : ""}`}
                data-testid="nd-share-size"
              >
                {formatShareSize(state.chars)}
                {state.level === "warn" && " — long links are sometimes cut short by mail clients and chat apps."}
              </p>
            )}
          </>
        )}

        {nested && (
          <label className={styles.checkbox}>
            <input
              type="checkbox"
              checked={openAtLevel}
              onChange={(e) => setOpenAtLevel(e.target.checked)}
              data-testid="nd-share-open-at-level"
            />
            Open at this level
            <span className={styles.hint}>The reader lands on the box you have open, not on page one.</span>
          </label>
        )}

        <p className={styles.privacy} data-testid="nd-share-privacy">
          This link contains the whole diagram. Nothing is uploaded — the data travels inside the link itself.
        </p>
      </div>
    </div>
  );
}
