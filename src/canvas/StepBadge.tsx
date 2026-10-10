import { stepWidth, STEP_SIZE } from "./stepGeometry";

export type StepBadgeKind = "walkthrough" | "draft";

/**
 * A presentation step number (A6, D123). A shape's sits on its top-left corner; a line's on its
 * middle (`at`, in canvas coordinates). Walkthrough's is solid and readers see it; Build's and
 * Spotlight's is an outline, for the author only.
 */
export function StepBadge({ n, kind, at }: { n: number; kind: StepBadgeKind; at?: { x: number; y: number } }) {
  const w = stepWidth(n);
  return (
    <span
      className={`nd-step nd-step-${kind}`}
      style={{
        width: w,
        height: STEP_SIZE,
        ...(at ? { position: "absolute", left: 0, top: 0, transform: `translate(-50%, -50%) translate(${at.x}px, ${at.y}px)` } : {}),
      }}
      title={kind === "draft" ? `Step ${n} — readers see the order, not this number` : `Step ${n}`}
      data-testid={`nd-step-${n}`}
    >
      {n}
    </span>
  );
}
