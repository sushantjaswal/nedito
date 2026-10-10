// While tracing (D117): what is being traced, and how to stop. Shown over the canvas, in the
// editor and the viewer alike.
import { useDocStore } from "../model/store";
import styles from "./TraceHint.module.css";

export function TraceHint() {
  const trace = useDocStore((s) => s.trace);
  const diagram = useDocStore((s) => s.doc.diagrams[s.currentDiagramId()]);
  const setTrace = useDocStore((s) => s.setTrace);
  if (!trace || !diagram || trace.diagramId !== diagram.id) return null;
  const names = trace.focus
    .map((id) => diagram.nodes.find((n) => n.id === id))
    .filter((n) => n !== undefined)
    .map((n) => n.label?.text?.trim() || "this shape");
  if (names.length === 0) return null;
  const what = names.length === 1 ? names[0] : `${names.length} shapes`;

  return (
    <div className={`${styles.hint} nodrag nopan`} role="status" data-testid="nd-trace-hint">
      <span>
        Showing what <strong>{what}</strong> {names.length === 1 ? "touches" : "touch"}
      </span>
      <button type="button" className={styles.stop} onClick={() => setTrace(null)} data-testid="nd-trace-stop">
        Stop
      </button>
    </div>
  );
}
