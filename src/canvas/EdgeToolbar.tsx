// The small bar over a selected line: buttons each opening a compact popup —
// how the line is drawn (pattern, width, colour), what its ends are (an arrowhead for each end,
// picked by sight), how it runs (straight, elbow or curved; a line, a double line, a block arrow or
// a wave), and its label's text. Since R1 (D90) it is a line's context bar: the same dark bar the
// shapes get, and the only place these settings live for a single line now the panel is gone —
// which is why it gained Text, the one thing the panel's Text tab offered a line that it lacked.
import { useEffect, useRef, useState } from "react";
import { useViewport } from "@xyflow/react";
import { useDocStore } from "../model/store";
import type { DEdge } from "../model/types";
import type { EdgeMotionKind, FlowDirection, MotionSpeed } from "../model/motion";
import { ARROWHEADS, type ArrowheadPaint } from "./arrowheads";
import { EDGE_SHAPES, edgeShapeOf, type EdgeShape } from "./edgeShapes";
import { DEFAULT_EDGE_WIDTH, normalizeEdgeStyle, type EdgeStyleKind } from "./edgeRouting";
import { edgeColorForPicker } from "./edgeColor";
import { ColorField, NumberField } from "../format-panel/fields";
import { TextSection } from "../format-panel/TextSection";
import { StepControl } from "../context-bar/StepControl";
import styles from "./EdgeToolbar.module.css";

type Panel = "style" | "ends" | "route" | "text" | "motion" | null;

/** The line motions (D116, D119): marching dashes, a travelling dot, or volume as weight and pace. */
const LINE_MOTIONS: { id: "none" | EdgeMotionKind; label: string }[] = [
  { id: "none", label: "Off" },
  { id: "flow", label: "Flow" },
  { id: "packets", label: "Packets" },
  { id: "throughput", label: "Throughput" },
];
const VOLUMES = [1, 2, 3, 4, 5];
const DIRECTIONS: { id: FlowDirection; label: string; title: string }[] = [
  { id: "forward", label: "→", title: "Along the line" },
  { id: "reverse", label: "←", title: "Reversed" },
  { id: "both", label: "⇄", title: "Both ways" },
];
const SPEEDS: { id: MotionSpeed; label: string }[] = [
  { id: "slow", label: "Slow" },
  { id: "normal", label: "Normal" },
  { id: "fast", label: "Fast" },
];

/**
 * Which popup is open, kept outside the component: changing a style redraws the line, and React
 * Flow can mount its label layer afresh when it does — the popup then closed after every pick,
 * so choosing both arrowheads took two trips. Kept per line, so another line opens with none.
 */
const openPanel: { edgeId: string; panel: Panel } = { edgeId: "", panel: null };

const INK = "currentColor";

/** One arrowhead drawn small, pointing right (or left, for a line's start). */
function HeadPreview({ kind, atStart }: { kind: string; atStart?: boolean }) {
  const def = ARROWHEADS.find((a) => a.id === kind);
  const paint = (fill: ArrowheadPaint) =>
    fill === "stroke"
      ? { fill: INK, stroke: "none" }
      : { fill: fill === "background" ? "var(--nd-panel-bg)" : "none", stroke: INK, strokeWidth: 1.25 };
  return (
    <svg viewBox="0 0 30 12" width="30" height="12" aria-hidden="true">
      <g transform={atStart ? "translate(30 0) scale(-1 1)" : undefined}>
        <line x1="1" y1="6" x2={def ? 20 : 29} y2="6" stroke={INK} strokeWidth="1.25" />
        {def && (
          <g transform="translate(18 1)">
            {def.parts.map((p, i) => (
              <path key={i} d={p.d} {...paint(p.fill)} />
            ))}
          </g>
        )}
      </g>
    </svg>
  );
}

const ROUTES: { id: EdgeStyleKind; label: string; d: string }[] = [
  { id: "straight", label: "Straight", d: "M3,17 L17,3" },
  { id: "orthogonal", label: "Elbow", d: "M3,17 L3,10 L17,10 L17,3" },
  { id: "curved", label: "Curved", d: "M3,17 C3,6 17,14 17,3" },
];

function ShapeIcon({ shape }: { shape: EdgeShape }) {
  const d =
    shape === "wavy"
      ? "M2,10 Q4,6 6,10 T10,10 T14,10 T18,10"
      : shape === "double"
      ? "M2,8 L18,8 M2,12 L18,12"
      : shape === "arrow"
        ? "M2,8 L11,8 L11,5 L18,10 L11,15 L11,12 L2,12 Z"
        : "M2,10 L18,10";
  return (
    <svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true">
      <path d={d} stroke={INK} strokeWidth="1.25" fill="none" strokeLinejoin="round" />
    </svg>
  );
}

export function EdgeToolbar({ edge, at }: { edge: DEdge; at: { x: number; y: number } }) {
  const { zoom } = useViewport();
  const [panel, setPanelState] = useState<Panel>(() => (openPanel.edgeId === edge.id ? openPanel.panel : null));
  const setPanel = (next: Panel | ((cur: Panel) => Panel)) =>
    setPanelState((cur) => {
      const value = typeof next === "function" ? next(cur) : next;
      openPanel.edgeId = edge.id;
      openPanel.panel = value;
      return value;
    });
  const rootRef = useRef<HTMLDivElement>(null);
  const setEdgeStyle = useDocStore((s) => s.setEdgeStyle);
  const updateEdgeWaypoints = useDocStore((s) => s.updateEdgeWaypoints);
  const set = (patch: Record<string, string | number>) => setEdgeStyle([edge.id], patch);
  const setEdgeMotion = useDocStore((s) => s.setEdgeMotion);

  // A click anywhere else, or Escape, closes the open popup — the bar itself stays with the line.
  useEffect(() => {
    if (!panel) return;
    const close = () => {
      openPanel.panel = null;
      setPanelState(null);
    };
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) close();
    };
    // Esc closes the popup and stops there; the next Esc clears the selection, as on the shape bar.
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopImmediatePropagation();
      const opener = rootRef.current?.querySelector<HTMLButtonElement>(`[data-panel="${panel}"]`);
      close();
      opener?.focus();
    };
    window.addEventListener("pointerdown", onDown, true);
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [panel]);

  const toggle = (p: Exclude<Panel, null>) => setPanel((cur) => (cur === p ? null : p));
  // Left/Right move along the bar, as in any toolbar (WAI-ARIA toolbar pattern).
  const onBarKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    const items = Array.from(e.currentTarget.querySelectorAll<HTMLButtonElement>("button"));
    const at = items.indexOf(document.activeElement as HTMLButtonElement);
    if (at < 0) return;
    e.preventDefault();
    items[(at + (e.key === "ArrowRight" ? 1 : -1) + items.length) % items.length]?.focus();
  };
  const start = (edge.style.startArrow as string) ?? "none";
  const end = (edge.style.endArrow as string) ?? "none";
  const route = normalizeEdgeStyle(edge.style.edgeStyle);
  const shape = edgeShapeOf(edge.style);
  const headChoices = ["none", ...ARROWHEADS.map((a) => a.id)];
  const labelOf = (id: string) => (id === "none" ? "None" : (ARROWHEADS.find((a) => a.id === id)?.label ?? id));

  return (
    <div
      ref={rootRef}
      className={`${styles.root} nodrag nopan nowheel`}
      // The bar sits just above the line at a fixed screen size, whatever the zoom; a popup opens
      // under the bar, so it never runs off the top of the canvas.
      style={{ transform: `translate(${at.x}px, ${at.y}px) scale(${1 / zoom}) translate(-50%, -52px)` }}
      onPointerDown={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      data-testid="nd-edge-toolbar"
    >
      <div className={styles.bar} role="toolbar" aria-label="Line" data-nd-context-bar="" onKeyDown={onBarKeyDown}>
        <button type="button" className={styles.btn} aria-pressed={panel === "style"} title="Line style" aria-label="Line style" data-panel="style" onClick={() => toggle("style")}>
          <svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true">
            <path d="M3,10 L17,10" stroke={INK} strokeWidth="2" />
          </svg>
        </button>
        <button type="button" className={styles.btn} aria-pressed={panel === "ends"} title="Line ends" aria-label="Line ends" data-panel="ends" onClick={() => toggle("ends")}>
          <svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true">
            <path d="M3,10 L13,10" stroke={INK} strokeWidth="2" />
            <path d="M12,5 L18,10 L12,15 Z" fill={INK} />
          </svg>
        </button>
        <button type="button" className={styles.btn} aria-pressed={panel === "route"} title="Connection" aria-label="Connection" data-panel="route" onClick={() => toggle("route")}>
          <svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true">
            <path d="M4,17 L4,5 L16,5" stroke={INK} strokeWidth="2" fill="none" />
          </svg>
        </button>
        <button type="button" className={styles.btn} aria-pressed={panel === "text"} title="Text" aria-label="Text" data-panel="text" onClick={() => toggle("text")}>
          <span className={styles.textGlyph} aria-hidden="true">
            T
          </span>
        </button>
        <button type="button" className={styles.btn} aria-pressed={panel === "motion"} title="Motion" aria-label="Motion" data-panel="motion" onClick={() => toggle("motion")}>
          <svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true">
            <path d="M2,10 L18,10" stroke={INK} strokeWidth="2" strokeDasharray="3 2.5" />
            <path d="M13,6 L17,10 L13,14" stroke={INK} strokeWidth="1.6" fill="none" />
          </svg>
        </button>
      </div>
      {panel === "motion" && (
        <div className={styles.popup} data-testid="nd-edge-toolbar-motion">
          <div className={styles.heading}>Motion</div>
          <div className={styles.grid} role="radiogroup" aria-label="Line motion">
            {LINE_MOTIONS.map((m) => (
              <button
                key={m.id}
                type="button"
                role="radio"
                aria-checked={(edge.motion?.kind ?? "none") === m.id}
                className={styles.choiceText}
                onClick={() =>
                  setEdgeMotion(
                    [edge.id],
                    m.id === "none"
                      ? null
                      : // Speed and direction carry over between kinds; volume belongs to Throughput.
                        { kind: m.id, speed: edge.motion?.speed, direction: edge.motion?.direction, volume: m.id === "throughput" ? edge.motion?.volume : undefined },
                  )
                }
              >
                {m.label}
              </button>
            ))}
          </div>
          {edge.motion && (
            <>
              {edge.motion.kind === "throughput" && (
                <>
                  <div className={styles.heading}>Volume</div>
                  <div className={styles.grid} role="radiogroup" aria-label="Volume">
                    {VOLUMES.map((v) => (
                      <button
                        key={v}
                        type="button"
                        role="radio"
                        aria-checked={(edge.motion?.volume ?? 3) === v}
                        className={styles.choiceText}
                        title={v === 1 ? "A trickle" : v === 5 ? "A hot path" : `Volume ${v}`}
                        aria-label={`Volume ${v}`}
                        onClick={() => setEdgeMotion([edge.id], { ...edge.motion!, volume: v === 3 ? undefined : v })}
                      >
                        {v}
                      </button>
                    ))}
                  </div>
                </>
              )}
              <div className={styles.heading}>Speed</div>
              <div className={styles.grid} role="radiogroup" aria-label="Speed">
                {SPEEDS.map((sp) => (
                  <button
                    key={sp.id}
                    type="button"
                    role="radio"
                    aria-checked={(edge.motion?.speed ?? "normal") === sp.id}
                    className={styles.choiceText}
                    onClick={() => setEdgeMotion([edge.id], { ...edge.motion!, speed: sp.id === "normal" ? undefined : sp.id })}
                  >
                    {sp.label}
                  </button>
                ))}
              </div>
              <div className={styles.heading}>Direction</div>
              <div className={styles.grid} role="radiogroup" aria-label="Direction">
                {DIRECTIONS.map((d) => (
                  <button
                    key={d.id}
                    type="button"
                    role="radio"
                    aria-checked={(edge.motion?.direction ?? "forward") === d.id}
                    className={styles.choiceText}
                    title={d.title}
                    aria-label={d.title}
                    onClick={() => setEdgeMotion([edge.id], { ...edge.motion!, direction: d.id === "forward" ? undefined : d.id })}
                  >
                    {d.label}
                  </button>
                ))}
              </div>
            </>
          )}
          <p className={styles.hint}>
            {edge.motion?.kind === "packets"
              ? "In a picture or a printout the dot rests part of the way along."
              : edge.motion?.kind === "throughput"
                ? "In a picture or a printout the weight still shows the volume."
                : "In a picture or a printout the line rests as its dashes."}
          </p>
          <StepControl ids={[edge.id]} />
        </div>
      )}
      {panel === "text" && (
        <div className={styles.popup} data-testid="nd-edge-toolbar-text">
          <TextSection nodes={[]} edges={[edge]} />
        </div>
      )}
      {panel === "style" && (
        <div className={styles.popup} data-testid="nd-edge-toolbar-style">
          <select className={styles.select} aria-label="Line pattern" value={(edge.style.dash as string) ?? "solid"} onChange={(e) => set({ dash: e.target.value })}>
            <option value="solid">Solid</option>
            <option value="dashed">Dashed</option>
            <option value="dotted">Dotted</option>
          </select>
          <div className={styles.row}>
            <NumberField
              label="Line width"
              className={styles.number}
              min={0.5}
              max={12}
              step={0.5}
              value={(edge.style.strokeWidth as number) ?? DEFAULT_EDGE_WIDTH}
              onCommit={(n) => set({ strokeWidth: n })}
            />
            <span className={styles.unit}>pt</span>
            <ColorField label="Line color" className={styles.color} value={edgeColorForPicker(edge.style)} onCommit={(c) => set({ stroke: c })} />
          </div>
        </div>
      )}

      {panel === "ends" && (
        <div className={styles.popup} data-testid="nd-edge-toolbar-ends">
          {(["start", "end"] as const).map((which) => {
            const current = which === "start" ? start : end;
            return (
              <div key={which}>
                <div className={styles.heading}>{which === "start" ? "Start" : "End"}</div>
                <div className={styles.grid} role="radiogroup" aria-label={which === "start" ? "Start arrow" : "End arrow"}>
                  {headChoices.map((id) => (
                    <button
                      key={id}
                      type="button"
                      role="radio"
                      aria-checked={current === id}
                      className={styles.choice}
                      title={labelOf(id)}
                      aria-label={labelOf(id)}
                      onClick={() => set(which === "start" ? { startArrow: id } : { endArrow: id })}
                    >
                      <HeadPreview kind={id} atStart={which === "start"} />
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {panel === "route" && (
        <div className={styles.popup} data-testid="nd-edge-toolbar-route">
          <div className={styles.heading}>Route</div>
          <div className={styles.grid} role="radiogroup" aria-label="Route">
            {ROUTES.map((r) => (
              <button
                key={r.id}
                type="button"
                role="radio"
                aria-checked={route === r.id}
                className={styles.choice}
                title={r.label}
                aria-label={r.label}
                onClick={() => set({ edgeStyle: r.id })}
              >
                <svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true">
                  <path d={r.d} stroke={INK} strokeWidth="1.5" fill="none" />
                </svg>
              </button>
            ))}
          </div>
          <div className={styles.heading}>Shape</div>
          <div className={styles.grid} role="radiogroup" aria-label="Line shape">
            {EDGE_SHAPES.map((s) => (
              <button
                key={s.id}
                type="button"
                role="radio"
                aria-checked={shape === s.id}
                className={styles.choice}
                title={s.label}
                aria-label={s.label}
                onClick={() => set({ edgeShape: s.id })}
              >
                <ShapeIcon shape={s.id} />
              </button>
            ))}
          </div>
          {(edge.waypoints?.length ?? 0) > 0 && (
            <button type="button" className={styles.textBtn} onClick={() => updateEdgeWaypoints(edge.id, [])}>
              Straighten (clear bends)
            </button>
          )}
        </div>
      )}

    </div>
  );
}
