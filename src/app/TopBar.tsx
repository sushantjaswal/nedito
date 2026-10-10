// The top bar: the app menu and the command palette's button on the
// left, the breadcrumb trail centred, Export and Share on the right. There is no menu
// bar: every command is in the palette.
import { useDocStore } from "../model/store";
import { AppMenu } from "./AppMenu";
import { Breadcrumbs } from "./Breadcrumbs";
import { ExportButton } from "./ExportButton";
import styles from "./TopBar.module.css";

export function TopBar() {
  const openPalette = () => useDocStore.getState().setPaletteOpen(true);
  return (
    <header className={styles.topbar}>
      <div className={styles.left}>
        <AppMenu />
        <button type="button" className={styles.command} onClick={openPalette} aria-label="Search or run a command" data-testid="nd-command-button">
          <span aria-hidden="true">⌕</span>
          <span className={styles.commandText}>Search or run a command</span>
          <kbd className={styles.kbd}>Ctrl K</kbd>
        </button>
      </div>
      <Breadcrumbs />
      <div className={styles.right}>
        <ExportButton />
        <button type="button" className={styles.share} onClick={() => useDocStore.getState().openShareDialog()} data-testid="nd-share">
          Share
        </button>
      </div>
    </header>
  );
}
