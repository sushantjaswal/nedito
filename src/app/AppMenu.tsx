// The app menu — the product name at the top left. What stayed from the
// File and Help menus once exporting and sharing got buttons of their own: New, Open, Save a copy,
// the Recent diagrams, Preferences, Keyboard shortcuts, the tour and About. Everything else is in
// the command palette (Ctrl+K).
import { useEffect, useRef, useState } from "react";
import { OPENABLE_EXTENSIONS } from "../file/openFile";
import { listRecent, loadRecent, type RecentEntry } from "../file/recentDocs";
import { useDocStore } from "../model/store";
import { BRAND } from "./brand";
import { BrandMark } from "./BrandMark";
import { newDiagram, newFromTemplate, openFilePicker, openSelectedFile, registerOpenInput, saveCopy } from "./fileActions";
import { showAbout, startQuickTour } from "./helpActions";
import { Menu, MenuDivider, MenuHeading, MenuItem } from "./Menu";
import menuStyles from "./Menu.module.css";
import styles from "./TopBar.module.css";

/** "just now", "5 min ago", "yesterday", or a date. */
function when(savedAt: number, now = Date.now()): string {
  const minutes = Math.round((now - savedAt) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  if (hours < 48) return "yesterday";
  return new Date(savedAt).toLocaleDateString();
}

async function reopen(key: string): Promise<void> {
  const result = await loadRecent(key);
  if (!result.ok) {
    useDocStore.getState().showNotice({ tone: "warn", message: result.error });
    return;
  }
  useDocStore.getState().loadDoc(result.doc);
}

/** The Recent section, read from the browser's store each time the menu opens. */
function RecentItems({ run }: { run: (fn: () => void) => () => void }) {
  const [recent, setRecent] = useState<RecentEntry[] | null>(null);
  useEffect(() => {
    let live = true;
    listRecent()
      .then((list) => live && setRecent(list))
      .catch(() => live && setRecent([]));
    return () => {
      live = false;
    };
  }, []);
  if (recent === null) return null;
  if (recent.length === 0) {
    return (
      <div className={menuStyles.note} data-testid="nd-recent-empty">
        A diagram you replace (New, Open, a template) is kept here.
      </div>
    );
  }
  return (
    <>
      {recent.map((r, i) => (
        <MenuItem
          key={r.key}
          label={
            <>
              {r.title}
              <span className={menuStyles.sub}>
                {r.shapeCount} {r.shapeCount === 1 ? "shape" : "shapes"} · {when(r.savedAt)}
              </span>
            </>
          }
          onSelect={run(() => void reopen(r.key))}
          testId={`nd-recent-${i}`}
        />
      ))}
    </>
  );
}

export function AppMenu() {
  const inputRef = useRef<HTMLInputElement>(null);

  // The hidden picker Open uses — registered so the palette and Ctrl+O open the same one.
  useEffect(() => {
    registerOpenInput(inputRef.current);
    return () => registerOpenInput(null);
  }, []);

  return (
    <>
      <Menu
        trigger={
          <>
            <BrandMark />
            {BRAND.name}
            {/* What the name stands for (N5); dropped on a narrow window, where the bar needs the room. */}
            <span className={styles.tagline} data-testid="nd-app-tagline">
              – {BRAND.tagline}
            </span>
            <span className={styles.caret} aria-hidden="true">
              ▾
            </span>
          </>
        }
        triggerLabel={`${BRAND.name} menu`}
        triggerClassName={styles.appButton}
        testId="nd-app-menu-trigger"
      >
        {(close) => {
          const run = (fn: () => void) => () => (close(), fn());
          return (
            <>
              <MenuItem label="New diagram" onSelect={run(newDiagram)} testId="nd-app-new" />
              <MenuItem label="New from template…" onSelect={run(newFromTemplate)} testId="nd-new-from-template" />
              <MenuItem label="Open…" shortcut="Ctrl+O" onSelect={run(openFilePicker)} testId="nd-app-open" />
              <MenuItem label="Save a copy" shortcut="Ctrl+S" onSelect={run(saveCopy)} testId="nd-app-save" />
              <MenuDivider />
              <MenuHeading>Recent</MenuHeading>
              <RecentItems run={run} />
              <MenuDivider />
              <MenuItem label="Preferences…" onSelect={run(() => useDocStore.getState().setPreferencesOpen(true))} testId="nd-preferences" />
              <MenuItem
                label="Keyboard shortcuts"
                shortcut="Ctrl+Shift+K"
                onSelect={run(() => useDocStore.getState().toggleShortcutsDialog())}
                testId="nd-help-shortcuts"
              />
              <MenuItem label="Take the tour" onSelect={run(startQuickTour)} testId="nd-help-tour" />
              <MenuItem label={`About ${BRAND.name}`} onSelect={run(showAbout)} testId="nd-help-about" />
            </>
          );
        }}
      </Menu>
      <input
        ref={inputRef}
        type="file"
        accept={OPENABLE_EXTENSIONS.join(",")}
        className={menuStyles.hiddenInput}
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = ""; // allow re-selecting the same file later
          if (file) void openSelectedFile(file);
        }}
        data-testid="nd-file-open-input"
      />
    </>
  );
}
