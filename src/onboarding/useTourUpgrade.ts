import { useEffect, useRef } from "react";
import { TOUR_FINISHED, useDocStore } from "../model/store";
import { CURRENT_TOUR_VERSION, readTourDone, readTourVersion, writeTourVersion } from "./onboardingStorage";

/**
 * Shows the newest tour step, once, to someone who finished an earlier version of the tour.
 *
 * Re-running the whole tour for them would punish the people who paid attention the first
 * time, and saying nothing would mean the feature the step exists to teach is only ever seen
 * by new users. So: exactly the new step, prefixed "New:", and never again.
 *
 * Deliberately waits for a real canvas rather than firing at load. The step points at the File
 * menu and talks about sharing *this diagram*; on an empty page it would be advertising
 * something the user cannot act on. "Back at the main level with at least one node" is the
 * cheapest honest proxy for "has a diagram in front of them".
 */
export function useTourUpgrade(enabled = true): void {
  const startNewStepOnly = useDocStore((s) => s.startNewStepOnly);
  const tourStep = useDocStore((s) => s.ui.onboarding.tourStep);
  const viewerMode = useDocStore((s) => s.ui.viewerMode);
  const demoActive = useDocStore((s) => s.ui.onboarding.demoActive);
  const navStack = useDocStore((s) => s.navStack);
  const doc = useDocStore((s) => s.doc);

  const shownRef = useRef(false);

  // Read once, at mount: a user who completes the tour during this session writes version 2
  // on the way out, and re-reading would then decide they are up to date mid-tour.
  const eligibleRef = useRef<boolean | null>(null);
  if (eligibleRef.current === null) {
    eligibleRef.current = readTourDone() && readTourVersion() < CURRENT_TOUR_VERSION;
  }

  const atMainLevel = navStack.length === 1;
  const hasContent = (doc.diagrams[navStack[0]]?.nodes.length ?? 0) > 0;

  useEffect(() => {
    if (!enabled || shownRef.current || !eligibleRef.current) return;
    // Never over the sample or an in-flight tour, and never to someone reading a shared link.
    if (viewerMode || demoActive || tourStep !== 0) return;
    if (!atMainLevel || !hasContent) return;

    shownRef.current = true;
    // Recorded as soon as it is shown, not when it is dismissed: someone who closes the tab on
    // seeing it has still seen it, and showing it again next time would be nagging.
    writeTourVersion();
    startNewStepOnly();
  }, [enabled, viewerMode, demoActive, tourStep, atMainLevel, hasContent, startNewStepOnly]);

  // A user who never finished the old tour is not "upgrading" — they get the full tour when it
  // runs. Recording the version for them as well keeps this check from re-arming later.
  useEffect(() => {
    if (tourStep >= TOUR_FINISHED) eligibleRef.current = false;
  }, [tourStep]);
}
