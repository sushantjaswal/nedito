import { useDocStore } from "../model/store";
import { navigateToBreadcrumb } from "../nesting/navigation";
import styles from "./Breadcrumbs.module.css";

// The nesting trail — "Main › Payment Service › Fraud Engine" (CLAUDE.md). Shared by the
// editor's top bar and the read-only share viewer: navigating levels is the whole point of a
// nested diagram, so a viewer without breadcrumbs would be a viewer that can't be read.
export function Breadcrumbs() {
  // Lit while the second coach mark is pointing at it, so the thing the card is talking about
  // is unmistakable rather than merely un-dimmed.
  const tourHighlight = useDocStore((s) => s.ui.onboarding.tourStep === 2);
  const doc = useDocStore((s) => s.doc);
  const navStack = useDocStore((s) => s.navStack);

  const crumbs = navStack.map((id) => doc.diagrams[id]?.title ?? id);

  return (
    <div className={styles.breadcrumbs}>
      {/* The trail shrink-wraps its crumbs inside the full-width centring container: the coach
          mark spotlights and highlights this element, and pointing it at the stretched
          container would cut a hole across the entire top bar. */}
      <div
        className={tourHighlight ? `${styles.trail} ${styles.trailLit}` : styles.trail}
        data-testid="nd-breadcrumbs"
      >
        {crumbs.map((title, i) => {
          const isCurrent = i === crumbs.length - 1;
          return (
            <span key={`${title}-${i}`} style={{ display: "contents" }}>
              {i > 0 && <span className={styles.separator}>›</span>}
              <button
                type="button"
                className={isCurrent ? `${styles.crumb} ${styles.crumbCurrent}` : styles.crumb}
                onClick={() => !isCurrent && navigateToBreadcrumb(i)}
                disabled={isCurrent}
                data-testid={`nd-breadcrumb-${i}`}
              >
                {title}
              </button>
            </span>
          );
        })}
      </div>
    </div>
  );
}
