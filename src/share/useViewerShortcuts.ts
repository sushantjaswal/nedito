import { useEffect } from "react";
import { getCanvasInstance, stepZoom } from "../canvas/canvasApi";
import { navigateBackOut } from "../nesting/navigation";
import { useDocStore } from "../model/store";

// The navigation-only subset of app/useGlobalShortcuts.ts. The editor's map is not reused
// because most of it edits: rather than thread a read-only check through every branch of it,
// the viewer binds the handful of keys that only move the camera.
export function useViewerShortcuts(): void {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();

      // Esc ends a trace first (D117), then leaves a nested diagram, matching the editor and
      if (e.key === "Escape") {
        const store = useDocStore.getState();
        if (store.trace) store.setTrace(null);
        else navigateBackOut();
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
      if (mod && e.shiftKey && key === "h") {
        e.preventDefault();
        getCanvasInstance()?.fitView({ padding: 0.2, duration: 200 });
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
}
