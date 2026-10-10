import { useState } from "react";
import { useDocStore } from "../model/store";
import styles from "./PageTabStrip.module.css";

export function PageTabStrip() {
  const doc = useDocStore((s) => s.doc);
  const navStack = useDocStore((s) => s.navStack);
  const activePageId = navStack[0];
  const switchPage = useDocStore((s) => s.switchPage);
  const addPage = useDocStore((s) => s.addPage);
  const renamePage = useDocStore((s) => s.renamePage);
  const removePage = useDocStore((s) => s.removePage);
  const reorderPages = useDocStore((s) => s.reorderPages);
  // In the read-only share viewer the tabs stay — a multi-page document has to be readable
  // page by page — but everything that edits the page set is switched off: no add, no delete,
  // no rename, no reordering. Switching pages is navigation, so it stays live.
  const viewerMode = useDocStore((s) => s.ui.viewerMode);

  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  const startRename = (id: string, currentTitle: string) => {
    setRenamingId(id);
    setDraft(currentTitle);
  };

  const commitRename = () => {
    if (renamingId && draft.trim()) renamePage(renamingId, draft.trim());
    setRenamingId(null);
  };

  return (
    <footer className={styles.strip} data-testid="nd-page-tabs">
      {doc.rootDiagramIds.map((id, index) => {
        const page = doc.diagrams[id];
        const active = id === activePageId;
        const isRenaming = renamingId === id;
        return (
          <div
            key={id}
            className={active ? `${styles.tab} ${styles.tabActive}` : styles.tab}
            draggable={!isRenaming && !viewerMode}
            onDragStart={() => setDragIndex(index)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => {
              if (dragIndex !== null && dragIndex !== index) reorderPages(dragIndex, index);
              setDragIndex(null);
            }}
            onClick={() => !isRenaming && switchPage(id)}
            onDoubleClick={() => !viewerMode && startRename(id, page?.title ?? id)}
            data-testid={`nd-page-tab-${id}`}
          >
            {isRenaming ? (
              <input
                autoFocus
                className={styles.renameInput}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onBlur={commitRename}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commitRename();
                  if (e.key === "Escape") setRenamingId(null);
                }}
                onClick={(e) => e.stopPropagation()}
              />
            ) : (
              <span>{page?.title ?? id}</span>
            )}
            {doc.rootDiagramIds.length > 1 && !isRenaming && !viewerMode && (
              <button
                type="button"
                className={styles.closeBtn}
                onClick={(e) => {
                  e.stopPropagation();
                  removePage(id);
                }}
                title="Delete page"
              >
                ×
              </button>
            )}
          </div>
        );
      })}
      {!viewerMode && (
        <button
          type="button"
          className={styles.addBtn}
          onClick={() => addPage()}
          title="Add page"
          data-testid="nd-page-add"
        >
          +
        </button>
      )}
    </footer>
  );
}
