// While the author previews Build or Spotlight in the editor (A6, D123): what is playing, and how
// to stop. Esc stops it too, as it ends a trace.
import { useDocStore } from "../model/store";
import { PRESENTATION_LABEL } from "../model/presentation";
import styles from "./TraceHint.module.css";

export function PreviewHint() {
  const previewing = useDocStore((s) => s.ui.presentationPreview !== null && s.ui.presentationPreview === s.currentDiagramId());
  const mode = useDocStore((s) => s.doc.diagrams[s.currentDiagramId()]?.motion?.presentation?.mode);
  const tracing = useDocStore((s) => s.trace !== null);
  const setPreview = useDocStore((s) => s.setPresentationPreview);
  // A trace shows its own hint, and takes over the canvas while it lasts.
  if (!previewing || !mode || tracing) return null;

  return (
    <div className={`${styles.hint} nodrag nopan`} role="status" data-testid="nd-preview-hint">
      <span>
        Previewing <strong>{PRESENTATION_LABEL[mode]}</strong> as readers see it
      </span>
      <button type="button" className={styles.stop} onClick={() => setPreview(false)} data-testid="nd-preview-stop">
        Stop
      </button>
    </div>
  );
}
