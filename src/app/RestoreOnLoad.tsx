import { useEffect, useRef, useState } from "react";
import { clearAutosave, keepUnreadableAutosave, readAutosave, readUnreadableAutosave, clearUnreadableAutosave } from "../file/autosave";
import { decodeDoc } from "../file/documentFormat";
import { downloadText } from "../file/download";
import { hasContent } from "../file/recentDocs";
import { useDocStore } from "../model/store";
import { BRAND } from "./brand";
import { FADE_MS, RESTORED_NOTE_MS, startNewKeepingRestored } from "./restoreActions";
import styles from "./RestoreOnLoad.module.css";

type State =
  | { kind: "none" }
  | { kind: "restored" }
  | { kind: "unreadable"; error: string; text: string };

// Autosaved work comes back on its own (R5, CLAUDE_HISTORY.md D94), where the app used to ask
// "Unsaved diagram found — restore?": nearly everyone said yes, and the one who said no lost
// their work. A short note says what happened and offers Start new, which never discards the
// restored diagram silently (see startNewKeepingRestored).
//
// Checked once on mount, before useAutosave's first debounced write could replace the saved
// copy with the fresh empty document. An autosave that fails validation is never dropped: it is
// set aside under its own key straight away, and a banner says so and offers it as a download.
export function RestoreOnLoad() {
  const [state, setState] = useState<State>({ kind: "none" });
  const [held, setHeld] = useState(false);
  const ranRef = useRef(false);

  useEffect(() => {
    if (ranRef.current) return;
    ranRef.current = true;
    const text = readAutosave();
    if (text !== null) {
      const result = decodeDoc(text);
      if (!result.ok) {
        keepUnreadableAutosave(text);
        setState({ kind: "unreadable", error: result.error, text });
        return;
      }
      useDocStore.getState().loadDoc(result.doc);
      if (hasContent(result.doc)) setState({ kind: "restored" });
    }
    // One set aside on an earlier visit and not yet dealt with is still surfaced, whatever has
    // been autosaved since.
    const unreadable = readUnreadableAutosave();
    if (unreadable !== null) {
      const result = decodeDoc(unreadable);
      setState({ kind: "unreadable", error: result.ok ? "It could not be opened." : result.error, text: unreadable });
    }
  }, []);

  // The note fades on its own, but not while someone is pointing at it or has tabbed into it.
  const [fading, setFading] = useState(false);
  useEffect(() => {
    if (state.kind !== "restored" || held) {
      setFading(false);
      return;
    }
    const fade = window.setTimeout(() => setFading(true), RESTORED_NOTE_MS);
    const gone = window.setTimeout(() => setState({ kind: "none" }), RESTORED_NOTE_MS + FADE_MS);
    return () => {
      window.clearTimeout(fade);
      window.clearTimeout(gone);
    };
  }, [state.kind, held]);

  if (state.kind === "none") return null;

  if (state.kind === "restored") {
    return (
      <div
        className={`${styles.banner} ${styles.note}${fading ? ` ${styles.fading}` : ""}`}
        role="status"
        data-testid="nd-restored-note"
        onPointerEnter={() => setHeld(true)}
        onPointerLeave={() => setHeld(false)}
        onFocus={() => setHeld(true)}
        onBlur={() => setHeld(false)}
      >
        <span>Restored your last diagram</span>
        <button
          type="button"
          className={styles.secondaryBtn}
          onClick={async () => {
            if (await startNewKeepingRestored()) setState({ kind: "none" });
          }}
          data-testid="nd-restored-start-new"
        >
          Start new
        </button>
      </div>
    );
  }

  const dismiss = () => {
    clearUnreadableAutosave();
    // The broken copy is set aside; the live autosave key is free for the new work.
    if (readAutosave() === state.text) clearAutosave();
    setState({ kind: "none" });
  };

  return (
    <div className={`${styles.banner} ${styles.problem}`} role="alert" data-testid="nd-restore-problem">
      <span>
        Your last diagram couldn&apos;t be restored: {state.error}
      </span>
      <div className={styles.actions}>
        <button
          type="button"
          className={styles.primaryBtn}
          onClick={() => downloadText(state.text, `unreadable-autosave${BRAND.fileExt}`, "application/json")}
          data-testid="nd-restore-problem-download"
        >
          Download it
        </button>
        <button type="button" className={styles.secondaryBtn} onClick={dismiss} data-testid="nd-restore-problem-dismiss">
          Dismiss
        </button>
      </div>
    </div>
  );
}
