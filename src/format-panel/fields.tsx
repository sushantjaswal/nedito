// A number field that commits on Enter and on leaving it, and steps with the arrow keys.
//
// The plain inputs it replaces wrote `Number(e.target.value)` on every keystroke, so clearing the
// field to type a new width set the width to 0 first (Number("") is 0) — the shape collapsed
// while you typed — and every keystroke was its own undo step. Here an empty or half-typed value
// ("", "-", "1e") is held as text and never written; a value outside the allowed range is
// clamped; leaving the field (Enter, Escape, Tab or a click away) shows the real value again; and the
// whole edit, spinner clicks included, is one undo step (useEditSession.ts).
import { useState } from "react";
import { useEditSession } from "./useEditSession";

interface NumberFieldProps {
  value: number;
  onCommit: (value: number) => void;
  label: string;
  min?: number;
  max?: number;
  step?: number;
  className?: string;
}

/** How a value reads in the field: whole numbers plainly, others to two places. */
function format(n: number): string {
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100);
}

export function NumberField({ value, onCommit, label, min, max, step, className }: NumberFieldProps) {
  const [draft, setDraft] = useState<string | null>(null);
  const session = useEditSession();

  const clamp = (n: number) => Math.min(max ?? Infinity, Math.max(min ?? -Infinity, n));

  return (
    <input
      type="number"
      className={className}
      aria-label={label}
      min={min}
      max={max}
      step={step}
      value={draft ?? format(value)}
      onFocus={session.begin}
      onChange={(e) => {
        const text = e.target.value;
        setDraft(text);
        const n = Number(text);
        if (text.trim() === "" || !Number.isFinite(n)) return;
        const next = clamp(n);
        if (next !== value) session.commit(() => onCommit(next));
      }}
      onBlur={() => {
        setDraft(null);
        session.end();
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        if (e.key === "Escape") {
          setDraft(null);
          e.currentTarget.blur();
        }
      }}
    />
  );
}

/** A colour swatch: everything picked in one visit to the picker is one undo step. */
export function ColorField({ value, onCommit, label, className }: { value: string; onCommit: (v: string) => void; label: string; className?: string }) {
  const session = useEditSession();
  return (
    <input
      type="color"
      className={className}
      aria-label={label}
      value={value}
      onFocus={session.begin}
      onChange={(e) => {
        const v = e.target.value;
        session.commit(() => onCommit(v));
      }}
      onBlur={session.end}
    />
  );
}

/** A slider: one drag is one undo step. */
export function RangeField({
  value,
  onCommit,
  label,
  min,
  max,
  step,
  className,
}: {
  value: number;
  onCommit: (v: number) => void;
  label: string;
  min: number;
  max: number;
  step: number;
  className?: string;
}) {
  const session = useEditSession();
  return (
    <input
      type="range"
      className={className}
      aria-label={label}
      min={min}
      max={max}
      step={step}
      value={value}
      onPointerDown={session.begin}
      onFocus={session.begin}
      onChange={(e) => {
        const v = Number(e.target.value);
        session.commit(() => onCommit(v));
      }}
      onPointerUp={session.end}
      onBlur={session.end}
    />
  );
}
