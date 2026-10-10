import { useEffect, useRef, useState } from "react";
import type { RichLabel } from "../model/types";
import styles from "./LabelEditor.module.css";

interface LabelEditorProps {
  initial?: RichLabel;
  /** The colour the label shows when none is set, so the text being typed looks the same. */
  defaultColor?: string;
  onCommit: (label: RichLabel) => void;
  onCancel: () => void;
}

export function LabelEditor({ initial, defaultColor, onCommit, onCancel }: LabelEditorProps) {
  const [text, setText] = useState(initial?.text ?? "");
  // Ctrl+B / Ctrl+I while typing. Everything else about the label's look — size, colour,
  // alignment — is set from the context bar's Text popover, which is where the editor's own
  // formatting strip went (removed in review, D98: it duplicated that popover exactly).
  const [bold, setBold] = useState(initial?.bold ?? false);
  const [italic, setItalic] = useState(initial?.italic ?? false);
  const overlayRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // A node React Flow has only just added stays hidden until it has been measured, and a hidden
  // textarea refuses focus — so a label opened on a brand-new shape (the ＋ handles' copy, R3)
  // tries again for a few frames until it takes.
  useEffect(() => {
    let frame = 0;
    let tries = 0;
    const focus = () => {
      const el = textareaRef.current;
      if (!el) return;
      el.focus();
      if (document.activeElement === el) el.select();
      else if (tries++ < 20) frame = requestAnimationFrame(focus);
    };
    focus();
    return () => cancelAnimationFrame(frame);
  }, []);

  // The label as it was, with the new text: nothing the author did not set is written. This
  // used to write a size (12) and an alignment into every label it touched, so editing an edge
  // label — 11 by default — quietly made it 12.
  const commit = () => onCommit({ ...initial, text, bold, italic });

  const onKeyDown = (e: React.KeyboardEvent) => {
    e.stopPropagation();
    if (e.key === "Escape") {
      e.preventDefault();
      onCancel();
    } else if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      commit();
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "b") {
      e.preventDefault();
      setBold((v) => !v);
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "i") {
      e.preventDefault();
      setItalic((v) => !v);
    }
  };

  const onBlur = (e: React.FocusEvent) => {
    const next = e.relatedTarget as Node | null;
    if (next && overlayRef.current?.contains(next)) return;
    commit();
  };

  return (
    // Capture phase: React's delegated listeners run at the root container, so by the time a
    // bubble-phase handler here would fire, the native event has already reached (and been
    // acted on by) React Flow's d3-drag listener on the ancestor node wrapper. Stopping in the
    // capture phase intercepts it before that happens.
    <div
      ref={overlayRef}
      className={styles.overlay}
      onPointerDownCapture={(e) => e.stopPropagation()}
      onMouseDownCapture={(e) => e.stopPropagation()}
    >
      <textarea
        ref={textareaRef}
        className={styles.textarea}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={onKeyDown}
        onBlur={onBlur}
        style={{
          fontWeight: bold ? 700 : 400,
          fontStyle: italic ? "italic" : "normal",
          fontSize: initial?.fontSize ?? 12,
          color: initial?.color ?? defaultColor,
          textAlign: initial?.align ?? "center",
        }}
      />
    </div>
  );
}
