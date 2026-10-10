// The deletion prompts: asked only when a deletion would take a
// level's contents or a parent's links with it. Esc or Cancel keeps everything; the choice taken
// is one undo entry either way, which the dialog says.
import { useEffect, useRef } from "react";
import { useDocStore, type DeleteChoice } from "../model/store";
import styles from "./DeletePromptDialog.module.css";

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function DeletePromptDialog() {
  const prompt = useDocStore((s) => s.ui.deletePrompt);
  const resolve = useDocStore((s) => s.resolveDeletePrompt);
  const dialogRef = useRef<HTMLDivElement>(null);
  const firstRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!prompt) return;
    const back = document.activeElement as HTMLElement | null;
    requestAnimationFrame(() => firstRef.current?.focus());
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        resolve("cancel");
        return;
      }
      if (e.key === "Tab" && dialogRef.current) {
        const items = [...dialogRef.current.querySelectorAll<HTMLElement>("button")];
        const first = items[0];
        const last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      back?.focus?.();
    };
  }, [prompt, resolve]);

  if (!prompt) return null;

  const blocks = prompt.blocks.length > 0;
  const shapes = prompt.blocks.reduce((n, b) => n + b.shapes, 0);
  const links = prompt.mapped.reduce((n, m) => n + m.links, 0);
  const title = blocks
    ? prompt.blocks.length === 1
      ? `Delete “${prompt.blocks[0].name}”?`
      : `Delete ${prompt.blocks.length} Nested Blocks?`
    : prompt.mapped.length === 1
      ? `Delete “${prompt.mapped[0].name}”?`
      : `Delete ${prompt.mapped.length} shapes?`;
  const body = blocks
    ? `${prompt.blocks.length === 1 ? "It holds" : "They hold"} ${plural(shapes, "shape")}. Delete ${shapes === 1 ? "it" : "them"} too, or keep ${shapes === 1 ? "it" : "them"} here, where the block ${prompt.blocks.length === 1 ? "was" : "were"}.`
    : `${plural(links, "link")} from the level above ${links === 1 ? "enters" : "enter"} here through ${prompt.mapped.length === 1 ? "it" : "them"}. Keep ${links === 1 ? "it" : "them"} waiting to be linked to another shape, or remove ${links === 1 ? "it" : "them"} too.`;
  const choices: { id: DeleteChoice; label: string; danger?: boolean }[] = blocks
    ? [
        { id: "keep-contents", label: "Keep the contents here" },
        { id: "delete-all", label: "Delete everything", danger: true },
      ]
    : [
        { id: "keep-waiting", label: links === 1 ? "Keep the link waiting" : "Keep the links waiting" },
        { id: "remove-links", label: links === 1 ? "Remove the link too" : "Remove the links too", danger: true },
      ];

  return (
    <div className={styles.overlay} onPointerDown={(e) => e.target === e.currentTarget && resolve("cancel")}>
      <div
        ref={dialogRef}
        className={styles.dialog}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="nd-delete-title"
        aria-describedby="nd-delete-body"
        data-testid="nd-delete-prompt"
      >
        <h2 id="nd-delete-title" className={styles.title}>
          {title}
        </h2>
        <p id="nd-delete-body" className={styles.body}>
          {body}
        </p>
        <p className={styles.note}>Undo brings it all back, whichever you choose.</p>
        <div className={styles.actions}>
          {choices.map((c, i) => (
            <button
              key={c.id}
              ref={i === 0 ? firstRef : undefined}
              type="button"
              className={c.danger ? `${styles.button} ${styles.danger}` : `${styles.button} ${styles.primary}`}
              onClick={() => resolve(c.id)}
              data-testid={`nd-delete-${c.id}`}
            >
              {c.label}
            </button>
          ))}
          <button type="button" className={styles.button} onClick={() => resolve("cancel")} data-testid="nd-delete-cancel">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
