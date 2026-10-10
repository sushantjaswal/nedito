import type { HealthState } from "../model/motion";
import { HEALTH_LABEL, HEALTH_SIZE, HEALTH_SYMBOL, HEALTH_TOKEN } from "./healthStatus";

/**
 * A shape's status badge (A4, D120), at its top-right corner. Degraded and down blink — opacity
 * only, so the compositor runs it — and healthy holds still; every motion switch stops the blink.
 */
export function HealthBadge({ state }: { state: HealthState }) {
  return (
    <span
      className={state === "healthy" ? "nd-health" : "nd-anim nd-health nd-health-blink"}
      data-health={state}
      title={`${HEALTH_LABEL[state]} — status set by the author, not live`}
      role="img"
      aria-label={`Status: ${HEALTH_LABEL[state]} (set by the author)`}
      data-testid="nd-health"
    >
      <svg viewBox="0 0 16 16" width={HEALTH_SIZE} height={HEALTH_SIZE} aria-hidden="true">
        <circle cx="8" cy="8" r="7.25" fill={HEALTH_TOKEN[state]} stroke="#ffffff" strokeWidth="1.5" />
        <path d={HEALTH_SYMBOL[state]} fill="none" stroke="#ffffff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}
