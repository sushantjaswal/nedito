import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useReactFlow, useViewport } from "@xyflow/react";
import { litInnerNodes } from "./trace";
import { useDocStore } from "../model/store";
import type { DNode, Port } from "../model/types";
import { computeGhostLinks, type GhostLinkInfo } from "./ghostLinkGeometry";
import styles from "./GhostLinks.module.css";

// Unmapped ghosts have no inner node to sit beside, so they stack at fixed *screen* offsets
// instead of tracking a canvas position — which also keeps a waiting connection on screen no
// matter where the author has panned to.
const UNMAPPED_TOP = 96;
const UNMAPPED_GAP = 46;
const EDGE_INSET = 8;
/** How far apart pills into the same side of one shape stand (D117). */
const SIBLING_GAP = 26;
// Left/right ghosts run all the way to the canvas edge (dashed pills at the canvas
// edges), but a top/bottom one taken to the edge ends up far from its shape and lands on the
// zoom bar, so the vertical variant stops just clear of the node instead.
const VERTICAL_REACH = 56;

interface DragState {
  portId: string;
  /** Layer-relative, for drawing the dragged handle under the cursor. */
  x: number;
  y: number;
  hoverNodeId: string | null;
}

// Which edge of a node a drop point is closest to. This is what lets a parent connection land
// where the author actually dropped it: before, placement was derived from the connection's
// direction, so every incoming ghost stuck to the left of the shape however you aimed.
function nearestSide(node: DNode, p: { x: number; y: number }): Port["side"] {
  const distances: [Port["side"], number][] = [
    ["left", p.x - node.position.x],
    ["right", node.position.x + node.size.w - p.x],
    ["top", p.y - node.position.y],
    ["bottom", node.position.y + node.size.h - p.y],
  ];
  return distances.reduce((best, d) => (d[1] < best[1] ? d : best))[0];
}

// Read-only overlay: dashed pills near the canvas edges showing edges that cross the nesting
// boundary in the parent diagram. A mapped ghost runs a dashed connector from the canvas edge
// to the side of the node it attaches to; an unmapped one (the parent connection exists but
// nothing in here is linked to it yet) shows amber with a loose endpoint. Either kind can be
// dragged: onto a shape to (re)attach it there, onto empty canvas to detach it again.
export function GhostLinks() {
  const doc = useDocStore((s) => s.doc);
  const navStack = useDocStore((s) => s.navStack);
  const navigateToLevel = useDocStore((s) => s.navigateToLevel);
  const mapUnlinkedPort = useDocStore((s) => s.mapUnlinkedPort);
  const detachPort = useDocStore((s) => s.detachPort);
  const diagramId = useDocStore((s) => s.currentDiagramId());
  const viewerMode = useDocStore((s) => s.ui.viewerMode);
  const { x: vx, y: vy, zoom } = useViewport();
  // Trace (D117): the pills of traced inner shapes light — the way out to what they touch.
  const trace = useDocStore((s) => s.trace);
  const lit = litInnerNodes(trace, useDocStore.getState().currentDiagramId());
  const { screenToFlowPosition } = useReactFlow();

  const layerRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  // Mirrors `drag` so the pointerup handler can read it without doing work inside a setState
  // updater — React invokes those twice under StrictMode, which would fire the store action
  // (and its undo entry) twice per drop.
  const dragRef = useRef<DragState | null>(null);
  const [flashing, setFlashing] = useState(false);
  const [justResolved, setJustResolved] = useState<string | null>(null);

  const links = useMemo(() => computeGhostLinks(doc, navStack), [doc, navStack]);
  const diagram = doc.diagrams[diagramId];

  const unmapped = links.filter((l) => !l.innerNodeId);
  const prevUnmappedCount = useRef(unmapped.length);

  // The green "all linked" confirmation is transient on purpose: it's the acknowledgement of an
  // action the author just took, not standing state worth permanently occupying the canvas.
  useEffect(() => {
    if (prevUnmappedCount.current > 0 && unmapped.length === 0) {
      setJustResolved("All parent connections are linked.");
      const t = window.setTimeout(() => setJustResolved(null), 4000);
      prevUnmappedCount.current = unmapped.length;
      return () => window.clearTimeout(t);
    }
    prevUnmappedCount.current = unmapped.length;
  }, [unmapped.length]);

  // Hit-tests against the model rather than the DOM: node boxes are already in flow
  // coordinates, so one screenToFlowPosition call is enough and there's no guessing about which
  // element the pointer landed on (the overlay itself would otherwise swallow elementFromPoint).
  const nodeAt = useCallback(
    (clientX: number, clientY: number): DNode | null => {
      if (!diagram) return null;
      const p = screenToFlowPosition({ x: clientX, y: clientY });
      const hits = diagram.nodes.filter(
        (n) =>
          n.type !== "group" &&
          p.x >= n.position.x &&
          p.x <= n.position.x + n.size.w &&
          p.y >= n.position.y &&
          p.y <= n.position.y + n.size.h,
      );
      if (hits.length === 0) return null;
      return hits.reduce((top, n) => (n.z > top.z ? n : top));
    },
    [diagram, screenToFlowPosition],
  );

  const toLayer = useCallback((clientX: number, clientY: number) => {
    const rect = layerRef.current?.getBoundingClientRect();
    return rect ? { x: clientX - rect.left, y: clientY - rect.top } : null;
  }, []);

  const startDrag = useCallback(
    (e: React.PointerEvent, link: GhostLinkInfo) => {
      // Ghosts stay visible in the read-only share viewer — they are how a reader sees that a
      // connection crosses the boundary — but re-mapping a port is an edit, so the endpoint is
      // not draggable there. The "unmapped, waiting to be linked" banner is likewise advice for
      // an author, so it is hidden below rather than shown to someone who cannot act on it.
      if (useDocStore.getState().ui.viewerMode) return;
      e.preventDefault();
      e.stopPropagation();
      const at = toLayer(e.clientX, e.clientY);
      if (!at) return;
      const next = { portId: link.portId, x: at.x, y: at.y, hoverNodeId: nodeAt(e.clientX, e.clientY)?.id ?? null };
      dragRef.current = next;
      setDrag(next);
    },
    [nodeAt, toLayer],
  );

  useEffect(() => {
    if (!drag) return;
    const onMove = (e: PointerEvent) => {
      const at = toLayer(e.clientX, e.clientY);
      if (!at) return;
      const hoverNodeId = nodeAt(e.clientX, e.clientY)?.id ?? null;
      setDrag((d) => {
        if (!d) return d;
        const next = { ...d, x: at.x, y: at.y, hoverNodeId };
        dragRef.current = next;
        return next;
      });
    };
    const onUp = (e: PointerEvent) => {
      const active = dragRef.current;
      dragRef.current = null;
      setDrag(null);
      if (!active) return;
      const target = nodeAt(e.clientX, e.clientY);
      // Dropped on a shape: attach there, on the side the author aimed at. Dropped on bare
      // canvas: detach, so the connection goes back to waiting instead of being stuck.
      if (target) {
        mapUnlinkedPort(active.portId, target.id, nearestSide(target, screenToFlowPosition({ x: e.clientX, y: e.clientY })));
      } else {
        detachPort(active.portId);
      }
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [drag, nodeAt, toLayer, screenToFlowPosition, mapUnlinkedPort, detachPort]);

  const flash = useCallback(() => {
    setFlashing(true);
    window.setTimeout(() => setFlashing(false), 1600);
  }, []);

  if (!diagram) return null;
  if (links.length === 0 && !justResolved) return null;

  const parentLevel = navStack.length - 2;
  const hoveredBox = drag?.hoverNodeId ? diagram.nodes.find((n) => n.id === drag.hoverNodeId) : undefined;

  return (
    <div className={styles.layer} ref={layerRef} data-testid="nd-ghost-links">
      {unmapped.length > 0 && !viewerMode && (
        <div className={styles.bannerWarn} data-testid="nd-ghost-banner-warn">
          <span>
            ⚠ {unmapped.length} connection{unmapped.length === 1 ? "" : "s"} from the parent{" "}
            {unmapped.length === 1 ? "isn't" : "aren't"} linked to anything in here yet
          </span>
          <button type="button" onClick={flash}>
            Show me {unmapped.length === 1 ? "the connection" : "them"}
          </button>
        </div>
      )}
      {unmapped.length === 0 && justResolved && (
        <div className={styles.bannerOk} data-testid="nd-ghost-banner-ok">
          <span>✓ {justResolved}</span>
        </div>
      )}

      {unmapped.length > 0 && diagram.nodes.length === 0 && (
        <div className={styles.emptyHint}>
          <div>This child diagram is empty.</div>
          <div className={styles.emptyHintSub}>Drop a shape here, then link the waiting connection to it.</div>
        </div>
      )}

      {hoveredBox && (
        <div
          className={styles.dropTarget}
          style={{
            left: hoveredBox.position.x * zoom + vx,
            top: hoveredBox.position.y * zoom + vy,
            width: hoveredBox.size.w * zoom,
            height: hoveredBox.size.h * zoom,
          }}
        />
      )}

      {links.map((link) => {
        const isIncoming = link.direction === "incoming";
        const fullChain = [link.label, ...link.chain];
        const chainText =
          link.chain.length > 0
            ? `${fullChain.join(" ← ")}${link.reachesRoot ? " (root diagram)" : ""}`
            : `${link.label} (parent diagram)`;
        const text = isIncoming ? `⇠ ${link.label} · parent` : `${link.label} · parent ⇢`;
        const isDragging = drag?.portId === link.portId;

        if (!link.innerNodeId) {
          const row = unmapped.indexOf(link);
          return (
            <div key={link.id} className={styles.unmappedRow} style={{ top: UNMAPPED_TOP + row * UNMAPPED_GAP }}>
              <div
                className={`${styles.pill} ${styles.pillWarn} ${flashing ? styles.flash : ""}`}
                title={`${chainText} — not linked to anything in this diagram yet`}
                data-testid={`nd-ghost-unmapped-${link.portId}`}
              >
                {text}
              </div>
              <div className={styles.looseLine} />
              {/* While dragging, the handle is drawn by the layer-level element below instead —
                  rendering it here would position it against this row's own box rather than the
                  layer, putting it tens of pixels below the real cursor (the reported "I have to
                  hover below the icon" bug). */}
              {!isDragging && (
                <div
                  className={`${styles.looseEnd} ${flashing ? styles.flash : ""}`}
                  onPointerDown={(e) => startDrag(e, link)}
                  title="Drag onto a shape to link this connection to it"
                  role="button"
                  tabIndex={0}
                />
              )}
              <span className={styles.looseHint}>
                {isDragging ? "drop on a shape to link" : "unlinked — drag me onto a shape"}
              </span>
            </div>
          );
        }

        const innerNode = diagram.nodes.find((n) => n.id === link.innerNodeId);
        if (!innerNode) return null;

        const left = innerNode.position.x * zoom + vx;
        const right = (innerNode.position.x + innerNode.size.w) * zoom + vx;
        const top = innerNode.position.y * zoom + vy;
        const bottom = (innerNode.position.y + innerNode.size.h) * zoom + vy;
        // Several links into the same shape on the same side stand apart, centred on the middle
        // of that side, instead of drawing on top of one another (found with Trace, D117).
        const siblings = links.filter((l) => l.innerNodeId === link.innerNodeId && l.side === link.side);
        const spread = (siblings.indexOf(link) - (siblings.length - 1) / 2) * SIBLING_GAP;
        // Pills above or below a shape sit side by side, so they need their own width apart.
        const vertical0 = link.side === "top" || link.side === "bottom";
        const midX = (left + right) / 2 + (vertical0 ? spread * 3 : 0);
        const midY = (top + bottom) / 2 + (vertical0 ? 0 : spread);

        // The connector runs from the canvas edge to whichever side of the node the port is on,
        // so the row is laid out along that axis and the dashed line simply flexes to fill
        // whatever the pill leaves over — no pill measurement needed.
        const vertical = link.side === "top" || link.side === "bottom";
        const rowStyle: React.CSSProperties =
          link.side === "left"
            ? { top: midY, left: EDGE_INSET, width: Math.max(0, left - EDGE_INSET) }
            : link.side === "right"
              ? { top: midY, left: right, right: EDGE_INSET }
              : link.side === "top"
                ? (() => {
                    const h = Math.min(VERTICAL_REACH, Math.max(0, top - EDGE_INSET));
                    return { left: midX, top: top - h, height: h };
                  })()
                : { left: midX, top: bottom, height: VERTICAL_REACH };

        const pill = (
          <div
            key="pill"
            className={`${styles.pill} ${styles.pillInline}${link.innerNodeId && lit.has(link.innerNodeId) ? ` ${styles.pillLit}` : ""}`}
            data-lit={link.innerNodeId && lit.has(link.innerNodeId) ? "" : undefined}
            title={`${chainText} — click to open the parent diagram`}
            role="button"
            tabIndex={0}
            onClick={() => navigateToLevel(parentLevel)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") navigateToLevel(parentLevel);
            }}
            data-testid={`nd-ghost-link-${link.id}`}
          >
            {text}
          </div>
        );
        const connector = <span key="line" className={vertical ? styles.connectorV : styles.connector} />;
        const handle = isDragging ? null : (
          <div
            key="handle"
            className={styles.mappedEnd}
            onPointerDown={(e) => startDrag(e, link)}
            title="Drag to attach this connection somewhere else, or onto empty canvas to detach it"
            role="button"
            tabIndex={0}
            data-testid={`nd-ghost-handle-${link.portId}`}
          />
        );
        // Node-end first when the row grows away from the node (right/bottom), pill first when
        // it grows toward it (left/top).
        const children =
          link.side === "left" || link.side === "top" ? [pill, connector, handle] : [handle, connector, pill];

        return (
          <div
            key={link.id}
            className={vertical ? `${styles.mappedRow} ${styles.mappedRowV}` : styles.mappedRow}
            style={rowStyle}
          >
            {children}
          </div>
        );
      })}

      {/* One layer-level handle follows the cursor during a drag. Being a direct child of the
          layer is the whole point: its coordinates are layer-relative, like the pointer maths. */}
      {drag && (
        <div
          className={`${styles.looseEnd} ${styles.dragHandle}`}
          style={{ left: drag.x, top: drag.y }}
          data-testid="nd-ghost-drag-handle"
        />
      )}
    </div>
  );
}
