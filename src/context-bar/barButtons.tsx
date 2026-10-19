// What the context bar offers for a selection, and where the selection is — kept apart from the
// component so the rules can be tested on their own (R1, D90).
import type { ReactNode } from "react";
import type { DEdge, DNode, GroupNode, NestedNode } from "../model/types";
import { isFreeEnd } from "../model/edgeEnds";
import { allPictures, styledShapes, useImageActions } from "../format-panel/selectionKinds";
import styles from "./ContextBar.module.css";

export type PopoverId = "fill" | "line" | "image" | "text" | "arrange" | "edge" | "more" | "nested" | "motion" | "note";

interface BarButton {
  id: string;
  label: string;
  content: ReactNode;
  /** A popover to open, or an action to run on click. */
  popover?: PopoverId;
  run?: () => void;
  primary?: boolean;
}

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** The area the selection covers, in diagram coordinates. */
export function selectionBounds(nodes: DNode[], edges: DEdge[], all: DNode[]): Box | null {
  const xs: number[] = [];
  const ys: number[] = [];
  for (const n of nodes) {
    xs.push(n.position.x, n.position.x + n.size.w);
    ys.push(n.position.y, n.position.y + n.size.h);
  }
  const byId = new Map(all.map((n) => [n.id, n]));
  for (const e of edges) {
    for (const end of [e.source, e.target]) {
      if (isFreeEnd(end)) {
        xs.push(end.point.x);
        ys.push(end.point.y);
        continue;
      }
      const n = end.nodeId ? byId.get(end.nodeId) : undefined;
      if (n) {
        xs.push(n.position.x + n.size.w / 2);
        ys.push(n.position.y + n.size.h / 2);
      }
    }
    for (const p of e.waypoints ?? []) {
      xs.push(p.x);
      ys.push(p.y);
    }
  }
  if (xs.length === 0) return null;
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}

/** The buttons for a selection, in the order the bar shows them. */
export function barButtonsFor(
  nodes: DNode[],
  edges: DEdge[],
  groups: GroupNode[],
  actions: { open: (id: string) => void; image: ReturnType<typeof useImageActions>; trace?: (id: string) => void; tracing?: string | null },
): BarButton[] {
  const buttons: BarButton[] = [];
  const nested = nodes.length === 1 && edges.length === 0 && nodes[0].type === "nested" ? (nodes[0] as NestedNode) : undefined;
  if (nested) {
    buttons.push({ id: "open", label: "Open", content: <>⤢ Open</>, run: () => actions.open(nested.id), primary: true });
    buttons.push({ id: "nested", label: "Nested Block", content: <>⧉ Nested</>, popover: "nested" });
    buttons.push({ id: "motion", label: "Motion", content: <>Motion</>, popover: "motion" });
    if (actions.trace) buttons.push({ id: "trace", label: actions.tracing === nested.id ? "Stop tracing" : "Trace", content: <>{actions.tracing === nested.id ? "Stop" : "Trace"}</>, run: () => actions.trace!(nested.id) });
    buttons.push({ id: "arrange", label: "Arrange", content: <>Arrange</>, popover: "arrange" });
    buttons.push(noteButton());
    return buttons;
  }

  const shapes = styledShapes(nodes);
  const pictures = allPictures(nodes);
  if (pictures && actions.image) {
    buttons.push({ id: "replace", label: "Replace image", content: <>Replace</>, run: actions.image.replace });
    buttons.push({ id: "originalSize", label: "Original size", content: <>Original size</>, run: actions.image.originalSize });
  }
  if (shapes.length > 0 && !pictures) {
    const first = shapes[0];
    const fill = (first.style.fill as string | undefined) ?? "#ffffff";
    buttons.push({
      id: "fill",
      label: "Fill",
      content: <span className={styles.swatch} style={{ background: fill === "none" ? "transparent" : fill }} aria-hidden="true" />,
      popover: "fill",
    });
    buttons.push({ id: "line", label: "Line", content: <span className={styles.lineGlyph} aria-hidden="true" />, popover: "line" });
  }
  if (pictures) buttons.push({ id: "image", label: "Image", content: <>Image</>, popover: "image" });
  if (shapes.length > 0 || edges.length > 0) buttons.push({ id: "text", label: "Text", content: <span className={styles.textGlyph}>T</span>, popover: "text" });
  if (nodes.length > 0 || groups.length > 0) buttons.push({ id: "arrange", label: "Arrange", content: <>Arrange</>, popover: "arrange" });
  if (edges.length > 0) buttons.push({ id: "edge", label: nodes.length > 0 ? "Lines" : "Line", content: <>{nodes.length > 0 ? "Lines" : "Line"}</>, popover: "edge" });
  // Motion (D116): for shapes alone — a line's motion is in its own toolbar.
  if (shapes.length > 0 && !pictures && edges.length === 0) buttons.push({ id: "motion", label: "Motion", content: <>Motion</>, popover: "motion" });
  // Trace (D117): what one shape touches.
  if (actions.trace && nodes.length === 1 && edges.length === 0 && nodes[0].type !== "group") {
    const id = nodes[0].id;
    const on = actions.tracing === id;
    buttons.push({ id: "trace", label: on ? "Stop tracing" : "Trace", content: <>{on ? "Stop" : "Trace"}</>, run: () => actions.trace!(id) });
  }
  // Note before More: three dots mean "everything else", so nothing follows them.
  buttons.push(noteButton());
  if (shapes.length > 0 && !pictures) buttons.push({ id: "more", label: "More", content: <>•••</>, popover: "more" });
  return buttons;
}

/**
 * A note is a first-class thing to do with a shape, so it gets its own button beside Trace rather
 * than a line at the bottom of a popover about fills or ports — which is where it lived at first,
 * in a different place for every kind of selection, and nobody found it.
 */
function noteButton(): BarButton {
  return { id: "note", label: "Note", content: <>Note</>, popover: "note" };
}

export const TITLES: Record<PopoverId, string> = {
  fill: "Fill",
  line: "Line",
  image: "Image",
  text: "Text",
  arrange: "Arrange",
  edge: "Lines",
  more: "More",
  note: "Note",
  nested: "Nested Block",
  motion: "Motion",
};
