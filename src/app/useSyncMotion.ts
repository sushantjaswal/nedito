import { useEffect } from "react";
import { useDocStore } from "../model/store";
import { MOTION_OFF_CLASS } from "./motionPreference";

// Applies the Motion switch to the page as a class on <html>, which styles/motion.css reads to
// stop every animation (D116) — the same store-state-drives-the-DOM pattern as useSyncTheme.
export function useSyncMotion(): void {
  const on = useDocStore((s) => s.ui.motionEnabled);
  useEffect(() => {
    document.documentElement.classList.toggle(MOTION_OFF_CLASS, !on);
  }, [on]);
}
