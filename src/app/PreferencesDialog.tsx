// Preferences, from the app menu (R2, CLAUDE_HISTORY.md D91). For now one setting — dark mode,
// which was View ▸ Dark Mode — with room for more. Each is a per-browser preference, never part of
// a document.
import { useEffect, useRef } from "react";
import { useDocStore } from "../model/store";
import styles from "./PreferencesDialog.module.css";

export function PreferencesDialog() {
  const open = useDocStore((s) => s.ui.preferencesOpen);
  const setOpen = useDocStore((s) => s.setPreferencesOpen);
  const darkMode = useDocStore((s) => s.ui.darkMode);
  const toggleDarkMode = useDocStore((s) => s.toggleDarkMode);
  const motionEnabled = useDocStore((s) => s.ui.motionEnabled);
  const setMotionEnabled = useDocStore((s) => s.setMotionEnabled);
  const firstRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const back = document.activeElement as HTMLElement | null;
    requestAnimationFrame(() => firstRef.current?.focus());
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopPropagation();
      setOpen(false);
    };
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      back?.focus?.();
    };
  }, [open, setOpen]);

  if (!open) return null;

  return (
    <div className={styles.overlay} onPointerDown={(e) => e.target === e.currentTarget && setOpen(false)}>
      <div className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby="nd-preferences-title" data-testid="nd-preferences-dialog">
        <h2 id="nd-preferences-title" className={styles.title}>
          Preferences
        </h2>
        <label className={styles.row}>
          <input ref={firstRef} type="checkbox" checked={darkMode} onChange={toggleDarkMode} data-testid="nd-pref-dark" />
          <span>
            Dark mode
            <span className={styles.hint}>The editor's chrome and canvas. Shapes keep their own colours.</span>
          </span>
        </label>
        <label className={styles.row}>
          <input type="checkbox" checked={motionEnabled} onChange={(e) => setMotionEnabled(e.target.checked)} data-testid="nd-pref-motion" />
          <span>
            Play diagram motion
            <span className={styles.hint}>Flowing lines and pulsing shapes. Off, they rest still. Your system's reduced-motion setting always wins.</span>
          </span>
        </label>
        <div className={styles.footer}>
          <button type="button" className={styles.done} onClick={() => setOpen(false)}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
