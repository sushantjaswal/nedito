// The context bar: a dark floating bar just above the selection, holding what the right-hand panel
// used to. Each button opens a popover with the panel's own controls
// for that group — moved, not redrawn — so every setting behaves exactly as it did.
//
// What the bar offers follows from what is selected, the way the panel's tabs did:
//   - Fill, Line and More (opacity, shadow) for plain shapes — not groups or Nested Blocks, which
//     draw their own frame and never took these;
//   - Image (border, opacity) for pictures, with Replace and Original size on the bar itself;
//   - Text whenever a shape or line in the selection has a label to format;
//   - Arrange for any node: size, position, rotation, order, group, align, distribute;
//   - Edge for lines mixed into a selection (one line on its own has the line toolbar, D86);
//   - Open and Nested for a single Nested Block, with Arrange (decided in review: its fill, line
//     and name are its own, the name edited by double-clicking it).
//
// It sits inside the React Flow pane, so it follows the selection as it moves, pans and zooms; it
// keeps inside the canvas, dropping below the selection when there is no room above; and it hides
// while a shape is dragged, resized or rotated, coming back where the selection lands.
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useStore as useFlowStore, useViewport } from "@xyflow/react";
import { useDocStore } from "../model/store";
import type { GroupNode } from "../model/types";
import { navigateIntoNested } from "../nesting/navigation";
import { NestedFormatSection } from "../nesting/NestedFormatSection";
import { ArrangeSection } from "../format-panel/ArrangeSection";
import { EdgeSection, EffectsSection, FillSection, ImageSection, LineSection } from "../format-panel/StyleSections";
import { useImageActions } from "../format-panel/selectionKinds";
import { MotionSection } from "./MotionSection";
import { barButtonsFor, selectionBounds, TITLES, type PopoverId } from "./barButtons";
import { TextSection } from "../format-panel/TextSection";
import styles from "./ContextBar.module.css";

/** Gap between the selection and the bar, and between the bar and the canvas edge, in px. */
const GAP = 12;
const MARGIN = 8;
/**
 * The canvas's bottom row — the canvas chip, and the zoom bar with fit view — which the bar never
 * covers, even when it is clamped to an off-screen selection (D108): that is exactly when someone
 * reaches for fit view. On a canvas narrower than 660px the zoom bar stacks above the chip, so the
 * row is twice as tall (DiagramCanvas.module.css).
 */
const bottomChrome = (paneWidth: number) => (paneWidth <= 660 ? 96 : 56);
/**
 * How far a selected shape's rotate handle reaches above it, in diagram units
 * (canvas/RotateHandle.module.css: top -28px, 12px tall). The bar keeps clear of it, or it would
 * sit on the handle and rotating would be impossible.
 */
const ROTATE_HANDLE_REACH = 30;

export function ContextBar() {
  const selection = useDocStore((s) => s.selection);
  const diagram = useDocStore((s) => s.doc.diagrams[s.currentDiagramId()]);
  const gesture = useDocStore((s) => s.ui.canvasGesture);
  const viewerMode = useDocStore((s) => s.ui.viewerMode);
  const { x: vx, y: vy, zoom } = useViewport();
  const paneWidth = useFlowStore((s) => s.width);
  const paneHeight = useFlowStore((s) => s.height);

  const nodes = useMemo(() => diagram?.nodes.filter((n) => selection.nodeIds.includes(n.id)) ?? [], [diagram, selection.nodeIds]);
  const edges = useMemo(() => diagram?.edges.filter((e) => selection.edgeIds.includes(e.id)) ?? [], [diagram, selection.edgeIds]);
  const allGroups = useMemo(() => diagram?.nodes.filter((n): n is GroupNode => n.type === "group") ?? [], [diagram]);
  const imageActions = useImageActions(nodes);

  const [open, setOpen] = useState<PopoverId | null>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const [barSize, setBarSize] = useState({ w: 0, h: 0 });
  const [popSize, setPopSize] = useState({ w: 0, h: 0 });

  // A new selection starts with every popover closed.
  const selectionKey = `${selection.nodeIds.join(",")}|${selection.edgeIds.join(",")}`;
  useEffect(() => setOpen(null), [selectionKey]);

  // One line on its own carries the line toolbar instead (canvas/EdgeToolbar.tsx, D86).
  const soleLine = nodes.length === 0 && edges.length === 1;
  // Trace (D117): the bar's button starts tracing a shape, and stops it when pressed again.
  const tracing = useDocStore((s) => (s.trace && s.trace.focus.length === 1 ? s.trace.focus[0] : null));
  const toggleTrace = useCallback((id: string) => {
    const store = useDocStore.getState();
    store.setTrace(store.trace?.focus.length === 1 && store.trace.focus[0] === id ? null : [id]);
  }, []);
  const buttons = useMemo(
    () => (soleLine ? [] : barButtonsFor(nodes, edges, allGroups, { open: navigateIntoNested, image: imageActions, trace: toggleTrace, tracing })),
    [soleLine, nodes, edges, allGroups, imageActions, toggleTrace, tracing],
  );
  const visible = !viewerMode && !gesture && buttons.length > 0;

  // The bar and its popover are placed from their own sizes, measured as they render and again
  // whenever either changes size (a popover growing a row, a button appearing).
  useLayoutEffect(() => {
    if (!visible) return;
    const measure = () => {
      const r = barRef.current?.getBoundingClientRect();
      setBarSize((cur) => (r && (r.width !== cur.w || r.height !== cur.h) ? { w: r.width, h: r.height } : cur));
      const p = popRef.current?.getBoundingClientRect();
      setPopSize((cur) => {
        const next = p ? { w: p.width, h: p.height } : { w: 0, h: 0 };
        return next.w === cur.w && next.h === cur.h ? cur : next;
      });
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    if (barRef.current) observer.observe(barRef.current);
    if (popRef.current) observer.observe(popRef.current);
    return () => observer.disconnect();
  }, [visible, open, buttons]);

  // Esc closes an open popover first; the next Esc clears the selection (useGlobalShortcuts.ts).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopImmediatePropagation();
      setOpen(null);
      barRef.current?.querySelector<HTMLButtonElement>(`[data-popover="${open}"]`)?.focus();
    };
    // A click anywhere but the bar and its popover closes the popover; a click on the canvas also
    // changes the selection, which closes it anyway.
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (barRef.current?.contains(t) || popRef.current?.contains(t)) return;
      // A native colour picker or select list is outside the DOM; leave the popover open for it.
      if (!(t instanceof Element) || t.closest("[data-nd-popover-keep]")) return;
      setOpen(null);
    };
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("pointerdown", onDown, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("pointerdown", onDown, true);
    };
  }, [open]);

  // Left/Right move along the bar, as in any toolbar (WAI-ARIA toolbar pattern).
  const onBarKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight" && e.key !== "Home" && e.key !== "End") return;
    const items = Array.from(barRef.current?.querySelectorAll<HTMLButtonElement>("button") ?? []);
    const at = items.indexOf(document.activeElement as HTMLButtonElement);
    if (at < 0) return;
    e.preventDefault();
    const next =
      e.key === "Home" ? 0 : e.key === "End" ? items.length - 1 : (at + (e.key === "ArrowRight" ? 1 : -1) + items.length) % items.length;
    items[next]?.focus();
  }, []);

  const bounds = useMemo(() => selectionBounds(nodes, edges, diagram?.nodes ?? []), [nodes, edges, diagram]);
  if (!visible || !bounds) return null;

  // Above the selection, or below it when there is no room above; always inside the canvas.
  const top = bounds.y * zoom + vy;
  const bottom = (bounds.y + bounds.h) * zoom + vy;
  const centre = (bounds.x + bounds.w / 2) * zoom + vx;
  const gapAbove = nodes.length > 0 ? ROTATE_HANDLE_REACH * zoom + GAP / 2 : GAP;
  const above = top - gapAbove - barSize.h >= MARGIN;
  let barTop = above ? top - gapAbove - barSize.h : bottom + GAP;
  barTop = Math.min(Math.max(barTop, MARGIN), Math.max(MARGIN, paneHeight - barSize.h - bottomChrome(paneWidth)));
  const barLeft = Math.min(Math.max(centre - barSize.w / 2, MARGIN), Math.max(MARGIN, paneWidth - barSize.w - MARGIN));

  // The popover hangs under the bar, or over it when there is no room below.
  const popBelow = barTop + barSize.h + 6 + popSize.h <= paneHeight - MARGIN || barTop < popSize.h + 6 + MARGIN;
  const anchor = open ? barRef.current?.querySelector<HTMLElement>(`[data-popover="${open}"]`) : null;
  const anchorLeft = anchor ? barLeft + anchor.offsetLeft : barLeft;
  const popLeft = Math.min(Math.max(anchorLeft - 6, MARGIN), Math.max(MARGIN, paneWidth - popSize.w - MARGIN));
  const popTop = popBelow ? barTop + barSize.h + 6 : barTop - 6 - popSize.h;

  const single = nodes.length === 1 ? nodes[0] : undefined;
  const popover = open && (
    <div
      ref={popRef}
      className={`${styles.popover} nodrag nopan nowheel`}
      style={{ left: popLeft, top: popTop }}
      role="dialog"
      aria-label={TITLES[open]}
      data-testid={`nd-popover-${open}`}
      onPointerDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
    >
      <h4 className={styles.popoverTitle}>{TITLES[open]}</h4>
      {open === "fill" && <FillSection nodes={nodes} />}
      {open === "line" && <LineSection nodes={nodes} />}
      {open === "more" && <EffectsSection nodes={nodes} />}
      {open === "image" && <ImageSection nodes={nodes} />}
      {open === "text" && <TextSection nodes={nodes} edges={edges} />}
      {open === "arrange" && <ArrangeSection nodes={nodes} edges={edges} groups={allGroups} />}
      {open === "edge" && <EdgeSection edges={edges} />}
      {open === "nested" && single?.type === "nested" && <NestedFormatSection nestedNode={single} />}
      {open === "motion" && <MotionSection nodes={nodes} />}
    </div>
  );

  return (
    <>
      <div
        ref={barRef}
        className={`${styles.bar} nodrag nopan nowheel`}
        style={{ left: barLeft, top: barTop, visibility: barSize.w ? "visible" : "hidden" }}
        role="toolbar"
        aria-label="Selection"
        data-testid="nd-context-bar"
        data-nd-context-bar=""
        onKeyDown={onBarKeyDown}
        onPointerDown={(e) => e.stopPropagation()}
        onDoubleClick={(e) => e.stopPropagation()}
      >
        {buttons.map((b, i) => (
          <span key={b.id} className={styles.slot}>
            {i > 0 && b.id === "arrange" && <span className={styles.separator} aria-hidden="true" />}
            <button
              type="button"
              className={b.primary ? `${styles.button} ${styles.primary}` : styles.button}
              title={b.label}
              aria-label={b.label}
              aria-haspopup={b.popover ? "dialog" : undefined}
              aria-expanded={b.popover ? open === b.popover : undefined}
              data-popover={b.popover}
              data-testid={`nd-bar-${b.id}`}
              onClick={() => (b.popover ? setOpen((cur) => (cur === b.popover ? null : b.popover!)) : b.run?.())}
            >
              {b.content}
            </button>
          </span>
        ))}
      </div>
      {popover}
    </>
  );
}
