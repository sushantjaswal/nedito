import { useEffect, useRef } from "react";
import { getCanvasInstance } from "../canvas/canvasApi";
import { readAutosave } from "../file/autosave";
import { useDocStore } from "../model/store";
import { buildDemoDoc } from "./demoDiagram";
import { readDemoDismissed } from "./onboardingStorage";

// Loads the bundled sample on a genuinely first visit — no autosaved document and no
// demoDismissed flag. Both conditions matter: the flag alone would re-show the sample to
// someone who cleared it and kept working, and the autosave alone would re-show it after they
// deliberately started blank.
//
// Deliberately runs before useAutosave's first debounced write, so the sample is never itself
// autosaved while untouched (useAutosave suppresses that too) — otherwise a user who merely
// looked at the sample and reloaded would be greeted by "unsaved diagram found — restore?" for
// a document they never made.
// `enabled` is false when the canvas already holds a document the user deliberately chose to
// keep — today, a copy of a shared diagram (app/App.tsx). Dropping the sample on top of that
// would silently discard it, and the "no autosave yet" test below is exactly true for a
// first-time visitor who arrived through someone's link.
export function useDemoDiagram(enabled = true): void {
  const startDemo = useDocStore((s) => s.startDemo);
  const dismissDemo = useDocStore((s) => s.dismissDemo);
  const demoActive = useDocStore((s) => s.ui.onboarding.demoActive);
  const doc = useDocStore((s) => s.doc);

  const ranRef = useRef(false);
  const demoDocRef = useRef<unknown>(null);

  useEffect(() => {
    if (!enabled || ranRef.current) return;
    ranRef.current = true;
    if (readAutosave() !== null || readDemoDismissed()) return;
    const demo = buildDemoDoc();
    demoDocRef.current = demo;
    startDemo(demo);

  }, [enabled, startDemo]);

  // Fit the sample once, so a first-time visitor sees the whole example rather than whichever
  // corner of it happens to fall inside their window. Scoped to the demo on purpose: ordinary
  // navigation still opens diagrams at 100% (DiagramCanvas's viewport effect), because
  // auto-fitting every diagram produced unpredictable zoom levels.
  //
  // In its own effect rather than alongside the load above: StrictMode mounts, cleans up, and
  // re-mounts, and the load effect's one-shot guard means a timer scheduled there would be
  // cancelled by that cleanup and never rescheduled.
  const fittedRef = useRef(false);
  useEffect(() => {
    if (!demoActive || fittedRef.current) return;
    fittedRef.current = true;
    // Waits out DiagramCanvas's own viewport restore, which animates to 100% over 300ms when a
    // diagram is first opened — fitting before that lands just gets overwritten by it.
    const fit = window.setTimeout(() => getCanvasInstance()?.fitView({ padding: 0.18, duration: 200 }), 360);
    return () => window.clearTimeout(fit);
  }, [demoActive]);

  // The sample retires the moment the user changes anything. Every mutation goes through a
  // named store action that replaces `doc` with a new object (the store's command pattern), so
  // an identity change against the document we loaded *is* "they edited it" — no need to
  // instrument each action individually.
  useEffect(() => {
    if (!demoActive || demoDocRef.current === null) return;
    if (doc !== demoDocRef.current) dismissDemo();
  }, [doc, demoActive, dismissDemo]);
}
