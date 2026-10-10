import { useEffect } from "react";
import { LIBRARY_GROUPS, sectionDisplayLabel } from "./libraryGroups";
import type { SectionId } from "./stencils";
import styles from "./BrowseLibrariesDialog.module.css";

interface BrowseLibrariesDialogProps {
  enabled: Set<SectionId>;
  onToggle: (id: SectionId) => void;
  onClose: () => void;
}

/** Favorites first, then every purpose group's sections, in sidebar order. */
const LISTING: { heading: string; sections: SectionId[] }[] = [
  { heading: "Yours", sections: ["scratchpad"] },
  ...LIBRARY_GROUPS.map((g) => ({ heading: g.label, sections: g.sections })),
];

// "Browse all libraries", once draw.io's "More Shapes…" dialog: a
// checklist to show or hide whole shape-library sections, now laid out under the purpose groups
// the sidebar shows them in. It still works section by section, on the same stored setting.
export function BrowseLibrariesDialog({ enabled, onToggle, onClose }: BrowseLibrariesDialogProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className={styles.overlay} onClick={onClose} data-testid="nd-browse-libraries-dialog">
      <div
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="nd-browse-libraries-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.header}>
          <h2 className={styles.title} id="nd-browse-libraries-title">
            Browse all libraries
          </h2>
          <button type="button" className={styles.closeBtn} onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <div className={styles.list}>
          {LISTING.map(({ heading, sections }, i) => (
            <div key={heading} role="group" aria-labelledby={`nd-browse-group-${i}`}>
              <div className={styles.groupHeading} id={`nd-browse-group-${i}`}>
                {heading}
              </div>
              {sections.map((id) => (
                <label key={id} className={styles.row}>
                  <input type="checkbox" checked={enabled.has(id)} onChange={() => onToggle(id)} data-testid={`nd-browse-section-${id}`} />
                  {sectionDisplayLabel(id)}
                </label>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
