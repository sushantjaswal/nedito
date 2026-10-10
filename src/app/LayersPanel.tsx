import { useState } from "react";
import { useDocStore } from "../model/store";
import styles from "./LayersPanel.module.css";

// The Layers panel: a per-diagram list of layers, each with a visibility toggle, a lock
// toggle, and a name; clicking a layer makes it "active" (where new shapes land); one layer
// always exists and can't be deleted. Rendered as a small floating panel over the canvas
// (View > Layers toggles it) rather than a blocking modal, since toggling visibility/lock is
// meant to be checked live against the canvas, not from behind a closed dialog.
export function LayersPanel() {
  const open = useDocStore((s) => s.ui.layersPanelOpen);
  const toggle = useDocStore((s) => s.toggleLayersPanel);
  const docLayers = useDocStore((s) => s.currentLayers());
  const activeLayerId = useDocStore((s) => s.activeLayerId());
  const selectedCount = useDocStore((s) => s.selection.nodeIds.length);
  const setActiveLayer = useDocStore((s) => s.setActiveLayer);
  const addLayer = useDocStore((s) => s.addLayer);
  const renameLayer = useDocStore((s) => s.renameLayer);
  const removeLayer = useDocStore((s) => s.removeLayer);
  const setLayerVisible = useDocStore((s) => s.setLayerVisible);
  const setLayerLocked = useDocStore((s) => s.setLayerLocked);
  const reorderLayer = useDocStore((s) => s.reorderLayer);
  const moveSelectionToLayer = useDocStore((s) => s.moveSelectionToLayer);

  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  if (!open) return null;

  const startRename = (id: string, currentName: string) => {
    setRenamingId(id);
    setDraft(currentName);
  };
  const commitRename = () => {
    if (renamingId && draft.trim()) renameLayer(renamingId, draft.trim());
    setRenamingId(null);
  };

  return (
    <div className={styles.panel} data-testid="nd-layers-panel">
      <div className={styles.header}>
        <h3 className={styles.title}>Layers</h3>
        <button type="button" className={styles.panelCloseBtn} onClick={toggle} aria-label="Close layers panel">
          ×
        </button>
      </div>
      <ul className={styles.list}>
        {docLayers.map((layer, index) => {
          const isRenaming = renamingId === layer.id;
          const isActive = layer.id === activeLayerId;
          return (
            <li
              key={layer.id}
              className={isActive ? `${styles.row} ${styles.rowActive}` : styles.row}
              draggable={!isRenaming}
              onDragStart={() => setDragIndex(index)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => {
                if (dragIndex !== null && dragIndex !== index) reorderLayer(dragIndex, index);
                setDragIndex(null);
              }}
              onClick={() => setActiveLayer(layer.id)}
              data-testid={`nd-layer-row-${layer.id}`}
            >
              <button
                type="button"
                className={styles.iconBtn}
                onClick={(e) => {
                  e.stopPropagation();
                  setLayerVisible(layer.id, !layer.visible);
                }}
                title={layer.visible ? "Hide layer" : "Show layer"}
                aria-label={layer.visible ? "Hide layer" : "Show layer"}
                data-testid={`nd-layer-visible-${layer.id}`}
              >
                {layer.visible ? "◉" : "○"}
              </button>
              <button
                type="button"
                className={styles.iconBtn}
                onClick={(e) => {
                  e.stopPropagation();
                  setLayerLocked(layer.id, !layer.locked);
                }}
                title={layer.locked ? "Unlock layer" : "Lock layer"}
                aria-label={layer.locked ? "Unlock layer" : "Lock layer"}
                data-testid={`nd-layer-locked-${layer.id}`}
              >
                {layer.locked ? "🔒" : "🔓"}
              </button>
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
                <span className={styles.name} onDoubleClick={() => startRename(layer.id, layer.name)}>
                  {layer.name}
                </span>
              )}
              {selectedCount > 0 && (
                <button
                  type="button"
                  className={styles.moveBtn}
                  onClick={(e) => {
                    e.stopPropagation();
                    moveSelectionToLayer(layer.id);
                  }}
                  title={`Move ${selectedCount} selected shape${selectedCount === 1 ? "" : "s"} here`}
                >
                  Move here
                </button>
              )}
              {docLayers.length > 1 && !isRenaming && (
                <button
                  type="button"
                  className={styles.closeBtn}
                  onClick={(e) => {
                    e.stopPropagation();
                    removeLayer(layer.id);
                  }}
                  title="Delete layer"
                  aria-label="Delete layer"
                >
                  ×
                </button>
              )}
            </li>
          );
        })}
      </ul>
      <button type="button" className={styles.addBtn} onClick={() => addLayer()} data-testid="nd-layer-add">
        + Add Layer
      </button>
    </div>
  );
}
