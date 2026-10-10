import { useEffect, useMemo, useState } from "react";
import { useDocStore } from "../../model/store";
import { makeGif } from "../../app/fileActions";
import { computeDiagramBounds } from "../../file/svgExport";
import {
  frameMsOf,
  GIF_RATES,
  GIF_SIZES,
  gifPixels,
  maxSideOf,
  readGifRate,
  readGifSize,
  writeGifRate,
  writeGifSize,
  type GifRate,
  type GifSize,
} from "../../file/gifSize";
import styles from "../pptx/PptxExportDialog.module.css";

// The GIF export's choices: how big (G3, CLAUDE_HISTORY.md D141) — each option showing the pixels
// this level would come out at — and how smooth (G4, D142), the other lever on the file's size.
// Both remembered.
export function GifExportDialog() {
  const open = useDocStore((s) => s.ui.gifDialogOpen);
  const close = useDocStore((s) => s.closeGifDialog);
  const diagram = useDocStore((s) => s.doc.diagrams[s.currentDiagramId()]);
  const [size, setSize] = useState<GifSize>(readGifSize);
  const [rate, setRate] = useState<GifRate>(readGifRate);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const busy = progress !== null;

  useEffect(() => {
    if (!open) return;
    setSize(readGifSize());
    setRate(readGifRate());
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) close();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, close, busy]);

  const bounds = useMemo(() => (open && diagram ? computeDiagramBounds(diagram) : null), [open, diagram]);
  if (!open || !bounds) return null;

  const run = async () => {
    writeGifSize(size);
    writeGifRate(rate);
    setProgress({ done: 0, total: 1 });
    try {
      await makeGif({ maxSide: maxSideOf(size), frameMs: frameMsOf(rate) }, (done, total) => setProgress({ done, total }));
    } finally {
      setProgress(null);
      close();
    }
  };

  return (
    <div className={styles.backdrop} onPointerDown={(e) => e.target === e.currentTarget && !busy && close()}>
      <div className={styles.dialog} role="dialog" aria-modal="true" aria-label="Export an animated image" data-testid="nd-gif-dialog">
        <div className={styles.header}>
          <h2 className={styles.title}>Animated image (GIF)</h2>
          <button type="button" className={styles.close} onClick={close} aria-label="Close" disabled={busy}>
            ✕
          </button>
        </div>

        <p className={styles.intro}>This level as it moves, looping. A larger picture is sharper, and a larger file.</p>

        <fieldset className={styles.group} disabled={busy}>
          <legend className={styles.legend}>Size</legend>
          {GIF_SIZES.map((s) => {
            const px = gifPixels(bounds, s.maxSide);
            return (
              <label key={s.id} className={styles.option}>
                <input type="radio" name="nd-gif-size" checked={size === s.id} onChange={() => setSize(s.id)} data-testid={`nd-gif-size-${s.id}`} />
                <span>
                  <strong>{s.label}</strong> — {px.w} × {px.h} px. {s.hint}.
                </span>
              </label>
            );
          })}
        </fieldset>

        <fieldset className={styles.group} disabled={busy}>
          <legend className={styles.legend}>Motion</legend>
          {GIF_RATES.map((r) => (
            <label key={r.id} className={styles.option}>
              <input type="radio" name="nd-gif-rate" checked={rate === r.id} onChange={() => setRate(r.id)} data-testid={`nd-gif-rate-${r.id}`} />
              <span>
                <strong>{r.label}</strong> — {r.hint}.
              </span>
            </label>
          ))}
        </fieldset>

        <div className={styles.actions}>
          <button type="button" className={styles.secondary} onClick={close} disabled={busy}>
            Cancel
          </button>
          <button type="button" className={styles.primary} onClick={run} disabled={busy} data-testid="nd-gif-export">
            {busy ? `Making… ${Math.round((progress.done / Math.max(1, progress.total)) * 100)}%` : "Make GIF"}
          </button>
        </div>
      </div>
    </div>
  );
}
