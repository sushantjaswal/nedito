import { useCallback, useEffect, useMemo, useState } from "react";
import { useDocStore } from "../model/store";
import { NestedMiniature } from "../nesting/NestedMiniature";
import { loadTemplate, searchTemplates, templatesInCategory } from "./registry";
import { CATEGORY_LABELS, TEMPLATE_CATEGORIES, type TemplateCategory, type TemplateMeta } from "./types";
import styles from "./TemplateBrowser.module.css";
import type { Diagram } from "../model/types";

/**
 * Thumbnails are rendered from the template document itself, using the same miniature renderer
 * the nested blocks use — no hand-made images, per the spec. Cached for the session because a
 * card re-renders on every keystroke in the search box.
 */
const thumbnailCache = new Map<string, { page: Diagram; usesNesting: boolean }>();

function useThumbnail(id: string) {
  const [entry, setEntry] = useState(() => thumbnailCache.get(id) ?? null);

  useEffect(() => {
    if (entry) return;
    let cancelled = false;
    void loadTemplate(id).then((template) => {
      if (cancelled || !template) return;
      const page = template.doc.diagrams[template.doc.rootDiagramIds[0]];
      const value = { page, usesNesting: template.usesNesting };
      thumbnailCache.set(id, value);
      setEntry(value);
    });
    return () => {
      cancelled = true;
    };
  }, [id, entry]);

  return entry;
}

interface CardProps {
  template: TemplateMeta;
  onApply: (id: string) => void;
}

function TemplateCard({ template, onApply }: CardProps) {
  const thumb = useThumbnail(template.id);

  return (
    <button
      type="button"
      className={styles.card}
      title={template.description}
      onClick={() => onApply(template.id)}
      data-testid={`nd-template-card-${template.id}`}
    >
      <span className={styles.thumb}>
        {thumb ? <NestedMiniature diagram={thumb.page} /> : <span className={styles.thumbEmpty} />}
        {thumb?.usesNesting && (
          <span className={styles.nestedBadge} data-testid={`nd-template-nested-${template.id}`}>
            Nested
          </span>
        )}
      </span>
      <span className={styles.name}>{template.name}</span>
      <span className={styles.description}>{template.description}</span>
    </button>
  );
}

interface TemplateBrowserProps {
  /** Shared with the Shapes tab, so one box searches whichever half is showing. */
  query: string;
}

export function TemplateBrowser({ query }: TemplateBrowserProps) {
  const [collapsed, setCollapsed] = useState<Set<TemplateCategory>>(new Set());

  const apply = useCallback(async (id: string) => {
    const template = await loadTemplate(id);
    if (!template) return;
    const store = useDocStore.getState();
    const page = store.doc.diagrams[store.currentDiagramId()];
    // An empty page takes the template directly; anything else is the user's work, and
    // overwriting it without asking would be the one unforgivable outcome here. Lines alone are
    // work too: a page of free lines has no shapes but is not empty.
    if (page && page.nodes.length === 0 && page.edges.length === 0) store.applyTemplate(template.doc, "into-current");
    else store.askTemplatePlacement(id);
  }, []);

  const sections = useMemo(
    () =>
      TEMPLATE_CATEGORIES.map((category) => ({
        category,
        templates: searchTemplates(templatesInCategory(category), query),
      })).filter((s) => s.templates.length > 0),
    [query],
  );

  const total = useMemo(() => new Set(sections.flatMap((s) => s.templates.map((t) => t.id))).size, [sections]);

  if (query.trim() && total === 0) {
    return (
      <div className={styles.empty} data-testid="nd-template-no-results">
        No templates match “{query.trim()}”.
      </div>
    );
  }

  return (
    <div className={styles.browser} data-testid="nd-template-browser">
      {sections.map(({ category, templates }) => {
        const isCollapsed = collapsed.has(category);
        return (
          <section key={category} className={styles.section}>
            <button
              type="button"
              className={styles.header}
              aria-expanded={!isCollapsed}
              onClick={() =>
                setCollapsed((prev) => {
                  const next = new Set(prev);
                  if (next.has(category)) next.delete(category);
                  else next.add(category);
                  return next;
                })
              }
              data-testid={`nd-template-category-${category}`}
            >
              <span className={styles.chevron}>{isCollapsed ? "▸" : "▾"}</span>
              {CATEGORY_LABELS[category]}
            </button>
            {!isCollapsed && (
              <div className={styles.grid}>
                {templates.map((template) => (
                  <TemplateCard key={template.id} template={template} onApply={apply} />
                ))}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
