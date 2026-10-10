import { useDocStore } from "../model/store";
import styles from "./ShortcutsDialog.module.css";

interface ShortcutRow {
  keys: string;
  action: string;
}

interface ShortcutGroup {
  heading: string;
  rows: ShortcutRow[];
}

const MOD = navigator.platform.toLowerCase().includes("mac") ? "⌘" : "Ctrl";

const GROUPS: ShortcutGroup[] = [
  {
    heading: "Edit",
    rows: [
      { keys: `${MOD}+Z`, action: "Undo" },
      { keys: `${MOD}+Y / ${MOD}+Shift+Z`, action: "Redo" },
      { keys: `${MOD}+A`, action: "Select all" },
      { keys: `${MOD}+C`, action: "Copy" },
      { keys: `${MOD}+X`, action: "Cut" },
      { keys: `${MOD}+V`, action: "Paste" },
      { keys: `${MOD}+D`, action: "Duplicate" },
      { keys: "Alt+Shift+Arrow", action: "Add a connected shape on that side (the ＋ handles)" },
      { keys: "Delete / Backspace", action: "Delete selection" },
      { keys: "F2", action: "Rename / edit label" },
      { keys: "Esc", action: "Close a popover, then deselect, then go up a level" },
      { keys: "Alt+F10", action: "Move focus to the selection's context bar" },
      { keys: `${MOD}+F`, action: "Find/Replace" },
    ],
  },
  {
    heading: "Arrange",
    rows: [
      { keys: `${MOD}+G`, action: "Group" },
      { keys: `${MOD}+Shift+U`, action: "Ungroup" },
      { keys: `${MOD}+Shift+F`, action: "Bring to front" },
      { keys: `${MOD}+Shift+B`, action: "Send to back" },
      { keys: "Arrow keys", action: "Nudge selection (1px)" },
      { keys: "Shift+Arrow keys", action: "Nudge selection (1 grid step)" },
    ],
  },
  {
    heading: "View",
    rows: [
      { keys: `${MOD}+=`, action: "Zoom in" },
      { keys: `${MOD}+-`, action: "Zoom out" },
      { keys: `${MOD}+Shift+H`, action: "Fit page" },
      { keys: `${MOD}+Shift+K`, action: "Show this cheat sheet" },
    ],
  },
  {
    heading: "File and commands",
    rows: [
      { keys: `${MOD}+K`, action: "Command palette: run any command, or go to a shape" },
      { keys: `${MOD}+O`, action: "Open a file" },
      { keys: `${MOD}+S`, action: "Save a copy" },
    ],
  },
];

export function ShortcutsDialog() {
  const open = useDocStore((s) => s.ui.shortcutsDialogOpen);
  const toggle = useDocStore((s) => s.toggleShortcutsDialog);

  if (!open) return null;

  return (
    <div className={styles.overlay} onClick={toggle} data-testid="nd-shortcuts-dialog">
      <div className={styles.dialog} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <h2 className={styles.title}>Keyboard shortcuts</h2>
          <button type="button" className={styles.closeBtn} onClick={toggle} aria-label="Close">
            ×
          </button>
        </div>
        <div className={styles.body}>
          {GROUPS.map((group) => (
            <div key={group.heading} className={styles.group}>
              <h3 className={styles.groupHeading}>{group.heading}</h3>
              <table className={styles.table}>
                <tbody>
                  {group.rows.map((row) => (
                    <tr key={row.action}>
                      <td className={styles.keys}>{row.keys}</td>
                      <td className={styles.action}>{row.action}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
