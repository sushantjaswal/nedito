// The command palette (Ctrl+K, or the "Search or run a command" button): every command the app has,
// filtered as you type and run with Enter — and every named shape and Nested Block in the document,
// at any page or level, which it jumps to. With the menu bar gone this
// is where Edit, View and Arrange live, so nothing the menus offered is out of reach.
import { useEffect, useMemo, useRef, useState } from "react";
import { useDocStore } from "../model/store";
import { noteEntries } from "../notes/noteNavigation";
import { openNoteAndReveal } from "../notes/revealNote";
import { goToNode, namedNodes } from "./goTo";
import { getCommands, type Command } from "./commands";
import styles from "./CommandPalette.module.css";

interface Item {
  key: string;
  label: string;
  group: string;
  shortcut?: string;
  disabled?: boolean;
  checked?: boolean;
  run: () => void | Promise<void>;
}

const MAX_GOTO = 20;

/** Does every word of the query appear somewhere in the item's text? */
function matches(query: string, ...texts: (string | undefined)[]): boolean {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const haystack = texts.filter(Boolean).join(" ").toLowerCase();
  return words.every((w) => haystack.includes(w));
}

export function CommandPalette() {
  const open = useDocStore((s) => s.ui.paletteOpen);
  const setOpen = useDocStore((s) => s.setPaletteOpen);
  const doc = useDocStore((s) => s.doc);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);

  // Opening starts fresh and remembers where focus was, to hand it back on close.
  useEffect(() => {
    if (!open) return;
    returnFocus.current = document.activeElement as HTMLElement | null;
    setQuery("");
    setActive(0);
    requestAnimationFrame(() => inputRef.current?.focus());
    return () => returnFocus.current?.focus?.();
  }, [open]);

  const items = useMemo<Item[]>(() => {
    if (!open) return [];
    const commands = getCommands()
      .filter((c: Command) => matches(query, c.label, c.group, ...(c.keywords ?? [])))
      .map((c) => ({ key: c.id, label: c.label, group: c.group, shortcut: c.shortcut, disabled: c.disabled, checked: c.checked, run: c.run }));
    if (!query.trim()) return commands;
    const places = namedNodes(doc)
      .filter((n) => matches(query, n.name))
      .slice(0, MAX_GOTO)
      .map((n) => ({
        key: `goto:${n.nodeId}`,
        label: `Go to: ${n.name}`,
        group: n.nested ? `Nested Block · ${n.where}` : `In ${n.where}`,
        run: () => goToNode(n.diagramId, n.nodeId),
      }));
    // Notes are findable by what they say, not only by the shape they are attached to: the words
    // someone remembers are usually the note's, which is the whole reason they wrote it down.
    const notes = noteEntries(doc)
      .filter((e) => matches(query, e.title, e.note.body))
      .slice(0, MAX_GOTO)
      .map((e) => ({
        key: `note:${e.note.id}`,
        label: `Note: ${e.title}`,
        group: `On ${e.levelTitle}`,
        run: () => openNoteAndReveal(e.note.id),
      }));
    // A name typed in full is most likely a place to go; a verb is most likely a command.
    return [...commands, ...places, ...notes];
  }, [open, query, doc]);

  useEffect(() => setActive(0), [query]);
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView?.({ block: "nearest" });
  }, [active]);

  if (!open) return null;

  const close = () => setOpen(false);
  const runAt = (index: number) => {
    const item = items[index];
    if (!item || item.disabled) return;
    close();
    void item.run();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(items.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      runAt(active);
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      close();
    }
  };

  return (
    <div className={styles.veil} onPointerDown={(e) => e.target === e.currentTarget && close()} data-testid="nd-command-palette-veil">
      <div className={styles.palette} role="dialog" aria-modal="true" aria-label="Command palette" data-testid="nd-command-palette">
        <input
          ref={inputRef}
          className={styles.input}
          placeholder="Search commands, or the shapes in your diagram"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
          role="combobox"
          aria-expanded="true"
          aria-controls="nd-palette-list"
          aria-activedescendant={items[active] ? `nd-palette-item-${active}` : undefined}
          aria-label="Search commands"
          data-testid="nd-command-input"
        />
        <div ref={listRef} className={styles.list} id="nd-palette-list" role="listbox" aria-label="Commands">
          {items.length === 0 ? (
            <div className={styles.empty}>Nothing matches “{query}”.</div>
          ) : (
            items.map((item, i) => (
              <div
                key={item.key}
                id={`nd-palette-item-${i}`}
                role="option"
                aria-selected={i === active}
                aria-disabled={item.disabled || undefined}
                data-index={i}
                data-testid={`nd-command-${item.key}`}
                className={[styles.item, i === active ? styles.active : "", item.disabled ? styles.disabled : ""].join(" ")}
                onPointerMove={() => setActive(i)}
                onClick={() => runAt(i)}
              >
                <span className={styles.label}>
                  {item.checked !== undefined && <span className={styles.check}>{item.checked ? "✓" : ""}</span>}
                  {item.label}
                </span>
                <span className={styles.meta}>
                  {item.shortcut && <kbd className={styles.kbd}>{item.shortcut}</kbd>}
                  <span className={styles.group}>{item.group}</span>
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
