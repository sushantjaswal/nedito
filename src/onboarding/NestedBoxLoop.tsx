import styles from "./NestedBoxLoop.module.css";

// A ~3.4s looping animation of a nested box opening to reveal its contents, shown inside the
// first coach mark. This is the one part of onboarding that survives being ignored: someone who
// dismisses every prompt has still watched a nested box expand, which is the single idea that
// makes this app different from any other diagram editor.
export function NestedBoxLoop() {
  return (
    <div className={styles.wrap} aria-hidden="true" data-testid="nd-nested-loop">
      <svg viewBox="0 0 300 74" width="100%" height="74">
        <g className={styles.inner}>
          <rect x="108" y="16" width="84" height="42" rx="8" fill="#FBFAFF" stroke="#6D5AE6" strokeWidth="1.4" />
          <text x="150" y="31" textAnchor="middle" fontSize="9" fontWeight="700" fill="#4B3BC4">
            Payment Service
          </text>
          <g className={styles.kids}>
            <rect x="118" y="38" width="28" height="14" rx="4" fill="#fff" stroke="#C7CCD4" strokeWidth=".9" />
            <rect x="154" y="38" width="28" height="14" rx="4" fill="#fff" stroke="#C7CCD4" strokeWidth=".9" />
            <path d="M146 45 H154" stroke="#9AA3B0" strokeWidth="1" />
          </g>
        </g>
      </svg>
    </div>
  );
}
