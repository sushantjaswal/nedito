// One undo step per edit, however many changes the edit takes to make.
//
// Typing "200" into a width field is three changes ("2", "20", "200"), dragging a slider is
// dozens, and a colour picker reports every colour the pointer passes over. Committed one by one,
// each became its own undo step, so undoing a typed width took four presses of Ctrl+Z (found by
// the controls sweep, CLAUDE_HISTORY.md D84). draw.io treats an edit as one step, and so does
// this: an edit session starts when the control is focused or pressed, the first change is
// recorded (which saves the state from before the edit), later changes in the same session are
// applied without being recorded, and the session ends when the control lets go.
import { useCallback, useEffect, useRef } from "react";
import { useDocStore } from "../model/store";

export interface EditSession {
  /** The control was focused or pressed: what follows is one edit. */
  begin: () => void;
  /** Apply one change of the edit. */
  commit: (apply: () => void) => void;
  /** The control let go: the edit is over. */
  end: () => void;
}

export function useEditSession(): EditSession {
  const active = useRef(false);
  const paused = useRef(false);

  const end = useCallback(() => {
    if (paused.current) useDocStore.temporal.getState().resume();
    active.current = false;
    paused.current = false;
  }, []);

  const begin = useCallback(() => {
    end();
    active.current = true;
  }, [end]);

  const commit = useCallback((apply: () => void) => {
    if (!active.current || paused.current) {
      apply();
      return;
    }
    // The first change of the session is recorded; the rest ride along with it.
    apply();
    useDocStore.temporal.getState().pause();
    paused.current = true;
  }, []);

  // A control removed mid-edit (the selection changed) must not leave history paused.
  useEffect(() => end, [end]);

  return { begin, commit, end };
}
