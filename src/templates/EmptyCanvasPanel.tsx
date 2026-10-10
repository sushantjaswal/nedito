import { useCallback, useEffect, useState } from "react";
import { useDocStore } from "../model/store";
import { NestedMiniature } from "../nesting/NestedMiniature";
import { featuredTemplates, loadTemplate } from "./registry";
import styles from "./EmptyCanvasPanel.module.css";
import type { Diagram } from "../model/types";

/**
 * A start panel over an empty canvas.
 *
 * The hard constraint from the spec is that it must never get in the way: it sits in a layer
 * with `pointer-events: none`, so a click on the canvas beside it lands on the canvas. Only the
 * card itself takes pointer events back. Someone who wants to ignore it and start drawing does
 * exactly that, and the panel disappears the moment a node exists.
 *
 * It can also be dismissed outright — "Start with a blank canvas", the × or Esc — for someone who
 * would rather not have it sitting there while they decide what to draw. Dismissed, it stays away
 * for the rest of the visit (D81).
 */
export function EmptyCanvasPanel() {
  const doc = useDocStore((s) => s.doc);
  const navStack = useDocStore((s) => s.navStack);
  const demoActive = useDocStore((s) => s.ui.onboarding.demoActive);
  const viewerMode = useDocStore((s) => s.ui.viewerMode);
  const setSidebarTab = useDocStore((s) => s.setSidebarTab);
  const dismissed = useDocStore((s) => s.ui.startPanelDismissed);
  const dismiss = useDocStore((s) => s.dismissStartPanel);

  const [thumbs, setThumbs] = useState<Record<string, Diagram>>({});
  const featured = featuredTemplates();

  useEffect(() => {
    let cancelled = false;
    void Promise.all(featured.map((t) => loadTemplate(t.id))).then((loaded) => {
      if (cancelled) return;
      const next: Record<string, Diagram> = {};
      for (const template of loaded) {
        if (template) next[template.id] = template.doc.diagrams[template.doc.rootDiagramIds[0]];
      }
      setThumbs(next);
    });
    return () => {
      cancelled = true;
    };
    // featured is a stable list derived from the registry, not state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const apply = useCallback(async (id: string) => {
    const template = await loadTemplate(id);
    // The panel only shows on an empty page, so there is nothing to ask about.
    if (template) useDocStore.getState().applyTemplate(template.doc, "into-current");
  }, []);

  const page = doc.diagrams[navStack[navStack.length - 1]];
  // Never over the first-visit sample: that is its own introduction, and two panels competing
  // for a new user's attention is worse than either alone.
  const visible = !viewerMode && !demoActive && !dismissed && !!page && page.nodes.length === 0 && page.edges.length === 0;

  // Esc dismisses it, like any panel. Only while it is showing, so Esc keeps its usual meaning
  // (leaving a nested diagram, clearing a selection) everywhere else.
  useEffect(() => {
    if (!visible) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") dismiss();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [visible, dismiss]);

  if (!visible) return null;

  return (
    <div className={styles.layer} data-testid="nd-empty-canvas-layer">
      <div className={styles.card} data-testid="nd-start-panel">
        <button type="button" className={styles.close} onClick={dismiss} aria-label="Close" data-testid="nd-start-close">
          ×
        </button>
        <h2 className={styles.title}>Start from a template</h2>
        <div className={styles.grid}>
          {featured.map((template) => (
            <button
              key={template.id}
              type="button"
              className={styles.tile}
              title={template.description}
              onClick={() => void apply(template.id)}
              data-testid={`nd-start-template-${template.id}`}
            >
              <span className={styles.thumb}>
                {thumbs[template.id] && <NestedMiniature diagram={thumbs[template.id]} />}
              </span>
              <span className={styles.name}>{template.name}</span>
            </button>
          ))}
        </div>
        <div className={styles.actions}>
          <button type="button" className={styles.blank} onClick={dismiss} data-testid="nd-start-blank-canvas">
            Start with a blank canvas
          </button>
          <button
            type="button"
            className={styles.browseAll}
            onClick={() => setSidebarTab("templates")}
            data-testid="nd-start-browse-all"
          >
            Browse all templates
          </button>
        </div>
      </div>
    </div>
  );
}
