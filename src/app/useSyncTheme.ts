import { useEffect } from "react";
import { useDocStore } from "../model/store";

// Applies ui.darkMode to the document root as a data attribute, which tokens.css keys its dark
// palette off (:root[data-theme="dark"]) — same store-state-drives-DOM-side-effect pattern as
// useAutosave/useFileDrop.
export function useSyncTheme(): void {
  const darkMode = useDocStore((s) => s.ui.darkMode);
  useEffect(() => {
    document.documentElement.dataset.theme = darkMode ? "dark" : "light";
  }, [darkMode]);
}
