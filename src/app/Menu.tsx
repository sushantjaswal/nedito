// The top bar's dropdown menus — the app menu and the Export menu since R2 (D91). Opens on click;
// closes on a click outside, on Esc (handing focus back to its trigger) or when an item runs. Keyboard
// use follows the WAI-ARIA menu pattern: opening moves focus to the first item, Up/Down move between
// items, Home/End jump to the ends.
import { useEffect, useRef, useState, type ReactNode } from "react";
import styles from "./Menu.module.css";

interface MenuProps {
  /** What the trigger shows. */
  trigger: ReactNode;
  /** The trigger's accessible name, when what it shows is not text enough. */
  triggerLabel?: string;
  triggerClassName?: string;
  testId: string;
  align?: "left" | "right";
  /** A counter: each increase opens the menu (the tour's "Show me" uses it). */
  openRequest?: number;
  children: (close: () => void) => ReactNode;
}

export function Menu({ trigger, triggerLabel, triggerClassName, testId, align = "left", openRequest, children }: MenuProps) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (openRequest) setOpen(true);
  }, [openRequest]);

  useEffect(() => {
    if (!open) return;
    const items = () => Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>('[role^="menuitem"]:not(:disabled)') ?? []);
    requestAnimationFrame(() => items()[0]?.focus());
    const onPointerDown = (e: PointerEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        setOpen(false);
        triggerRef.current?.focus();
        return;
      }
      const list = items();
      const at = list.indexOf(document.activeElement as HTMLButtonElement);
      const to =
        e.key === "ArrowDown" ? (at + 1) % list.length : e.key === "ArrowUp" ? (at - 1 + list.length) % list.length : e.key === "Home" ? 0 : e.key === "End" ? list.length - 1 : -1;
      if (to >= 0 && list.length > 0) {
        e.preventDefault();
        list[to].focus();
      }
    };
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown, true);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown, true);
    };
  }, [open]);

  const close = () => setOpen(false);

  return (
    <div className={styles.wrapper} ref={wrapperRef}>
      <button
        ref={triggerRef}
        type="button"
        className={triggerClassName ?? styles.trigger}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={triggerLabel}
        data-testid={testId}
      >
        {trigger}
      </button>
      {open && (
        <div ref={menuRef} className={align === "right" ? `${styles.menu} ${styles.alignRight}` : styles.menu} role="menu" data-testid={`${testId}-content`}>
          {children(close)}
        </div>
      )}
    </div>
  );
}

interface MenuItemProps {
  label: ReactNode;
  shortcut?: string;
  disabled?: boolean;
  checked?: boolean;
  highlighted?: boolean;
  onSelect: () => void;
  testId?: string;
}

export function MenuItem({ label, shortcut, disabled, checked, highlighted, onSelect, testId }: MenuItemProps) {
  return (
    <button
      type="button"
      role={checked === undefined ? "menuitem" : "menuitemcheckbox"}
      aria-checked={checked}
      className={highlighted ? `${styles.item} ${styles.highlight}` : styles.item}
      disabled={disabled}
      onClick={onSelect}
      data-testid={testId}
      style={{ display: "flex", justifyContent: "space-between", gap: 12, opacity: disabled ? 0.45 : 1 }}
    >
      <span>
        {checked !== undefined && (checked ? "✓ " : "  ")}
        {label}
      </span>
      {shortcut && <span style={{ opacity: 0.6, fontSize: 11 }}>{shortcut}</span>}
    </button>
  );
}

export function MenuDivider() {
  return <div className={styles.divider} role="separator" />;
}

export function MenuHeading({ children }: { children: ReactNode }) {
  return <div className={styles.heading}>{children}</div>;
}
