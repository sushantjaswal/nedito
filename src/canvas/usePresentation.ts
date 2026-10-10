// What a presentation mode does to the open level right now.
//
//   - Walkthrough: numbered badges, readers' and the author's alike, and a dot travelling the path
//     between steps while motion is allowed. It hides nothing, so it runs in the editor too.
//   - Build: in the share-link viewer, the steps appear one by one, once per level a session;
//     afterwards, and whenever motion is off, the diagram is simply complete.
//   - Spotlight: in the viewer, the focus moves from step to step on its own, and a reader's own
//     trace takes over while it lasts.
// Build and Spotlight would get in the way of editing, so in the editor they run only as a
// preview the author starts from the Page popover; there, their steps carry outline numbers.
import { useEffect, useMemo, useState } from "react";
import { useDocStore } from "../model/store";
import { buildHidden, effectiveOrder, spotlightLit } from "../model/presentation";
import type { PresentationMode } from "../model/motion";
import type { Diagram } from "../model/types";
import type { StepBadgeKind } from "./StepBadge";

export const BUILD_START_MS = 450;
export const BUILD_STEP_MS = 750;
/** How long a preview of Build holds the finished diagram before giving the editor back. */
export const BUILD_HOLD_MS = 1400;
export const SPOTLIGHT_STEP_MS = 2600;

export interface PresentationState {
  mode: PresentationMode | null;
  /** Step numbers to badge, and how; null when no badge shows. */
  steps: Map<string, number> | null;
  badge: StepBadgeKind | null;
  /** Build in progress: the ids not shown yet. */
  hidden: Set<string> | null;
  /** Spotlight: what stays lit; everything else steps back. */
  lit: { nodes: Set<string>; edges: Set<string> } | null;
  /** Walkthrough's travelling dot shows. */
  walking: boolean;
}

const built = new Set<string>();

/** Tests only. */
export function resetPresentationForTests(): void {
  built.clear();
}

function reducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
}

export function usePresentation(diagram: Diagram, diagramId: string): PresentationState {
  const viewerMode = useDocStore((s) => s.ui.viewerMode);
  const motionEnabled = useDocStore((s) => s.ui.motionEnabled);
  const preview = useDocStore((s) => s.ui.presentationPreview === diagramId);
  const tracing = useDocStore((s) => s.trace !== null);
  const mode = diagram.motion?.presentation?.mode ?? null;
  const order = useMemo(() => effectiveOrder(diagram), [diagram]);
  const allowed = motionEnabled && !reducedMotion();

  const buildStartable = mode === "build" && allowed && (preview || viewerMode);
  const spotlightPlaying = mode === "spotlight" && allowed && (preview || viewerMode);

  // Build: the level it is running on, and how many steps have appeared. A level counts as built
  // once its run finishes — deciding it at the start would let React's second effect pass (Strict
  // Mode) see the level as built already and cancel its own run.
  const [run, setRun] = useState<string | null>(null);
  useEffect(() => {
    setRun(buildStartable && (preview || !built.has(diagramId)) ? diagramId : null);
  }, [buildStartable, preview, diagramId]);

  const [shown, setShown] = useState<number | null>(null);
  useEffect(() => {
    if (run === null) {
      setShown(null);
      return;
    }
    setShown(0);
    const timers: number[] = [];
    for (let i = 1; i <= order.length; i++) timers.push(window.setTimeout(() => setShown(i), BUILD_START_MS + (i - 1) * BUILD_STEP_MS));
    const done = BUILD_START_MS + Math.max(order.length - 1, 0) * BUILD_STEP_MS + BUILD_HOLD_MS;
    timers.push(
      window.setTimeout(() => {
        setShown(null);
        setRun(null);
        const s = useDocStore.getState();
        if (s.ui.presentationPreview) s.setPresentationPreview(false);
        else built.add(run);
      }, done),
    );
    return () => timers.forEach((t) => window.clearTimeout(t));
    // order.length, not order: a level's order cannot change while a reader watches it build.
  }, [run, order.length]);
  const buildPlaying = run === diagramId;

  // Spotlight: which step has the focus.
  const [focus, setFocus] = useState(0);
  useEffect(() => {
    if (!spotlightPlaying || order.length === 0) return;
    setFocus(0);
    const t = window.setInterval(() => setFocus((i) => i + 1), SPOTLIGHT_STEP_MS);
    return () => window.clearInterval(t);
  }, [spotlightPlaying, order.length]);

  return useMemo(() => {
    const hidden = buildPlaying && shown !== null ? buildHidden(diagram, shown) : null;
    const spot = spotlightPlaying && !tracing && order.length ? order[focus % order.length] : null;
    const badge: StepBadgeKind | null =
      mode === "walkthrough" ? "walkthrough" : mode && !viewerMode && !preview ? "draft" : null;
    return {
      mode,
      steps: badge ? new Map(order.map((id, i) => [id, i + 1])) : null,
      badge,
      hidden,
      lit: spot ? spotlightLit(diagram, spot) : null,
      walking: mode === "walkthrough" && allowed && order.length > 1,
    };
  }, [buildPlaying, shown, diagram, spotlightPlaying, tracing, order, focus, mode, viewerMode, preview, allowed]);
}
