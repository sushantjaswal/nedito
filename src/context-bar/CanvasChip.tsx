// The canvas chip: the diagram's own settings, in the canvas's bottom-left corner beside the zoom
// controls. They lived in the right panel's Diagram settings view,
// shown when nothing was selected; with the panel gone they sit where they act. Grid and Snap are
// one click each; Page opens a small popover with the page size, orientation and background, and
// the palette's Diagram Settings opens that popover too. Since R2 (D91) the Layers and Outline
// panels, which the View menu used to open, toggle here as well.
import { useEffect, useRef } from "react";
import { useDocStore } from "../model/store";
import { matchPreset, orientationOf, PAGE_PRESETS } from "../model/pageSize";
import { PageSettings } from "../format-panel/PageSettings";
import { CommentsChipPopover } from "../comments/CommentsChipPopover";
import styles from "./CanvasChip.module.css";

/** What the Page button says: the page size in use, or that the canvas is unbounded. */
function pageName(pageSize: { w: number; h: number } | undefined): string {
  if (!pageSize) return "Infinite canvas";
  const id = matchPreset(pageSize);
  const preset = PAGE_PRESETS.find((p) => p.id === id);
  return `${preset?.name ?? "Custom page"}${preset ? ` · ${orientationOf(pageSize) === "portrait" ? "portrait" : "landscape"}` : ""}`;
}

export function CanvasChip() {
  const gridEnabled = useDocStore((s) => s.ui.gridEnabled);
  const snapEnabled = useDocStore((s) => s.ui.snapEnabled);
  const toggleGrid = useDocStore((s) => s.toggleGrid);
  const toggleSnap = useDocStore((s) => s.toggleSnap);
  const layersOpen = useDocStore((s) => s.ui.layersPanelOpen);
  const outlineOpen = useDocStore((s) => s.ui.minimapOpen);
  const toggleLayers = useDocStore((s) => s.toggleLayersPanel);
  const toggleOutline = useDocStore((s) => s.toggleMinimap);
  const open = useDocStore((s) => s.ui.pageSettingsOpen);
  const setOpen = useDocStore((s) => s.setPageSettingsOpen);
  const commentCount = useDocStore((s) => s.doc.comments?.length ?? 0);
  const commentsOpen = useDocStore((s) => s.ui.commentListOpen);
  const commentMarkers = useDocStore((s) => s.ui.commentMarkers);
  const setCommentListOpen = useDocStore((s) => s.setCommentListOpen);
  const pageSize = useDocStore((s) => s.doc.diagrams[s.currentDiagramId()]?.pageSize);
  const viewerMode = useDocStore((s) => s.ui.viewerMode);
  const rootRef = useRef<HTMLDivElement>(null);
  const pageButtonRef = useRef<HTMLButtonElement>(null);
  const commentsButtonRef = useRef<HTMLButtonElement>(null);

  // The Comments popover answers Esc and an outside click the same way the Page one does. It needs
  // its own listener rather than the global Escape chain: the chip stops key events from leaving
  // it, so a press inside here never reaches the window handler that chain lives on.
  useEffect(() => {
    if (!commentsOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopImmediatePropagation();
      setCommentListOpen(false);
      commentsButtonRef.current?.focus();
    };
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setCommentListOpen(false);
    };
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("pointerdown", onDown, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("pointerdown", onDown, true);
    };
  }, [commentsOpen, setCommentListOpen]);

  // Esc or a click elsewhere closes the popover; Esc hands focus back to the Page button.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopImmediatePropagation();
      setOpen(false);
      pageButtonRef.current?.focus();
    };
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("pointerdown", onDown, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("pointerdown", onDown, true);
    };
  }, [open, setOpen]);

  if (viewerMode) return null;

  return (
    <div
      ref={rootRef}
      className={`${styles.root} nodrag nopan nowheel`}
      onPointerDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
    >
      {commentsOpen && commentCount > 0 && (
        <div className={styles.popover} role="dialog" aria-label="Comments" data-testid="nd-comments-popover">
          <h4 className={styles.title}>Comments</h4>
          <CommentsChipPopover />
        </div>
      )}
      {open && (
        <div className={styles.popover} role="dialog" aria-label="Page" data-testid="nd-page-popover">
          <h4 className={styles.title}>Page</h4>
          <PageSettings />
        </div>
      )}
      <div className={styles.chip} role="toolbar" aria-label="Diagram" data-testid="nd-canvas-chip">
        <button
          type="button"
          className={styles.button}
          aria-pressed={gridEnabled}
          onClick={toggleGrid}
          title="Show grid"
          data-testid="nd-grid-toggle"
        >
          <span className={gridEnabled ? `${styles.dot} ${styles.dotOn}` : styles.dot} aria-hidden="true" />
          Grid
        </button>
        <button
          type="button"
          className={styles.button}
          aria-pressed={snapEnabled}
          onClick={toggleSnap}
          title="Snap to grid"
          data-testid="nd-snap-toggle"
        >
          <span className={snapEnabled ? `${styles.dot} ${styles.dotOn}` : styles.dot} aria-hidden="true" />
          Snap
        </button>
        <button type="button" className={styles.button} aria-pressed={layersOpen} onClick={toggleLayers} title="Layers panel" data-testid="nd-layers-toggle">
          <span className={layersOpen ? `${styles.dot} ${styles.dotOn}` : styles.dot} aria-hidden="true" />
          Layers
        </button>
        <button type="button" className={styles.button} aria-pressed={outlineOpen} onClick={toggleOutline} title="Outline (overview map)" data-testid="nd-outline-toggle">
          <span className={outlineOpen ? `${styles.dot} ${styles.dotOn}` : styles.dot} aria-hidden="true" />
          Outline
        </button>
        {/* Comments belongs here rather than in a bar of its own: it is a canvas-wide switch like its
            neighbours, and as a separate strip it appeared beside this one from nowhere the moment
            a comment existed, reading as a ragged extension of it. Shown only when the document has
            comments, so a canvas without any is exactly as it was. */}
        {commentCount > 0 && (
          <button
            ref={commentsButtonRef}
            type="button"
            className={styles.button}
            aria-haspopup="dialog"
            aria-expanded={commentsOpen}
            onClick={() => setCommentListOpen(!commentsOpen)}
            title="Comments on this document"
            data-testid="nd-comments-button"
          >
            <span className={commentMarkers ? `${styles.dot} ${styles.dotOn}` : styles.dot} aria-hidden="true" />
            Comments {commentCount}
          </button>
        )}
        <button
          ref={pageButtonRef}
          type="button"
          className={styles.button}
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-label={`Page: ${pageName(pageSize)}`}
          onClick={() => setOpen(!open)}
          data-testid="nd-page-button"
        >
          {pageName(pageSize)}
        </button>
      </div>
    </div>
  );
}
