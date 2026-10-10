import { BRAND } from "../app/brand";
import { useDocStore } from "../model/store";
import styles from "./SampleStrip.module.css";

// Sits between the top bar and the canvas while the bundled sample is showing, so it is never
// ambiguous whose diagram this is. A strip rather than a modal: it explains without blocking,
// and the escape hatch is right there in it.
export function SampleStrip() {
  const demoActive = useDocStore((s) => s.ui.onboarding.demoActive);
  const startBlankCanvas = useDocStore((s) => s.startBlankCanvas);
  const setSidebarTab = useDocStore((s) => s.setSidebarTab);

  if (!demoActive) return null;

  return (
    <div className={styles.strip} data-testid="nd-sample-strip">
      <span className={styles.text}>
        <span aria-hidden="true">👋</span> This is a sample diagram so you can see how {BRAND.name} works.
      </span>
      <button type="button" className={styles.button} onClick={startBlankCanvas} data-testid="nd-start-blank">
        Start a blank canvas
      </button>
      {/* Clears the sample exactly like the blank option, then puts the catalogue in front of
          them — for the many people whose answer to "blank canvas" is "of what?". */}
      <button
        type="button"
        className={styles.button}
        onClick={() => {
          startBlankCanvas();
          setSidebarTab("templates");
        }}
        data-testid="nd-start-from-template"
      >
        Start from a template
      </button>
    </div>
  );
}
