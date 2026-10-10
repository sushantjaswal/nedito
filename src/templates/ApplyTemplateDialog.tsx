import { useCallback, useEffect, useState } from "react";
import { useDocStore } from "../model/store";
import { loadTemplate } from "./registry";
import styles from "./ApplyTemplateDialog.module.css";

// Shown only when the active page already has content. An empty page takes the template
// directly — asking a question whose answer is obvious is just a click in the way.
export function ApplyTemplateDialog() {
  const pendingId = useDocStore((s) => s.ui.pendingTemplateId);
  const dismiss = useDocStore((s) => s.dismissTemplatePlacement);
  const [name, setName] = useState("");

  useEffect(() => {
    if (!pendingId) return;
    let cancelled = false;
    void loadTemplate(pendingId).then((t) => {
      if (!cancelled && t) setName(t.name);
    });
    return () => {
      cancelled = true;
    };
  }, [pendingId]);

  useEffect(() => {
    if (!pendingId) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") dismiss();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [pendingId, dismiss]);

  const apply = useCallback(
    async (mode: "new-page" | "replace-page") => {
      if (!pendingId) return;
      const template = await loadTemplate(pendingId);
      if (template) useDocStore.getState().applyTemplate(template.doc, mode);
    },
    [pendingId],
  );

  if (!pendingId) return null;

  return (
    <div className={styles.backdrop} onPointerDown={(e) => e.target === e.currentTarget && dismiss()}>
      <div
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-label={`Add ${name || "template"}`}
        data-testid="nd-template-dialog"
      >
        <h2 className={styles.title}>Add “{name}”</h2>
        <p className={styles.body}>This page already has something on it.</p>

        <div className={styles.choices}>
          {/* Default and focused: the answer that cannot lose anything. */}
          <button
            type="button"
            className={styles.primary}
            autoFocus
            onClick={() => void apply("new-page")}
            data-testid="nd-template-new-page"
          >
            Add as new page
          </button>
          <button
            type="button"
            className={styles.secondary}
            onClick={() => void apply("replace-page")}
            data-testid="nd-template-replace"
          >
            Replace this page
            <span className={styles.hint}>This can be undone with Ctrl+Z.</span>
          </button>
          <button type="button" className={styles.ghost} onClick={dismiss} data-testid="nd-template-cancel">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
