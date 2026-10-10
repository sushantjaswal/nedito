import { useCallback, useEffect, useRef, useState } from "react";
import { saveDocument } from "../file/saveDocument";
import { useDocStore } from "../model/store";
import { BRAND } from "./brand";
import styles from "./LocalOnlyBadge.module.css";

// Permanent, always-available disclosure that this app never uploads anything — deliberately a
// badge rather than a first-run consent modal, so it stays discoverable forever instead of
// being clicked away once and forgotten, and never blocks someone from just drawing.
//
// Copy accuracy rule (docs/archive/onboarding-spec.md; D47): never claim the data is "secure", "encrypted" or
// "private by design". Browser storage is neither secure nor permanent. The honest, checkable
// claim is that nothing is uploaded — and the flip side, that clearing browser data destroys
// the work, is stated just as plainly. LocalOnlyBadge.test.tsx enforces this.
export function LocalOnlyBadge() {
  const [open, setOpen] = useState(false);
  const badgeRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  const close = useCallback((returnFocus: boolean) => {
    setOpen(false);
    if (returnFocus) badgeRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (popoverRef.current?.contains(target) || badgeRef.current?.contains(target)) return;
      close(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      // Focus goes back to the badge only on Esc: an outside click has already moved the user's
      // attention somewhere else, and yanking focus back would fight them.
      if (e.key === "Escape") close(true);
    };
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open, close]);

  const download = () => {
    saveDocument(useDocStore.getState().doc);
    useDocStore.getState().noteExport();
    close(true);
  };

  return (
    <div className={styles.wrapper}>
      <button
        ref={badgeRef}
        type="button"
        className={styles.badge}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((v) => !v)}
        title="How your data is stored"
        data-testid="nd-local-only-badge"
      >
        <span className={styles.lock} aria-hidden="true">
          🔒
        </span>
        Local only · nothing uploaded
      </button>

      {open && (
        <div
          ref={popoverRef}
          className={styles.popover}
          role="dialog"
          aria-label="How your data is stored"
          data-testid="nd-local-only-popover"
        >
          <h2 className={styles.title}>Your data never leaves this device</h2>
          <p className={styles.body}>
            {BRAND.name} runs entirely in your browser. There is no account, no server, and no copy of your diagram
            anywhere but here.
          </p>
          <ul className={styles.list}>
            <li>Clearing browser data will erase your work</li>
            <li>Download the {BRAND.fileExt} file to keep a real copy</li>
            <li>On a shared computer, export and clear when you&apos;re done</li>
          </ul>
          <button type="button" className={styles.download} onClick={download} data-testid="nd-local-only-download">
            Download a copy now
          </button>
        </div>
      )}
    </div>
  );
}
