import { memo, useCallback, useMemo, useRef, useState } from "react";
import { BaseEdge, EdgeLabelRenderer, useInternalNode, useReactFlow, type Edge, type EdgeProps, type InternalNode } from "@xyflow/react";
import { useDocStore } from "../model/store";
import type { DEdge, DNode, EdgeLabelPosition, RichLabel } from "../model/types";
import { isFreeEnd, isFreeLine } from "../model/edgeEnds";
import { drawnLength } from "./drawIn";
import { asTraced, edgeDashArray, edgeStrokeWidth, flowClass, flowVars, packetRadius, packetRestPoint, packetTiming } from "./motionStyle";
import { labelPositionAt } from "./edgeLabelPosition";
import { nearestSegmentIndex, type Point } from "./edgeGeometry";
import { edgeColorOnCanvas } from "./edgeColor";
import { buildEdgePath, DEFAULT_EDGE_WIDTH, freeEndPosition, normalizeEdgeStyle, resolveHandleAnchor, type EdgePathInput, type HandleAnchor } from "./edgeRouting";
import { edgeShapeOf, shapeEdge } from "./edgeShapes";
import { dropTargetAt } from "./dropTarget";
import { EdgeToolbar } from "./EdgeToolbar";
import { GRID_SIZE } from "./constants";
import { LabelEditor } from "./LabelEditor";
import { StepBadge, type StepBadgeKind } from "./StepBadge";
import { lineStepCentre } from "./stepGeometry";
import styles from "./DiagramEdge.module.css";

export interface DiagramEdgeData extends Record<string, unknown> {
  edge: DEdge;
  /** Lit by a trace (D117). */
  traced?: boolean;
  /** Not shown yet by Build (A6, D123): its label waits with it. */
  hidden?: boolean;
  /** Its presentation step number, when one shows (A6, D123). */
  step?: { n: number; kind: StepBadgeKind };
}

export type FlowDiagramEdge = Edge<DiagramEdgeData, "diagram">;

const DRAG_THRESHOLD = 4;
interface DragState {
  index: number;
  point: Point;
  isNew: boolean;
}

type EndName = "source" | "target";

/** An end being dragged: where the pointer is, and the shape it would attach to if let go there. */
interface EndDrag {
  end: EndName;
  point: Point;
  over: { nodeId: string; handleId: string; box: { x: number; y: number; w: number; h: number } } | null;
}

const snapPoint = (p: Point): Point =>
  useDocStore.getState().ui.snapEnabled ? { x: Math.round(p.x / GRID_SIZE) * GRID_SIZE, y: Math.round(p.y / GRID_SIZE) * GRID_SIZE } : p;

/** Runs `onMove` for each pointer move until the button is released, then `onUp`. */
function trackPointer(onMove: (ev: PointerEvent) => void, onUp: (ev: PointerEvent) => void) {
  const up = (ev: PointerEvent) => {
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", up);
    onUp(ev);
  };
  window.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", up);
}

function DiagramEdgeComponent({
  id,
  data,
  selected,
  source,
  target,
  sourceHandleId,
  targetHandleId,
  sourceX: rfSourceX,
  sourceY: rfSourceY,
  targetX: rfTargetX,
  targetY: rfTargetY,
  sourcePosition: rfSourcePosition,
  targetPosition: rfTargetPosition,
  markerStart,
  markerEnd,
}: EdgeProps<FlowDiagramEdge>) {
  // toFlowEdge always sets data; EdgeProps only marks it optional because the generic Edge
  // type allows edges with no data at all.
  const edge = data!.edge;

  // Where the ends meet the shapes. React Flow hands over its handle positions, which sit
  // outside the shape; the shared resolver puts each end on the shape's own outline instead,
  // from the nodes' live geometry so the ends follow a drag. The exporter calls the same
  // resolver, so the two stay identical (D81). A free end has no shape: it is its own point.
  const sourceNode = useInternalNode(source);
  const targetNode = useInternalNode(target);
  const sourceEnd = useMemo(
    () => (edge.source.nodeId ? liveAnchor(sourceNode, sourceHandleId, edge.source.anchor) : null),
    [edge.source.nodeId, sourceNode, sourceHandleId, edge.source.anchor],
  );
  const targetEnd = useMemo(
    () => (edge.target.nodeId ? liveAnchor(targetNode, targetHandleId, edge.target.anchor) : null),
    [edge.target.nodeId, targetNode, targetHandleId, edge.target.anchor],
  );

  const editing = useDocStore((s) => s.editingEdgeId === id);
  const setEditingEdgeId = useDocStore((s) => s.setEditingEdgeId);
  const viewerMode = useDocStore((s) => s.ui.viewerMode);
  // The toolbar shows for a line selected on its own.
  const soleSelection = useDocStore((s) => s.selection.edgeIds.length === 1 && s.selection.nodeIds.length === 0);
  const pageColor = useDocStore((s) => s.doc.diagrams[s.currentDiagramId()]?.background) ?? "var(--nd-color-canvas)";
  const { screenToFlowPosition } = useReactFlow();
  const [dragState, setDragState] = useState<DragState | null>(null);
  const dragStateRef = useRef<DragState | null>(null);
  const [endDrag, setEndDrag] = useState<EndDrag | null>(null);
  // A free line being dragged by its body: how far it has moved so far.
  const [moveBy, setMoveBy] = useState<Point | null>(null);
  // A label being dragged (D97): where it is shown until it is let go.
  const [labelDrag, setLabelDrag] = useState<EdgeLabelPosition | null>(null);

  const edgeStyleKind = normalizeEdgeStyle(edge.style.edgeStyle);
  const savedWaypoints = useMemo(() => edge.waypoints ?? [], [edge.waypoints]);
  const waypoints = useMemo(() => {
    let next = [...savedWaypoints];
    if (dragState) {
      if (dragState.isNew) next.splice(dragState.index, 0, dragState.point);
      else next[dragState.index] = dragState.point;
    }
    if (moveBy) next = next.map((p) => ({ x: p.x + moveBy.x, y: p.y + moveBy.y }));
    return next;
  }, [dragState, savedWaypoints, moveBy]);

  // Each end's point: the dragged pointer, the shape's anchor, or the free end's own point.
  const endPoint = (name: EndName, anchor: HandleAnchor | null, rfX: number, rfY: number): Point => {
    if (endDrag?.end === name) return endDrag.point;
    const end = edge[name];
    if (isFreeEnd(end)) return moveBy ? { x: end.point.x + moveBy.x, y: end.point.y + moveBy.y } : end.point;
    return anchor?.point ?? { x: rfX, y: rfY };
  };
  const from = endPoint("source", sourceEnd, rfSourceX, rfSourceY);
  const to = endPoint("target", targetEnd, rfTargetX, rfTargetY);
  const isLoose = (name: EndName) => endDrag?.end === name || isFreeEnd(edge[name]);
  // A free (or dragged) end leaves toward its neighbour; a fixed point leaves by the resolver's side.
  const sourcePosition = isLoose("source")
    ? freeEndPosition(from, waypoints[0] ?? to)
    : (edge.source.anchor && sourceEnd?.position) || rfSourcePosition;
  const targetPosition = isLoose("target")
    ? freeEndPosition(to, waypoints[waypoints.length - 1] ?? from)
    : (edge.target.anchor && targetEnd?.position) || rfTargetPosition;

  const points: Point[] = useMemo(() => [from, ...waypoints, to], [from, waypoints, to]);

  // Geometry lives in edgeRouting so the exporters draw the identical path.
  const input: EdgePathInput = {
    sourceX: from.x,
    sourceY: from.y,
    sourcePosition,
    targetX: to.x,
    targetY: to.y,
    targetPosition,
    waypoints,
    kind: edgeStyleKind,
    label: labelDrag ?? edge.labelPosition,
  };
  const { path, labelPos, midPos } = buildEdgePath(input);
  const pathRef = useRef(path);
  pathRef.current = path;

  // Dragging a label moves it along or off its line. Where it lands is kept
  // relative to the line, so it follows the shapes from then on. A press that does not move is a
  // click — it selects the line — so double-click to edit is untouched.
  const onLabelPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (viewerMode || e.button !== 0) return;
    e.stopPropagation();
    const start = { x: e.clientX, y: e.clientY };
    // Unsnapped: a label follows the pointer, not the grid (React Flow snaps here when snap is on).
    const at = screenToFlowPosition(start, { snapToGrid: false });
    // Keep the grip: the label moves with the pointer, not by its centre snapping to it.
    const grip = { x: at.x - labelPos.x, y: at.y - labelPos.y };
    let moved = false;
    const centreAt = (ev: PointerEvent) => {
      const p = screenToFlowPosition({ x: ev.clientX, y: ev.clientY }, { snapToGrid: false });
      return labelPositionAt(pathRef.current, { x: p.x - grip.x, y: p.y - grip.y });
    };
    const onMove = (ev: PointerEvent) => {
      if (!moved && Math.hypot(ev.clientX - start.x, ev.clientY - start.y) < 3) return;
      moved = true;
      setLabelDrag(centreAt(ev));
    };
    const onUp = (ev: PointerEvent) => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      const store = useDocStore.getState();
      if (moved) store.setEdgeLabelPosition([id], centreAt(ev));
      else store.setSelection([], [id]);
      setLabelDrag(null);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  const commitDrag = useCallback(() => {
    const drag = dragStateRef.current;
    if (drag) {
      const next = [...savedWaypoints];
      if (drag.isNew) next.splice(drag.index, 0, drag.point);
      else next[drag.index] = drag.point;
      useDocStore.getState().updateEdgeWaypoints(id, next);
    }
    dragStateRef.current = null;
    setDragState(null);
  }, [id, savedWaypoints]);

  /** Drags waypoint `index` — an existing bend, or (isNew) one being added at that place. */
  const startBendDrag = useCallback(
    (index: number, isNew: boolean) => (e: React.PointerEvent) => {
      e.stopPropagation();
      e.preventDefault();
      trackPointer(
        (ev) => {
          const next: DragState = { index, point: snapPoint(screenToFlowPosition({ x: ev.clientX, y: ev.clientY })), isNew };
          dragStateRef.current = next;
          setDragState(next);
        },
        () => commitDrag(),
      );
    },
    [commitDrag, screenToFlowPosition],
  );

  const removeWaypoint = useCallback(
    (index: number) => {
      const next = savedWaypoints.filter((_, i) => i !== index);
      useDocStore.getState().updateEdgeWaypoints(id, next);
    },
    [id, savedWaypoints],
  );

  // Dragging the line itself. A line with nothing at either end moves as a whole; a
  // connection between shapes gets a new bend where it was pulled instead.
  const onLinePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (viewerMode) return;
      e.stopPropagation();
      const startClient = { x: e.clientX, y: e.clientY };
      const startFlow = screenToFlowPosition(startClient);
      const wholeLine = isFreeLine(edge);
      let started = false;
      let insertIndex = 0;
      let delta: Point = { x: 0, y: 0 };

      trackPointer(
        (ev) => {
          if (!started) {
            if (Math.hypot(ev.clientX - startClient.x, ev.clientY - startClient.y) < DRAG_THRESHOLD) return;
            started = true;
            insertIndex = nearestSegmentIndex(points, startFlow);
          }
          const point = screenToFlowPosition({ x: ev.clientX, y: ev.clientY });
          if (wholeLine) {
            const raw = { x: point.x - startFlow.x, y: point.y - startFlow.y };
            // Snap the line's first end to the grid; the rest moves with it.
            const anchor = edge.source.point!;
            const snapped = snapPoint({ x: anchor.x + raw.x, y: anchor.y + raw.y });
            delta = { x: snapped.x - anchor.x, y: snapped.y - anchor.y };
            setMoveBy(delta);
            return;
          }
          const next: DragState = { index: insertIndex, point: snapPoint(point), isNew: true };
          dragStateRef.current = next;
          setDragState(next);
        },
        () => {
          if (!started) return;
          if (wholeLine) {
            setMoveBy(null);
            useDocStore.getState().moveEdges([id], delta.x, delta.y);
            return;
          }
          commitDrag();
        },
      );
    },
    [commitDrag, edge, id, points, screenToFlowPosition, viewerMode],
  );

  // Dragging an end: onto a shape attaches it there (anywhere on the shape), and
  // anywhere else leaves it free at that point.
  const onEndPointerDown = useCallback(
    (name: EndName) => (e: React.PointerEvent) => {
      e.stopPropagation();
      e.preventDefault();
      const other = edge[name === "source" ? "target" : "source"];
      let last: EndDrag | null = null;
      trackPointer(
        (ev) => {
          const client = { x: ev.clientX, y: ev.clientY };
          const flow = screenToFlowPosition(client);
          const state = useDocStore.getState();
          const nodes = state.doc.diagrams[state.currentDiagramId()]?.nodes ?? [];
          const hit = dropTargetAt(client, flow, nodes, other.nodeId);
          const node = hit ? nodes.find((n) => n.id === hit.nodeId) : undefined;
          last = {
            end: name,
            point: hit ? flow : snapPoint(flow),
            over: hit && node ? { ...hit, box: { x: node.position.x, y: node.position.y, w: node.size.w, h: node.size.h } } : null,
          };
          setEndDrag(last);
        },
        () => {
          const done = last;
          setEndDrag(null);
          if (!done) return;
          const store = useDocStore.getState();
          if (done.over) store.reconnectEdge(id, name, done.over.nodeId, done.over.handleId);
          else store.setEdgeEndPoint(id, name, done.point);
        },
      );
    },
    [edge, id, screenToFlowPosition],
  );

  const commitLabel = useCallback(
    (label: RichLabel) => {
      useDocStore.getState().setEdgeLabel(id, label);
    },
    [id],
  );

  const baseColor = edgeColorOnCanvas(edge.style);
  // Throughput's weight carries its volume, moving or still (A3, D119).
  const baseWidth = edgeStrokeWidth(edge, (edge.style.strokeWidth as number) ?? DEFAULT_EDGE_WIDTH);
  const strokeColor = selected ? "var(--nd-color-nest-accent)" : baseColor;
  const strokeWidth = selected ? Math.max(baseWidth, 2.5) : baseWidth;
  // A Flow line without a dash style of its own marches Flow's pattern (D116); so does a line a
  // trace lights (D117).
  const moving = data?.traced ? asTraced(edge) : edge;
  // Draw in (A5, D121): while it plays, every line traces itself from its start, then gets its own
  // dashes and motion back.
  const drawingIn = useDocStore((s) => s.ui.drawingIn !== null);
  const dashArray = edgeDashArray(moving);
  const flow = flowVars(moving);
  const flowCls = flowClass(moving);

  // A double line or block arrow is a wide stroke with the page colour down its middle (edgeShapes.ts).
  const shape = edgeShapeOf(edge.style);
  const shaped = shape === "line" ? null : shapeEdge(input, shape, baseWidth, { start: (edge.style.startArrow ?? "none") !== "none", end: (edge.style.endArrow ?? "none") !== "none" });

  const showHandles = selected && !viewerMode;
  // A faint dot halfway along each stretch: drag it to bend the line there.
  const bendSpots = showHandles && !dragState && !endDrag && !moveBy
    ? waypoints.length === 0
      ? [{ index: 0, at: midPos }]
      : points.slice(1).map((p, i) => ({ index: i, at: { x: (points[i].x + p.x) / 2, y: (points[i].y + p.y) / 2 } }))
    : [];
  const live = endDrag?.point ?? (dragState ? dragState.point : null);

  return (
    <>
      {shaped && shaped.outer > 0 ? (
        <>
          <BaseEdge path={shaped.path} className={flowCls} style={{ stroke: strokeColor, strokeWidth: shaped.outer, strokeDasharray: dashArray, fill: "none", ...flow }} interactionWidth={0} />
          <path d={shaped.path} fill="none" stroke={pageColor} strokeWidth={shaped.inner} pointerEvents="none" />
          {shaped.heads.map((d, i) => (
            <path key={i} d={d} fill={pageColor} stroke={strokeColor} strokeWidth={baseWidth} strokeLinejoin="round" pointerEvents="none" />
          ))}
        </>
      ) : (
        <BaseEdge
          path={shaped?.path ?? path}
          markerStart={markerStart}
          markerEnd={markerEnd}
          className={drawingIn ? "nd-anim nd-drawin" : flowCls}
          style={drawingIn ? { stroke: strokeColor, strokeWidth, ["--nd-len" as string]: `${drawnLength(shaped?.path ?? path)}px` } : { stroke: strokeColor, strokeWidth, strokeDasharray: dashArray, ...flow }}
          interactionWidth={0}
        />
      )}
      {moving.motion?.kind === "packets" && <Packet d={shaped?.path ?? path} edge={moving} color={strokeColor} width={strokeWidth} />}
      <path
        d={path}
        fill="none"
        stroke="transparent"
        strokeWidth={Math.max(16, (shaped?.outer ?? 0) + 10)}
        className={isFreeLine(edge) ? `${styles.hitPath} ${styles.movable}` : styles.hitPath}
        onPointerDown={onLinePointerDown}
        onDoubleClick={() => setEditingEdgeId(id)}
        data-testid={`nd-edge-hit-${id}`}
      />
      <EdgeLabelRenderer>
        {endDrag?.over && (
          <div
            className={styles.dropTarget}
            style={{ transform: `translate(${endDrag.over.box.x}px, ${endDrag.over.box.y}px)`, width: endDrag.over.box.w, height: endDrag.over.box.h }}
          />
        )}
        {showHandles &&
          waypoints.map((wp, i) => (
            <div
              key={i}
              className={styles.waypoint}
              style={{ transform: `translate(-50%, -50%) translate(${wp.x}px, ${wp.y}px)` }}
              onPointerDown={startBendDrag(i, false)}
              onDoubleClick={(e) => {
                e.stopPropagation();
                removeWaypoint(i);
              }}
              title="Drag to move, double-click to remove"
            />
          ))}
        {bendSpots.map((b) => (
          <div
            key={`v${b.index}`}
            className={styles.virtualBend}
            style={{ transform: `translate(-50%, -50%) translate(${b.at.x}px, ${b.at.y}px)` }}
            onPointerDown={startBendDrag(b.index, true)}
            // It sits on the line's middle, where a double-click to label the line lands once the
            // first click has selected it — so it labels the line, as the line itself would.
            onDoubleClick={(e) => {
              e.stopPropagation();
              setEditingEdgeId(id);
            }}
            title="Drag to bend the line here, double-click to label it"
            data-testid={`nd-edge-bend-${id}-${b.index}`}
          />
        ))}
        {showHandles &&
          (["source", "target"] as const).map((name) => {
            const p = name === "source" ? from : to;
            return (
              <div
                key={name}
                className={isLoose(name) ? styles.endFree : styles.endAttached}
                style={{ transform: `translate(-50%, -50%) translate(${p.x}px, ${p.y}px)` }}
                onPointerDown={onEndPointerDown(name)}
                title={isLoose(name) ? "Drag onto a shape to connect" : "Drag to move this end, or off the shape to free it"}
                data-testid={`nd-edge-end-${id}-${name}`}
              />
            );
          })}
        {live && (
          <div className={styles.coords} style={{ transform: `translate(${live.x + 12}px, ${live.y + 12}px)` }}>
            {Math.round(live.x)}, {Math.round(live.y)}
          </div>
        )}
        {showHandles && soleSelection && !endDrag && !dragState && !moveBy && !editing && <EdgeToolbar edge={edge} at={toolbarSpot(points, midPos)} />}
        {editing ? (
          <div
            style={{
              position: "absolute",
              width: 140,
              height: 40,
              transform: `translate(-50%, -50%) translate(${labelPos.x}px, ${labelPos.y}px)`,
              pointerEvents: "all",
            }}
          >
            <LabelEditor initial={edge.label} onCommit={commitLabel} onCancel={() => setEditingEdgeId(null)} />
          </div>
        ) : (
          edge.label?.text && (
            <div
              className={`${styles.labelPill} nodrag nopan${labelDrag ? ` ${styles.labelDragging}` : ""}${data?.hidden ? " nd-build-hidden-label" : ""}`}
              data-testid={`nd-edge-label-${id}`}
              onPointerDown={onLabelPointerDown}
              title={viewerMode ? undefined : "Drag to move the label; double-click to edit"}
              style={{
                transform: `translate(-50%, -50%) translate(${labelPos.x}px, ${labelPos.y}px)`,
                fontWeight: edge.label.bold ? 700 : 400,
                fontStyle: edge.label.italic ? "italic" : "normal",
                color: edge.label.color ?? "var(--nd-color-ink)",
                fontSize: edge.label.fontSize ?? 11,
              }}
              onDoubleClick={() => setEditingEdgeId(id)}
            >
              {edge.label.text}
            </div>
          )
        )}
        {data?.step && <StepBadge n={data.step.n} kind={data.step.kind} at={lineStepCentre(midPos, !!edge.label?.text)} />}
      </EdgeLabelRenderer>
    </>
  );
}

/** Where the line's toolbar sits: centred over the line, above its highest point. */
function toolbarSpot(points: Point[], mid: Point): Point {
  const top = Math.min(...points.map((p) => p.y), mid.y);
  return { x: mid.x, y: top };
}

/**
 * An edge end on the live node: React Flow's current position and measured size (so it follows a
 * drag), the model node for its shape and rotation, and the shared resolver for the point.
 */
function liveAnchor(
  node: InternalNode | undefined,
  handleId: string | null | undefined,
  fixed: { x: number; y: number } | undefined,
): HandleAnchor | null {
  if (!node) return null;
  const model = (node.data as { node?: DNode } | undefined)?.node;
  const w = node.measured?.width ?? node.width;
  const h = node.measured?.height ?? node.height;
  if (!model || !w || !h) return null;
  const { x, y } = node.internals.positionAbsolute;
  return resolveHandleAnchor(model, { x, y, w, h }, handleId, fixed);
}

export const DiagramEdge = memo(DiagramEdgeComponent);

/**
 * Packets (A3, D119): a dot travelling the line, by SVG's own <animateMotion> — declarative, no
 * script per frame. CSS animation rules cannot stop SMIL, so a resting dot is drawn too, and the
 * off switches (styles/motion.css) show one or the other.
 */
function Packet({ d, edge, color, width }: { d: string; edge: Pick<DEdge, "style" | "motion">; color: string; width: number }) {
  const timing = packetTiming(d, edge);
  const rest = packetRestPoint(d, edge);
  const r = packetRadius(width);
  return (
    <g pointerEvents="none" data-testid="nd-packet">
      <circle className="nd-anim nd-packet-moving" r={r} fill={color}>
        <animateMotion path={d} dur={`${timing.dur}s`} keyPoints={timing.keyPoints} keyTimes={timing.keyTimes} calcMode="linear" repeatCount="indefinite" />
      </circle>
      {rest && <circle className="nd-packet-rest" cx={rest.x} cy={rest.y} r={r} fill={color} />}
    </g>
  );
}
