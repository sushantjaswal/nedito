import { useDocStore } from "../model/store";
import {
  matchPreset,
  orientationOf,
  PAGE_PRESETS,
  withOrientation,
  type Orientation,
} from "../model/pageSize";
import { effectiveOrder, hasOwnOrder, PRESENTATION_HINT, PRESENTATION_LABEL } from "../model/presentation";
import { PRESENTATION_MODES, type PresentationMode } from "../model/motion";
import styles from "./PageSettings.module.css";

const DEFAULT_BACKGROUND = "#f6f7f9";

// The page's own settings: its size and orientation, and its background. They lived in the right
// panel's Diagram settings view; since R1 (D90) they open from the canvas chip's Page button, and
// grid and snap — one click each — sit on the chip itself. Page size shipped once PDF export and
// print gave it something to mean.
export function PageSettings() {
  const background = useDocStore((s) => s.doc.diagrams[s.currentDiagramId()]?.background);
  const setDiagramBackground = useDocStore((s) => s.setDiagramBackground);
  const pageSize = useDocStore((s) => s.doc.diagrams[s.currentDiagramId()]?.pageSize);
  const setDiagramPageSize = useDocStore((s) => s.setDiagramPageSize);
  const drawIn = useDocStore((s) => s.doc.diagrams[s.currentDiagramId()]?.motion?.drawIn === true);
  const setDrawIn = useDocStore((s) => s.setDrawIn);
  const diagram = useDocStore((s) => s.doc.diagrams[s.currentDiagramId()]);
  const mode = diagram?.motion?.presentation?.mode ?? null;
  const setMode = useDocStore((s) => s.setPresentationMode);
  const setOrder = useDocStore((s) => s.setPresentationOrder);
  const previewing = useDocStore((s) => s.ui.presentationPreview !== null);
  const setPreview = useDocStore((s) => s.setPresentationPreview);
  const setPageSettingsOpen = useDocStore((s) => s.setPageSettingsOpen);
  const motionEnabled = useDocStore((s) => s.ui.motionEnabled);
  const reduced = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;

  const presetId = pageSize ? matchPreset(pageSize) : "none";
  const orientation: Orientation = pageSize ? orientationOf(pageSize) : "portrait";

  const changePreset = (id: string) => {
    if (id === "none") return setDiagramPageSize(undefined);
    const preset = PAGE_PRESETS.find((p) => p.id === id);
    if (preset) setDiagramPageSize(withOrientation(preset.size, orientation));
  };

  return (
    <div className={styles.section} data-testid="nd-page-settings">
      <label className={styles.label} htmlFor="nd-page-size">
        Page size
      </label>
      <select
        id="nd-page-size"
        className={styles.select}
        value={presetId}
        onChange={(e) => changePreset(e.target.value)}
        data-testid="nd-page-size"
      >
        <option value="none">None (infinite canvas)</option>
        {PAGE_PRESETS.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
        {presetId === "custom" && <option value="custom">Custom</option>}
      </select>
      {pageSize && (
        <div className={styles.orientationRow}>
          {(["portrait", "landscape"] as Orientation[]).map((o) => (
            <button
              key={o}
              type="button"
              className={orientation === o ? `${styles.orientationBtn} ${styles.orientationActive}` : styles.orientationBtn}
              onClick={() => setDiagramPageSize(withOrientation(pageSize, o))}
              data-testid={`nd-page-orientation-${o}`}
            >
              {o === "portrait" ? "Portrait" : "Landscape"}
            </button>
          ))}
        </div>
      )}

      <label className={styles.label} htmlFor="nd-background-color">
        Background
      </label>
      <div className={styles.backgroundRow}>
        <input
          id="nd-background-color"
          type="color"
          className={styles.colorInput}
          value={background ?? DEFAULT_BACKGROUND}
          onChange={(e) => setDiagramBackground(e.target.value)}
          data-testid="nd-background-color"
        />
        <button
          type="button"
          className={styles.resetButton}
          onClick={() => setDiagramBackground(undefined)}
          disabled={background === undefined}
        >
          Reset
        </button>
      </div>

      {/* Draw in (A5, D121): a one-shot for readers of a share link. */}
      <label className={styles.checkRow}>
        <input type="checkbox" checked={drawIn} onChange={(e) => setDrawIn(e.target.checked)} data-testid="nd-page-draw-in" />
        <span>
          Draw in
          <span className={styles.checkHint}>When a share link opens here, the lines trace themselves once.</span>
        </span>
      </label>

      {/* Presentation (A6, D123): one mode per level, so they cannot clash. */}
      <label className={styles.label} htmlFor="nd-presentation">
        Presentation
      </label>
      <select
        id="nd-presentation"
        className={styles.select}
        value={mode ?? "none"}
        onChange={(e) => setMode(e.target.value === "none" ? null : (e.target.value as PresentationMode))}
        data-testid="nd-presentation"
      >
        <option value="none">None</option>
        {PRESENTATION_MODES.map((m) => (
          <option key={m} value={m}>
            {PRESENTATION_LABEL[m]}
          </option>
        ))}
      </select>
      {mode && diagram && (
        <div className={styles.presentation} data-testid="nd-presentation-details">
          <span className={styles.checkHint}>{PRESENTATION_HINT[mode]}</span>
          <span className={styles.checkHint} data-testid="nd-presentation-order">
            {hasOwnOrder(diagram)
              ? `${effectiveOrder(diagram).length} steps, in your order. Set a step from a shape's or a line's Motion.`
              : `${effectiveOrder(diagram).length} steps, in reading order. Change one from a shape's or a line's Motion.`}
          </span>
          <div className={styles.backgroundRow}>
            {hasOwnOrder(diagram) && (
              <button type="button" className={styles.resetButton} onClick={() => setOrder([])} data-testid="nd-presentation-reset">
                Back to reading order
              </button>
            )}
            {mode !== "walkthrough" && (
              <button
                type="button"
                className={styles.resetButton}
                disabled={!motionEnabled || reduced}
                title={!motionEnabled || reduced ? "Motion is off here, so readers like you see the finished diagram" : undefined}
                onClick={() => {
                  // Out of the way, so the canvas can be watched; the hint over it has Stop.
                  if (!previewing) setPageSettingsOpen(false);
                  setPreview(!previewing);
                }}
                data-testid="nd-presentation-preview"
              >
                {previewing ? "Stop preview" : "Preview"}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
