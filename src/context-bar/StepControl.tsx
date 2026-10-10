// A presentation step, in the Motion popover of a shape or a line:
// where the selection falls in this level's Build, Walkthrough or Spotlight, and the means to move
// it, add it or leave it out. Shown only when the level has a presentation mode (Page popover).
import { useDocStore } from "../model/store";
import { addSteps, effectiveOrder, hasOwnOrder, moveStep, PRESENTATION_LABEL, removeSteps } from "../model/presentation";
import styles from "./MotionSection.module.css";

export function StepControl({ ids }: { ids: string[] }) {
  const diagram = useDocStore((s) => s.doc.diagrams[s.currentDiagramId()]);
  const setOrder = useDocStore((s) => s.setPresentationOrder);
  const mode = diagram?.motion?.presentation?.mode;
  if (!diagram || !mode || ids.length === 0) return null;

  const order = effectiveOrder(diagram);
  const at = ids.map((id) => order.indexOf(id));
  const allIn = at.every((i) => i >= 0);
  const noneIn = at.every((i) => i < 0);
  const single = ids.length === 1 ? at[0] : null;

  return (
    <div className={styles.steps} data-testid="nd-step-control">
      <div className={styles.heading}>{PRESENTATION_LABEL[mode]} step</div>
      <div className={styles.stepStatus} data-testid="nd-step-status">
        {single !== null
          ? single >= 0
            ? `Step ${single + 1} of ${order.length}`
            : "Not a step"
          : allIn
            ? `Steps ${at.map((i) => i + 1).sort((a, b) => a - b).join(", ")}`
            : noneIn
              ? "Not steps"
              : "Some are steps"}
      </div>
      <div className={styles.choices}>
        {single !== null && single >= 0 && (
          <>
            <button
              type="button"
              className={styles.choice}
              disabled={single === 0}
              onClick={() => setOrder(moveStep(diagram, ids[0], -1))}
              data-testid="nd-step-earlier"
            >
              Earlier
            </button>
            <button
              type="button"
              className={styles.choice}
              disabled={single === order.length - 1}
              onClick={() => setOrder(moveStep(diagram, ids[0], 1))}
              data-testid="nd-step-later"
            >
              Later
            </button>
          </>
        )}
        {!allIn && (
          <button type="button" className={styles.choice} onClick={() => setOrder(addSteps(diagram, ids))} data-testid="nd-step-add">
            {single !== null ? `Add as step ${order.length + 1}` : "Add as steps"}
          </button>
        )}
        {!noneIn && (
          <button type="button" className={styles.choice} onClick={() => setOrder(removeSteps(diagram, ids))} data-testid="nd-step-remove">
            Leave out
          </button>
        )}
      </div>
      {!hasOwnOrder(diagram) && <p className={styles.note}>In reading order until you change a step.</p>}
    </div>
  );
}
