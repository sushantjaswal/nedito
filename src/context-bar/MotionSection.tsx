// Motion for the selected shapes (A1, D116): Pulse, with an optional ripple. Health and, on a
// Nested Block, Peek join this popover in later PRs. A mixed selection reads as "on" only when
// every shape has it, so one click makes them all agree.
import { useDocStore } from "../model/store";
import { HEALTH_STATES, type HealthState } from "../model/motion";
import { HEALTH_LABEL } from "../canvas/healthStatus";
import type { DNode } from "../model/types";
import styles from "./MotionSection.module.css";
import { StepControl } from "./StepControl";

export function MotionSection({ nodes }: { nodes: DNode[] }) {
  const setNodeMotion = useDocStore((s) => s.setNodeMotion);
  const setPeek = useDocStore((s) => s.setPeek);
  const nested = nodes.length === 1 && nodes[0].type === "nested" ? nodes[0] : null;
  const ids = nodes.map((n) => n.id);
  const pulsing = nodes.length > 0 && nodes.every((n) => n.motion?.pulse);
  const rippling = pulsing && nodes.every((n) => n.motion?.pulse?.ripple);
  const health = nodes.length > 0 && nodes.every((n) => n.motion?.health === nodes[0].motion?.health) ? nodes[0].motion?.health ?? "off" : "mixed";

  return (
    <div className={styles.section} data-testid="nd-motion-section">
      <label className={styles.row}>
        <input
          type="checkbox"
          checked={pulsing}
          onChange={(e) => setNodeMotion(ids, { pulse: e.target.checked ? {} : null })}
          data-testid="nd-motion-pulse"
        />
        <span>
          Pulse
          <span className={styles.hint}>Draws the eye: the outline glows and settles.</span>
        </span>
      </label>
      <label className={pulsing ? styles.row : `${styles.row} ${styles.disabled}`}>
        <input
          type="checkbox"
          checked={rippling}
          disabled={!pulsing}
          onChange={(e) => setNodeMotion(ids, { pulse: e.target.checked ? { ripple: true } : {} })}
          data-testid="nd-motion-ripple"
        />
        <span>With a ripple</span>
      </label>
      {nested && (
        <label className={styles.row}>
          <input type="checkbox" checked={nested.peek === true} onChange={(e) => setPeek(nested.id, e.target.checked)} data-testid="nd-motion-peek" />
          <span>
            Peek
            <span className={styles.hint}>Stirs a few times the first time it is seen, to show the box opens.</span>
          </span>
        </label>
      )}
      <div className={styles.heading}>Health</div>
      <div className={styles.choices} role="radiogroup" aria-label="Health">
        {(["off", ...HEALTH_STATES] as ("off" | HealthState)[]).map((h) => (
          <button
            key={h}
            type="button"
            role="radio"
            aria-checked={health === h}
            className={styles.choice}
            onClick={() => setNodeMotion(ids, { health: h === "off" ? null : h })}
            data-testid={`nd-motion-health-${h}`}
          >
            {h === "off" ? "None" : HEALTH_LABEL[h]}
          </button>
        ))}
      </div>
      <p className={styles.note}>A status you set by hand — the badge says so, so nobody mistakes it for live.</p>
      <p className={styles.note}>Still in pictures and printouts. Readers can turn motion off.</p>
      {/* A group's frame is not a step; its shapes are (A6, D123). */}
      <StepControl ids={nodes.filter((n) => n.type !== "group").map((n) => n.id)} />
    </div>
  );
}
