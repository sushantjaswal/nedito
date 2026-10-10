import { ErrorBoundary } from "./ErrorBoundary";
import { DiagramCanvas } from "../canvas/DiagramCanvas";
import { ShapeLibrary } from "../library/ShapeLibrary";
import { CoachMarks } from "../onboarding/CoachMarks";
import { ExportReminderToast } from "../onboarding/ExportReminderToast";
import { SampleStrip } from "../onboarding/SampleStrip";
import { PptxExportDialog } from "../export/pptx/PptxExportDialog";
import { GifExportDialog } from "../export/gif/GifExportDialog";
import { ApplyTemplateDialog } from "../templates/ApplyTemplateDialog";
import { EmptyCanvasPanel } from "../templates/EmptyCanvasPanel";
import { ShareDialog } from "../share/ShareDialog";
import { useDemoDiagram } from "../onboarding/useDemoDiagram";
import { useExportReminder } from "../onboarding/useExportReminder";
import { useTourUpgrade } from "../onboarding/useTourUpgrade";
import styles from "./AppShell.module.css";
import { FindReplacePanel } from "./FindReplacePanel";
import { ImportNoticesPanel } from "./ImportNoticesPanel";
import { LayersPanel } from "./LayersPanel";
import { Notice } from "./Notice";
import { PageTabStrip } from "./PageTabStrip";
import { RestoreOnLoad } from "./RestoreOnLoad";
import { ShortcutsDialog } from "./ShortcutsDialog";
import { CommandPalette } from "./CommandPalette";
import { PreferencesDialog } from "./PreferencesDialog";
import { AboutDialog } from "./AboutDialog";
import { DeletePromptDialog } from "./DeletePromptDialog";
import { StatusBar } from "./StatusBar";
import { TopBar } from "./TopBar";
import { useAutosave } from "./useAutosave";
import { useFileDrop } from "./useFileDrop";
import { useGlobalShortcuts } from "./useGlobalShortcuts";
import { useSyncTheme } from "./useSyncTheme";
import { useSyncMotion } from "./useSyncMotion";

interface AppShellProps {
  /**
   * The document on screen arrived through a share link and the user chose "Edit a copy". Two
   * pieces of first-run behaviour have to stand down in that case, because both would replace
   * the document they just asked to keep: the silent restore (which loads whatever the
   * recipient had autosaved earlier) and the first-visit sample (which loads when there is no
   * autosave at all — exactly the situation a first-time visitor following a link is in).
   */
  fromShareLink?: boolean;
}

export function AppShell({ fromShareLink = false }: AppShellProps = {}) {
  useGlobalShortcuts();
  useDemoDiagram(!fromShareLink);
  useExportReminder();
  useTourUpgrade(!fromShareLink);
  useAutosave();
  useFileDrop();
  useSyncTheme();
  useSyncMotion();

  return (
    <div className={styles.shell}>
      {/* Each region fails on its own (ErrorBoundary.tsx): the hooks above, autosave among them,
          live in this component, so they keep running whatever a region below throws. */}
      <div className={styles.topbar}>
        <ErrorBoundary area="the menu bar">
          <TopBar />
          <SampleStrip />
        </ErrorBoundary>
      </div>
      <div className={styles.left}>
        <ErrorBoundary area="the shape library">
          <ShapeLibrary />
        </ErrorBoundary>
      </div>
      <div className={styles.canvas}>
        <ErrorBoundary area="the canvas">
          <DiagramCanvas />
        </ErrorBoundary>
        <ErrorBoundary area="the canvas panels">
          <EmptyCanvasPanel />
          <LayersPanel />
          <FindReplacePanel />
          <ImportNoticesPanel />
        </ErrorBoundary>
      </div>
      <div className={styles.pages}>
        <ErrorBoundary area="the page tabs">
          <PageTabStrip />
        </ErrorBoundary>
      </div>
      <div className={styles.status}>
        <ErrorBoundary area="the status bar">
          <StatusBar />
        </ErrorBoundary>
      </div>
      <ErrorBoundary area="a dialog">
        <CoachMarks />
        <ExportReminderToast />
        <Notice />
        {!fromShareLink && <RestoreOnLoad />}
        <ShortcutsDialog />
        <CommandPalette />
        <PreferencesDialog />
        <AboutDialog />
        <DeletePromptDialog />
        <ShareDialog />
        <PptxExportDialog />
        <GifExportDialog />
        <ApplyTemplateDialog />
      </ErrorBoundary>
    </div>
  );
}
