import { useEffect, useState } from "react";
import { useDocStore } from "../../model/store";
import { downloadBlob } from "../../file/download";
import { toFilename } from "../../file/saveDocument";
import { exportPptx } from "./pptxExport";
import styles from "./PptxExportDialog.module.css";

// Phase 3.4's export dialog. Its main job is the honesty the spec asks for: Slide Zoom is a
// Windows-authored, version-dependent feature, and a user who finds that out from a colleague's
// Mac mid-presentation has been failed by this dialog, not by PowerPoint.
export function PptxExportDialog() {
  const open = useDocStore((s) => s.ui.pptxDialogOpen);
  const close = useDocStore((s) => s.closePptxDialog);
  const [navigation, setNavigation] = useState<"zoom" | "link">("zoom");
  const [animate, setAnimate] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) close();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, close, busy]);

  if (!open) return null;

  const run = async () => {
    setBusy(true);
    const store = useDocStore.getState();
    try {
      const result = await exportPptx(store.doc, {
        navigation,
        // Undefined means "use the destination slide's own transition", which is PowerPoint's
        // default behaviour rather than no animation at all.
        transitionDurationMs: navigation === "zoom" && animate ? 900 : undefined,
      });
      downloadBlob(result.blob, toFilename(store.doc.meta.title, ".pptx"));
      store.noteExport();
      close();
      store.showNotice({
        message:
          result.zoomCount > 0
            ? `Exported ${result.slideCount} slides. ${result.zoomCount} nested ${result.zoomCount === 1 ? "block is" : "blocks are"} clickable in slideshow mode.`
            : `Exported ${result.slideCount} slides.`,
        tone: "info",
      });
    } catch {
      close();
      store.showNotice({ message: "Couldn't build the PowerPoint file for this diagram.", tone: "warn" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={styles.backdrop} onPointerDown={(e) => e.target === e.currentTarget && !busy && close()}>
      <div className={styles.dialog} role="dialog" aria-modal="true" aria-label="Export to PowerPoint" data-testid="nd-pptx-dialog">
        <div className={styles.header}>
          <h2 className={styles.title}>Export to PowerPoint</h2>
          <button type="button" className={styles.close} onClick={close} aria-label="Close" disabled={busy}>
            ✕
          </button>
        </div>

        <p className={styles.intro}>
          One slide per diagram, in nesting order. Each nested block becomes a clickable way into its own slide.
        </p>

        <fieldset className={styles.group}>
          <legend className={styles.legend}>How nested blocks open</legend>
          <label className={styles.option}>
            <input
              type="radio"
              name="nd-pptx-nav"
              checked={navigation === "zoom"}
              onChange={() => setNavigation("zoom")}
              data-testid="nd-pptx-nav-zoom"
            />
            <span>
              <strong>Slide Zoom</strong> — animated drill-in, click back to return. Shows the block&apos;s own collapsed
              view.
            </span>
          </label>
          <label className={styles.option}>
            <input
              type="radio"
              name="nd-pptx-nav"
              checked={navigation === "link"}
              onChange={() => setNavigation("link")}
              data-testid="nd-pptx-nav-link"
            />
            <span>
              <strong>Plain links</strong> — no animation, but works in every version of PowerPoint on every platform.
            </span>
          </label>
        </fieldset>

        {navigation === "zoom" && (
          <label className={styles.checkbox}>
            <input
              type="checkbox"
              checked={animate}
              onChange={(e) => setAnimate(e.target.checked)}
              data-testid="nd-pptx-animate"
            />
            Zoom transition
          </label>
        )}

        {/* The spec's degradation note, stated rather than discovered. */}
        <p className={styles.caveat} data-testid="nd-pptx-caveat">
          {navigation === "zoom"
            ? "Zooms are clickable in slideshow mode. They play in PowerPoint on Windows, Mac and mobile, but can only be created on Windows — older versions show the block as a still picture instead of zooming."
            : "Links are clickable in slideshow mode, in every version of PowerPoint."}
        </p>

        <div className={styles.actions}>
          <button type="button" className={styles.secondary} onClick={close} disabled={busy}>
            Cancel
          </button>
          <button type="button" className={styles.primary} onClick={run} disabled={busy} data-testid="nd-pptx-export">
            {busy ? "Building…" : "Export"}
          </button>
        </div>
      </div>
    </div>
  );
}
