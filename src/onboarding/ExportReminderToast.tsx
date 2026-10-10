import { BRAND } from "../app/brand";
import { saveDocument } from "../file/saveDocument";
import { useDocStore } from "../model/store";
import styles from "./ExportReminderToast.module.css";

// The piece of onboarding that actually prevents data loss. The local-only badge tells people
// their work lives only in this browser; this is what reminds them at the moment it matters —
// once they have enough unexported work to genuinely miss.
//
// A toast, never a modal: being nagged mid-thought by something you have to dismiss before you
// can keep drawing would be worse than the risk it warns about. Whether it may appear at all is
// decided in exportReminder.ts, not here.
export function ExportReminderToast() {
  const open = useDocStore((s) => s.ui.onboarding.reminderOpen);
  const changes = useDocStore((s) => s.ui.onboarding.actionsSinceExport);
  const noteExport = useDocStore((s) => s.noteExport);
  const dismiss = useDocStore((s) => s.dismissExportReminder);

  if (!open) return null;

  const download = () => {
    saveDocument(useDocStore.getState().doc);
    noteExport();
  };

  return (
    <div className={styles.toast} role="status" aria-live="polite" data-testid="nd-export-reminder">
      <button
        type="button"
        className={styles.close}
        onClick={dismiss}
        aria-label="Dismiss"
        data-testid="nd-export-reminder-close"
      >
        ✕
      </button>
      <h2 className={styles.title}>Save a copy while you&apos;re ahead</h2>
      <p className={styles.body}>
        You&apos;ve made {changes} changes. Your work lives only in this browser — download the {BRAND.fileExt} file to
        keep it safe.
      </p>
      <div className={styles.actions}>
        <button type="button" className={styles.primary} onClick={download} data-testid="nd-export-reminder-download">
          Download {BRAND.fileExt}
        </button>
        <button type="button" className={styles.later} onClick={dismiss} data-testid="nd-export-reminder-later">
          Later
        </button>
      </div>
    </div>
  );
}
