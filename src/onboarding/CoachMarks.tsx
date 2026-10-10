import { useCallback, useEffect, useState } from "react";
import { TOUR_FINISHED, TOUR_LAST_STEP, useDocStore } from "../model/store";
import { navigateIntoNested } from "../nesting/navigation";
import { copyImageWithLiveLink } from "../share/copyImageLink";
import { NestedBoxLoop } from "./NestedBoxLoop";
import styles from "./CoachMarks.module.css";

const START_DELAY_MS = 700;
const SPOT_PAD = 10;
const CARD_WIDTH = 300;
const CARD_GAP = 20;
/**
 * How far right of the File trigger step 3's card sits.
 *
 * Every other step centres its card on the spotlight. Step 3 cannot: its target is the Export
 * button in the top-right corner (R2, D91), whose menu "Show me" opens downward and leftward from
 * the button's right edge — a centred card would cover the very entries it points at. So the
 * card sits to the menu's left, this far in from the button's right edge: wider than the menu.
 */
const MENU_CLEARANCE = 290;
const DONE_MS = 5200;
const HIGHLIGHT_MS = 2600;

interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

function rectOf(selector: string): Rect | null {
  const el = document.querySelector(selector);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return r.width === 0 && r.height === 0 ? null : { left: r.left, top: r.top, width: r.width, height: r.height };
}

// Three coach marks over the sample diagram: what a nested box is, how to get back out of one,
// and that the diagram stays clickable once it leaves the app. Deliberately non-blocking — the
// dimmed layer never swallows pointer events, so someone who ignores it entirely still lands in
// a fully working app (the spec's hard constraint).
export function CoachMarks() {
  const demoActive = useDocStore((s) => s.ui.onboarding.demoActive);
  const tourStep = useDocStore((s) => s.ui.onboarding.tourStep);
  const newStepOnly = useDocStore((s) => s.ui.onboarding.newStepOnly);
  const setTourStep = useDocStore((s) => s.setTourStep);
  const startBlankCanvas = useDocStore((s) => s.startBlankCanvas);
  const navStack = useDocStore((s) => s.navStack);
  const doc = useDocStore((s) => s.doc);

  const [rect, setRect] = useState<Rect | null>(null);
  const [showDone, setShowDone] = useState(false);
  const [copied, setCopied] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);

  const nestedNodeId = (() => {
    const root = doc.diagrams[navStack[0]];
    return root?.nodes.find((n) => n.type === "nested")?.id ?? null;
  })();

  const target =
    tourStep === 1
      ? nestedNodeId
        ? `[data-testid="nd-nested-node-${nestedNodeId}"]`
        : null
      : tourStep === 2
        ? `[data-testid="nd-breadcrumbs"]`
        : tourStep === 3
          ? // The Export button, closed — where Copy image with live link lives since R2 (D91).
            // Spotlighting a button already on screen and naming the command is far more robust
            // than driving a menu open and hoping it stays open while the tour measures it.
            `[data-testid="nd-export-split"]`
          : null;

  // Kick off shortly after the sample lands, so the canvas has painted and the box the first
  // mark points at actually exists to be measured.
  useEffect(() => {
    if (!demoActive || tourStep !== 0) return;
    const timer = window.setTimeout(() => {
      if (useDocStore.getState().ui.onboarding.demoActive) setTourStep(1);
    }, START_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [demoActive, tourStep, setTourStep]);

  useEffect(() => {
    if (!target) {
      setRect(null);
      return;
    }
    const measure = () => {
      const next = rectOf(target);
      setRect(next);
      // Target gone (a layout the tour cannot point at) — end silently rather than float a
      // tooltip over nothing.
      if (next === null) setTourStep(TOUR_FINISHED);
    };
    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [target, setTourStep]);

  const finish = useCallback(() => {
    setTourStep(TOUR_FINISHED);
    // The congratulation is for finishing the whole tour. Someone being shown a single new
    // step has not finished anything, so they get the step and nothing else.
    if (!useDocStore.getState().ui.onboarding.newStepOnly) setShowDone(true);
  }, [setTourStep]);

  useEffect(() => {
    if (!showDone) return;
    const timer = window.setTimeout(() => setShowDone(false), DONE_MS);
    return () => window.clearTimeout(timer);
  }, [showDone]);

  const skip = useCallback(() => setTourStep(TOUR_FINISHED), [setTourStep]);

  useEffect(() => {
    if (tourStep < 1 || tourStep > TOUR_LAST_STEP) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") skip();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [tourStep, skip]);

  // The user performing the action themselves advances the step, so following the instruction
  // and pressing the button lead to the same place.
  useEffect(() => {
    if (tourStep === 1 && navStack.length > 1) setTourStep(2);
    // Step 3 has no action to perform on the canvas, so drilling back out advances rather than
    // finishing — unless this is the standalone new step, which was never preceded by step 2.
    if (tourStep === 2 && navStack.length === 1) setTourStep(3);
  }, [navStack.length, tourStep, setTourStep]);

  // No nested node at all (the sample was replaced) means step 1 has nothing to point at.
  useEffect(() => {
    if (tourStep === 1 && nestedNodeId === null) setTourStep(TOUR_FINISHED);
  }, [tourStep, nestedNodeId, setTourStep]);

  const copyNow = useCallback(async () => {
    const store = useDocStore.getState();
    const diagram = store.doc.diagrams[store.currentDiagramId()];
    const outcome = await copyImageWithLiveLink(store.doc, diagram);
    if (outcome.ok) {
      setCopied(true);
      return;
    }
    // Clipboard refused. Hand over the link on the Notice surface rather than leaving the tour
    // claiming something happened that did not, then get out of the way.
    store.showNotice({
      message: outcome.error ?? "Couldn't copy the image.",
      tone: "warn",
      url: outcome.url,
    });
    finish();
  }, [finish]);

  const showExportMenu = useCallback(() => {
    const store = useDocStore.getState();
    store.requestExportMenu();
    store.setExportHighlight(true);
    window.setTimeout(() => useDocStore.getState().setExportHighlight(false), HIGHLIGHT_MS);
  }, []);

  if (showDone) {
    return (
      <div className={styles.done} data-testid="nd-tour-done">
        <span>That&apos;s the whole idea — diagrams inside diagrams. 🎉</span>
        <button type="button" onClick={startBlankCanvas} data-testid="nd-tour-start-own">
          Start my own
        </button>
      </div>
    );
  }

  if (tourStep < 1 || tourStep > TOUR_LAST_STEP || !rect) return null;

  const headings: Record<number, string> = {
    1: "This box holds a whole diagram",
    2: "The trail shows where you are",
    3: "Take it anywhere, still clickable",
  };
  const heading = tourStep === 3 && newStepOnly ? `New: ${headings[3]}` : headings[tourStep];

  const preferredLeft =
    tourStep === 3 ? rect.left + rect.width - MENU_CLEARANCE - CARD_WIDTH : rect.left + rect.width / 2 - CARD_WIDTH / 2;
  const cardLeft = Math.max(12, Math.min(preferredLeft, window.innerWidth - CARD_WIDTH - 12));
  const below = rect.top < 220;
  const cardTop = below ? rect.top + rect.height + CARD_GAP : undefined;
  const cardBottom = below ? undefined : window.innerHeight - rect.top + CARD_GAP;

  return (
    <>
      {/* The dim is a giant outward box-shadow on the spotlight, so the bright area is a real
          hole rather than an overlay with a transparent patch — and the element itself keeps
          pointer-events: none, which is what lets the canvas underneath stay usable. */}
      <div
        className={styles.spot}
        style={{
          left: rect.left - SPOT_PAD,
          top: rect.top - SPOT_PAD,
          width: rect.width + SPOT_PAD * 2,
          height: rect.height + SPOT_PAD * 2,
        }}
        data-testid="nd-coach-spot"
      />
      <div
        className={styles.card}
        style={{ left: cardLeft, top: cardTop, bottom: cardBottom }}
        role="dialog"
        aria-label={heading}
        data-testid={`nd-coach-step-${tourStep}`}
      >
        {tourStep === 1 && <NestedBoxLoop />}
        <h2 className={styles.heading}>{heading}</h2>

        {tourStep === 1 && (
          <p className={styles.body}>
            The stacked violet edges mean there&apos;s more inside. <strong>Click ⤢</strong> to open it.
          </p>
        )}
        {tourStep === 2 && (
          <p className={styles.body}>
            You&apos;re one level deeper, on this box&apos;s own canvas. <strong>Click &ldquo;Main&rdquo;</strong> to
            come back out — or press <strong>Esc</strong>.
          </p>
        )}
        {tourStep === 3 &&
          (copied ? (
            <p className={styles.body} data-testid="nd-coach-copied">
              Copied. Open Word or PowerPoint and paste to try it.
            </p>
          ) : (
            <>
              <p className={styles.body}>
                <strong>Export ▾ › Copy image with live link</strong> puts this diagram on your clipboard. Paste it into
                Word or PowerPoint, and clicking the picture reopens it here, fully drillable.
              </p>
              {/* The export options live behind a disclosure rather than in the body: with them
                  inline the card runs to four sentences, and the spec caps step 3 at three. */}
              <button
                type="button"
                className={styles.moreToggle}
                aria-expanded={moreOpen}
                onClick={() => setMoreOpen((v) => !v)}
                data-testid="nd-coach-more-ways"
              >
                {moreOpen ? "▾" : "▸"} More ways to share
              </button>
              {moreOpen && (
                <div className={styles.more} data-testid="nd-coach-more-panel">
                  <p className={styles.moreLine}>
                    <strong>Export to PowerPoint</strong> — slides that zoom into each Nested Block.
                  </p>
                  <p className={styles.moreLine}>
                    <strong>Export to Word</strong> — a figure per diagram, linked to each other.
                  </p>
                  <button
                    type="button"
                    className={styles.ghost}
                    onClick={showExportMenu}
                    data-testid="nd-coach-show-exports"
                  >
                    Show me
                  </button>
                </div>
              )}
            </>
          ))}

        <div className={styles.footer}>
          {/* A step counter is only true when there are steps to count. */}
          <span className={styles.stepCount}>{newStepOnly ? "" : `${tourStep} of ${TOUR_LAST_STEP}`}</span>
          {!copied && (
            <button type="button" className={styles.ghost} onClick={skip} data-testid="nd-coach-skip">
              Skip
            </button>
          )}
          <button
            type="button"
            className={styles.primary}
            onClick={() => {
              if (tourStep === 1 && nestedNodeId) navigateIntoNested(nestedNodeId);
              else if (tourStep === 2) useDocStore.getState().navigateToLevel(0);
              else if (tourStep === 3 && !copied) void copyNow();
              else finish();
            }}
            data-testid="nd-coach-next"
          >
            {tourStep === 1 ? "Show me" : tourStep === 2 ? "Got it" : copied ? "Done" : "Copy it now"}
          </button>
        </div>
      </div>
    </>
  );
}
