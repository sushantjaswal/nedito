// The keyboard shortcuts (arrow nudge, Ctrl+Z/Y undo/redo, Ctrl+C/V/X/D, Delete, F2, Esc,
// Ctrl+A select all, Ctrl+G/Ctrl+Shift+U group/ungroup, Ctrl+Shift+F/B front/back,
// Ctrl+=/Ctrl+- zoom, Ctrl+Shift+H fit page, Ctrl+Shift+K shortcuts cheat sheet, Ctrl+F
// find/replace — Ctrl+F, since Ctrl+Shift+F is already bound to
// Bring to Front; Ctrl+F is the near-universal "find" convention everywhere else.
// The label editor stops propagation on every keydown while active, so it never reaches
// here — native text-field undo/copy/paste behave normally while editing.
import { useEffect } from "react";
import { getCanvasInstance, stepZoom } from "../canvas/canvasApi";
import { GRID_SIZE } from "../canvas/constants";
import { addConnectedCopyAndReveal } from "../canvas/addConnectedCopy";
import { useDocStore } from "../model/store";
import { redoWithNavigation, undoWithNavigation } from "../model/undoNavigation";
import { navigateBackOut } from "../nesting/navigation";
import { imageFilesIn, insertImageFiles } from "./insertImage";
import { markShapesInEvent } from "./systemClipboard";
import { openFilePicker, saveCopy } from "./fileActions";
import type { Side } from "../model/connectedCopy";

function isTypingTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)
  );
}

const ARROW_DELTAS: Record<string, [number, number]> = {
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
};

const ARROW_SIDES: Record<string, Side> = { ArrowUp: "top", ArrowDown: "bottom", ArrowLeft: "left", ArrowRight: "right" };

/** How long Ctrl+V waits for the browser's paste event before pasting the in-app shapes anyway. */
export const PASTE_EVENT_GRACE_MS = 150;

export function useGlobalShortcuts(): void {
  useEffect(() => {
    let markNextClipboardEvent = false;
    let pasteFallback = 0;

    const onKeyDown = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return;

      const store = useDocStore.getState();
      const mod = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();

      // A modal cheat sheet should swallow everything except the keys that close it.
      if (store.ui.shortcutsDialogOpen) {
        if (e.key === "Escape" || (mod && e.shiftKey && key === "k")) {
          e.preventDefault();
          store.toggleShortcutsDialog();
        }
        return;
      }

      // The palette and Preferences are modal: the canvas's keys wait until they close (each
      // handles its own Esc).
      if (store.ui.paletteOpen || store.ui.preferencesOpen) return;

      if (mod && e.shiftKey && key === "k") {
        e.preventDefault();
        store.toggleShortcutsDialog();
        return;
      }
      // Ctrl+K opens the command palette (R2, D91). Nothing in the app used it; browsers let a page
      // take it, as GitHub and Slack do.
      if (mod && !e.shiftKey && key === "k") {
        e.preventDefault();
        store.setPaletteOpen(true);
        return;
      }
      // Ctrl+O and Ctrl+S, as every desktop app has them (R2). Ctrl+N stays the browser's: it opens
      // a window, and pages cannot take it.
      if (mod && !e.shiftKey && key === "o") {
        e.preventDefault();
        openFilePicker();
        return;
      }
      if (mod && !e.shiftKey && key === "s") {
        e.preventDefault();
        saveCopy();
        return;
      }
      // Alt+F10 moves focus into the context bar (R1, D90) — the editor-toolbar key rich editors
      // use; nothing else in the app or the browser takes it. The line toolbar is a context bar too.
      if (e.altKey && e.key === "F10") {
        const first = document.querySelector<HTMLButtonElement>("[data-nd-context-bar] button");
        if (first) {
          e.preventDefault();
          first.focus();
        }
        return;
      }
      if (mod && key === "z" && !e.shiftKey) {
        e.preventDefault();
        undoWithNavigation();
        return;
      }
      if (mod && (key === "y" || (key === "z" && e.shiftKey))) {
        e.preventDefault();
        redoWithNavigation();
        return;
      }
      if (mod && key === "a") {
        e.preventDefault();
        store.selectAll();
        return;
      }
      // Copy, cut and paste must not preventDefault: the browser then fires its clipboard events
      // too, and the paste event is the only way an image copied in another app arrives (D79).
      // The shapes are still copied and cut right here, so nothing depends on those events.
      if (mod && key === "c") {
        store.copySelection();
        markNextClipboardEvent = true;
        return;
      }
      if (mod && key === "x") {
        store.cutSelection();
        markNextClipboardEvent = true;
        return;
      }
      if (mod && key === "v") {
        // The paste event decides between an image and the shapes copied here. If a browser
        // doesn't fire one (no editable focus, a locked-down clipboard), the shapes paste anyway.
        window.clearTimeout(pasteFallback);
        pasteFallback = window.setTimeout(() => useDocStore.getState().pasteClipboard(), PASTE_EVENT_GRACE_MS);
        return;
      }
      if (mod && key === "d") {
        e.preventDefault();
        store.duplicateSelection();
        return;
      }
      if (mod && key === "f" && !e.shiftKey) {
        e.preventDefault();
        store.toggleFindReplace();
        return;
      }
      if (mod && e.shiftKey && key === "f") {
        e.preventDefault();
        store.bringToFront(store.selection.nodeIds);
        return;
      }
      if (mod && e.shiftKey && key === "b") {
        e.preventDefault();
        store.sendToBack(store.selection.nodeIds);
        return;
      }
      if (mod && e.shiftKey && key === "u") {
        e.preventDefault();
        store.ungroupSelection();
        return;
      }
      if (mod && key === "g") {
        e.preventDefault();
        store.groupSelection();
        return;
      }
      if (mod && e.shiftKey && key === "h") {
        e.preventDefault();
        getCanvasInstance()?.fitView({ duration: 200, padding: 0.2 });
        return;
      }
      if (mod && (key === "=" || key === "+")) {
        e.preventDefault();
        stepZoom(1);
        return;
      }
      if (mod && key === "-") {
        e.preventDefault();
        stepZoom(-1);
        return;
      }
      if (e.key === "Delete" || e.key === "Backspace") {
        if (store.selection.nodeIds.length > 0 || store.selection.edgeIds.length > 0) {
          e.preventDefault();
          store.removeSelection();
        }
        return;
      }
      if (e.key === "F2") {
        if (store.selection.nodeIds.length === 1) {
          e.preventDefault();
          store.setEditingNodeId(store.selection.nodeIds[0]);
        } else if (store.selection.edgeIds.length === 1) {
          e.preventDefault();
          store.setEditingEdgeId(store.selection.edgeIds[0]);
        }
        return;
      }
      if (e.key === "Escape") {
        if (store.editingNodeId) store.setEditingNodeId(null);
        else if (store.editingEdgeId) store.setEditingEdgeId(null);
        else if (store.selection.nodeIds.length > 0 || store.selection.edgeIds.length > 0) store.clearSelection();
        // A trace ends before the level is left (D117).
        else if (store.trace) store.setTrace(null);
        // So does a preview of Build or Spotlight (A6, D123).
        else if (store.ui.presentationPreview) store.setPresentationPreview(false);
        else if (store.navStack.length > 1) navigateBackOut();
        return;
      }

      // Alt+Shift+Arrow: clone-and-connect, which the ＋ handles' click also does — a connected copy of the one selected shape on that side.
      if (e.key in ARROW_SIDES && e.altKey && e.shiftKey && !mod && store.selection.nodeIds.length === 1 && !store.ui.viewerMode) {
        e.preventDefault();
        addConnectedCopyAndReveal(store.selection.nodeIds[0], ARROW_SIDES[e.key]);
        return;
      }

      if (e.key in ARROW_DELTAS && (store.selection.nodeIds.length > 0 || store.selection.edgeIds.length > 0)) {
        e.preventDefault();
        const step = e.shiftKey ? GRID_SIZE : 1;
        const [dx, dy] = ARROW_DELTAS[e.key];
        const diagram = store.doc.diagrams[store.currentDiagramId()];
        const updates = diagram.nodes
          .filter((n) => store.selection.nodeIds.includes(n.id))
          .map((n) => ({ id: n.id, patch: { position: { x: n.position.x + dx * step, y: n.position.y + dy * step } } }));
        if (updates.length > 0) store.moveOrResizeNodes(updates);
        // A selected line nudges too: its free ends and bends (moveEdges leaves attached ends to their shapes).
        store.moveEdges(store.selection.edgeIds, dx * step, dy * step);
      }
    };

    // After Ctrl+C / Ctrl+X copied shapes: mark the system clipboard, so a stale image left there
    // can't win the next paste (see systemClipboard.ts). A text field keeps its own clipboard.
    const onCopyOrCut = (e: ClipboardEvent) => {
      if (!markNextClipboardEvent) return;
      markNextClipboardEvent = false;
      if (isTypingTarget(e.target) || isTypingTarget(document.activeElement)) return;
      markShapesInEvent(e);
    };

    // Ctrl+V: an image on the system clipboard — copied in another app — is placed as a picture;
    // anything else pastes the shapes copied in here, as before.
    const onPaste = (e: ClipboardEvent) => {
      if (isTypingTarget(e.target) || isTypingTarget(document.activeElement)) return;
      const store = useDocStore.getState();
      if (store.ui.shortcutsDialogOpen) return;
      window.clearTimeout(pasteFallback);
      e.preventDefault();
      const images = imageFilesIn(e.clipboardData?.items);
      if (images.length > 0) void insertImageFiles(images);
      else store.pasteClipboard();
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("copy", onCopyOrCut);
    window.addEventListener("cut", onCopyOrCut);
    window.addEventListener("paste", onPaste);
    return () => {
      window.clearTimeout(pasteFallback);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("copy", onCopyOrCut);
      window.removeEventListener("cut", onCopyOrCut);
      window.removeEventListener("paste", onPaste);
    };
  }, []);
}
