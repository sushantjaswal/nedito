// The Export split button. Its main part repeats the last format used
// in this browser — PNG until the first export — so the export you do most is one click; its arrow
// lists every format, with Copy image with live link at the top and Print at the bottom.
import { useState } from "react";
import { useDocStore } from "../model/store";
import { copyImageLink, EXPORT_FORMATS, print, readLastExport, runExport } from "./fileActions";
import { Menu, MenuDivider, MenuItem } from "./Menu";
import styles from "./TopBar.module.css";

/** Documents built for other people's tools first, then pictures, then the file itself. */
const SHAREABLE = new Set(["pptx", "docx"]);

export function ExportButton() {
  const [last, setLast] = useState(readLastExport);
  // The tour's "Show me" opens this menu and rings the PowerPoint and Word entries (D63).
  const openRequest = useDocStore((s) => s.ui.exportMenuRequest);
  const highlight = useDocStore((s) => s.ui.exportHighlight);

  const exportAs = async (formatId: string) => {
    const format = EXPORT_FORMATS.find((f) => f.id === formatId)!;
    setLast(format);
    await runExport(format);
  };

  return (
    <div className={styles.split} role="group" aria-label="Export" data-testid="nd-export-split">
      <button
        type="button"
        className={styles.splitMain}
        onClick={() => void exportAs(last.id)}
        title={`Export as ${last.label} (${last.ext})`}
        data-testid="nd-export-main"
      >
        Export {last.short}
      </button>
      <Menu
        trigger={<span aria-hidden="true">▾</span>}
        triggerLabel="All export formats"
        triggerClassName={styles.splitArrow}
        testId="nd-export-menu-trigger"
        align="right"
        openRequest={openRequest}
      >
        {(close) => (
          <>
            <MenuItem label="Copy image with live link" onSelect={() => (close(), void copyImageLink())} testId="nd-copy-image-link" />
            <MenuDivider />
            {EXPORT_FORMATS.map((f, i) => (
              <span key={f.id} style={{ display: "contents" }}>
                {i > 0 && SHAREABLE.has(EXPORT_FORMATS[i - 1].id) !== SHAREABLE.has(f.id) && <MenuDivider />}
                <MenuItem
                  label={
                    <>
                      {f.label}
                      <span style={{ marginLeft: 8, opacity: 0.55, fontSize: 11 }}>{f.ext}</span>
                    </>
                  }
                  highlighted={highlight && SHAREABLE.has(f.id)}
                  onSelect={() => (close(), void exportAs(f.id))}
                  testId={f.testId}
                />
              </span>
            ))}
            <MenuDivider />
            <MenuItem label="Print…" onSelect={() => (close(), void print())} testId="nd-print" />
          </>
        )}
      </Menu>
    </div>
  );
}
