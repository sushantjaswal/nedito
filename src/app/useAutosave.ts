import { useEffect, useRef } from "react";
import { isAutosaveWorking, saveAutosave } from "../file/autosave";
import { useDocStore } from "../model/store";
import { BRAND } from "./brand";

const DEBOUNCE_MS = 800;

export function useAutosave(): void {
  const doc = useDocStore((s) => s.doc);
  // An untouched sample diagram is not the user's work, so it is deliberately not autosaved:
  // otherwise someone who merely looked at it and reloaded would be met by "unsaved diagram
  // found — restore?" for a document they never made. The moment they edit it, demoActive
  // clears (see onboarding/useDemoDiagram.ts) and autosave resumes normally.
  const demoActive = useDocStore((s) => s.ui.onboarding.demoActive);
  const timeoutRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (demoActive) return;
    window.clearTimeout(timeoutRef.current);
    timeoutRef.current = window.setTimeout(() => {
      const wasWorking = isAutosaveWorking();
      // Said once, when it stops; the status bar keeps saying it until it works again.
      if (!saveAutosave(doc) && wasWorking) {
        useDocStore.getState().showNotice({
          message: `Autosave is off — this diagram is too big for browser storage. Save a copy (${BRAND.name} menu, or Ctrl+S) to keep your work.`,
          tone: "warn",
        });
      }
    }, DEBOUNCE_MS);
    return () => window.clearTimeout(timeoutRef.current);
  }, [doc, demoActive]);
}
