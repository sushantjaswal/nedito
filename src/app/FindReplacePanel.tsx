import { useEffect, useMemo, useState } from "react";
import { getCanvasInstance } from "../canvas/canvasApi";
import { findMatches, replaceOne, type FindMatch } from "../model/findReplace";
import { useDocStore } from "../model/store";
import styles from "./FindReplacePanel.module.css";

// Find/Replace: search shape/edge labels in the current diagram, step through
// matches (selecting + centering the canvas on each), replace the current match or all of
// them. A floating top-center bar rather than a corner panel — the sidebar top-right/top-left/
// bottom-right corners are already Layers/Outline/zoom controls.
export function FindReplacePanel() {
  const open = useDocStore((s) => s.ui.findReplaceOpen);
  const toggle = useDocStore((s) => s.toggleFindReplace);
  const doc = useDocStore((s) => s.doc);
  const diagramId = useDocStore((s) => s.currentDiagramId());
  const diagram = doc.diagrams[diagramId];
  const setSelection = useDocStore((s) => s.setSelection);
  const setNodeLabel = useDocStore((s) => s.setNodeLabel);
  const setEdgeLabel = useDocStore((s) => s.setEdgeLabel);
  const replaceAllMatches = useDocStore((s) => s.replaceAllMatches);

  const [query, setQuery] = useState("");
  const [replacement, setReplacement] = useState("");
  const [matchCase, setMatchCase] = useState(false);
  const [index, setIndex] = useState(0);

  const matches = useMemo(() => findMatches(diagram, query, matchCase), [diagram, query, matchCase]);
  const clampedIndex = matches.length === 0 ? 0 : Math.min(index, matches.length - 1);

  useEffect(() => {
    setIndex(0);
  }, [query, matchCase, diagramId]);

  useEffect(() => {
    if (!open || matches.length === 0) return;
    const match = matches[clampedIndex];
    goToMatch(match, diagram, setSelection);
    // Only the identity of the current match should trigger a re-center, not every keystroke
    // recomputing an equal-content matches array.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, matches[clampedIndex]?.kind, matches[clampedIndex]?.id]);

  if (!open) return null;

  const goNext = () => setIndex((i) => (matches.length === 0 ? 0 : (i + 1) % matches.length));
  const goPrev = () => setIndex((i) => (matches.length === 0 ? 0 : (i - 1 + matches.length) % matches.length));

  const replaceCurrent = () => {
    if (matches.length === 0) return;
    const match = matches[clampedIndex];
    const newText = replaceOne(diagram, match, query, replacement, matchCase);
    if (newText === undefined) return;
    if (match.kind === "node") {
      const node = diagram.nodes.find((n) => n.id === match.id);
      if (node?.label) setNodeLabel(match.id, { ...node.label, text: newText });
    } else {
      const edge = diagram.edges.find((e) => e.id === match.id);
      if (edge?.label) setEdgeLabel(match.id, { ...edge.label, text: newText });
    }
  };

  const replaceAll = () => replaceAllMatches(query, replacement, matchCase);

  return (
    <div className={styles.panel} data-testid="nd-find-replace-panel">
      <div className={styles.row}>
        <input
          autoFocus
          className={styles.input}
          placeholder="Find"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") goNext();
            if (e.key === "Escape") toggle();
          }}
          data-testid="nd-find-input"
        />
        <span className={styles.count} data-testid="nd-find-count">
          {matches.length === 0 ? "0/0" : `${clampedIndex + 1}/${matches.length}`}
        </span>
        <button type="button" className={styles.iconBtn} onClick={goPrev} disabled={matches.length === 0} title="Previous match">
          ↑
        </button>
        <button type="button" className={styles.iconBtn} onClick={goNext} disabled={matches.length === 0} title="Next match">
          ↓
        </button>
        <label className={styles.caseLabel} title="Match case">
          <input type="checkbox" checked={matchCase} onChange={(e) => setMatchCase(e.target.checked)} />
          Aa
        </label>
        <button type="button" className={styles.closeBtn} onClick={toggle} aria-label="Close find and replace">
          ×
        </button>
      </div>
      <div className={styles.row}>
        <input
          className={styles.input}
          placeholder="Replace"
          value={replacement}
          onChange={(e) => setReplacement(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") replaceCurrent();
          }}
          data-testid="nd-replace-input"
        />
        <button type="button" className={styles.textBtn} onClick={replaceCurrent} disabled={matches.length === 0}>
          Replace
        </button>
        <button type="button" className={styles.textBtn} onClick={replaceAll} disabled={matches.length === 0}>
          Replace All
        </button>
      </div>
    </div>
  );
}

function goToMatch(
  match: FindMatch,
  diagram: ReturnType<typeof useDocStore.getState>["doc"]["diagrams"][string],
  setSelection: (nodeIds: string[], edgeIds?: string[]) => void,
): void {
  if (match.kind === "node") {
    setSelection([match.id]);
    void getCanvasInstance()?.fitView({ nodes: [{ id: match.id }], duration: 200, padding: 0.5, maxZoom: 1 });
    return;
  }
  setSelection([], [match.id]);
  const edge = diagram.edges.find((e) => e.id === match.id);
  if (!edge) return;
  void getCanvasInstance()?.fitView({
    nodes: [edge.source.nodeId, edge.target.nodeId].filter((id): id is string => !!id).map((id) => ({ id })),
    duration: 200,
    padding: 0.5,
    maxZoom: 1,
  });
}
