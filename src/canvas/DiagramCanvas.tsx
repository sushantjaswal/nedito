import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Background,
  BackgroundVariant,
  ConnectionMode,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
  useStoreApi,
  useUpdateNodeInternals,
  useViewport,
  type Connection,
  type EdgeMouseHandler,
  type FinalConnectionState,
  type InternalNode,
  type NodeMouseHandler,
  type OnConnect,
  type OnInit,
  type OnNodeDrag,
  type OnSelectionChangeFunc,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { NodePatch } from "../model/actions";
import { getLayerId, getLayers } from "../model/layers";
import type { ScratchpadItem } from "../model/scratchpad";
import { useDocStore } from "../model/store";
import { markerDefs, markerId } from "./arrowheads";
import { endHandle } from "./edgeRouting";
import type { DEdge, Diagram, DNode, GroupNode as GroupNodeModel } from "../model/types";
import { GhostLinks } from "../nesting/GhostLinks";
import { PageBoundaries } from "./PageBoundaries";
import { NestedNode, type FlowNestedNode } from "../nesting/NestedNode";
import { maybeDrawIn } from "./drawIn";
import { NoteCard } from "../notes/NoteCard";
import { TraceHint } from "./TraceHint";
import { usePresentation, type PresentationState } from "./usePresentation";
import { WalkthroughDot } from "./WalkthroughDot";
import { PreviewHint } from "./PreviewHint";
import { traceSet, type TracedSet } from "../nesting/trace";
import { firstVisitViewport } from "../nesting/navigation";
import { AlignmentGuides } from "./AlignmentGuides";
import { computeSnap } from "./alignmentSnap";
import { setCanvasInstance, setStepZoom, stepZoom } from "./canvasApi";
import { ContextMenu, type ContextMenuTarget } from "./ContextMenu";
import { ContextBar } from "../context-bar/ContextBar";
import { ZoomVariable } from "./ZoomVariable";
import { recordShapeUse } from "../library/recentShapes";
import { CanvasChip } from "../context-bar/CanvasChip";
import { GRID_SIZE } from "./constants";
import styles from "./DiagramCanvas.module.css";
import { DiagramEdge, type FlowDiagramEdge } from "./DiagramEdge";
import { GroupNode, type FlowGroupNode } from "./GroupNode";
import { findNestedNodeUnderDrop } from "./nestedDropDetection";
import { ShapeNode, type FlowShapeNode } from "./ShapeNode";
import { PointNode } from "./PointNode";
import { edgeIdOfPointNode, isPointNodeId, POINT_HANDLE, pointNodeId, type FlowPointNode } from "./pointNodeIds";
import { dropTargetAt } from "./dropTarget";
import { isFreeEnd } from "../model/edgeEnds";
import { useSpaceDragPan } from "./useSpaceDragPan";
import { nextSteppedZoom, type ZoomDirection } from "./zoomSteps";
import { splashCanvasReady } from "../app/splash";

const MIN_ZOOM = 0.1;
const MAX_ZOOM = 4;
const STENCIL_MIME = "application/nd-stencil";

export type FlowNode = FlowShapeNode | FlowNestedNode | FlowGroupNode | FlowPointNode;

const nodeTypes = { shape: ShapeNode, nested: NestedNode, group: GroupNode, point: PointNode };

/** The invisible anchors for an edge's free ends (PointNode.tsx). */
function pointNodesFor(edge: DEdge): FlowPointNode[] {
  const out: FlowPointNode[] = [];
  for (const end of ["source", "target"] as const) {
    const e = edge[end];
    if (!isFreeEnd(e)) continue;
    out.push({
      id: pointNodeId(edge.id, end),
      type: "point",
      position: e.point,
      width: 1,
      height: 1,
      data: {},
      // Selectable only so a rubber band can catch it: a band around a line's free ends selects
      // the line (onSelectionChange). Clicks never reach it — it has no size and no pointer events.
      selectable: true,
      draggable: false,
      connectable: false,
      focusable: false,
      zIndex: -1,
    });
  }
  return out;
}
const edgeTypes = { diagram: DiagramEdge };

// A group's children are wired as real React Flow child nodes (parentId, deliberately without
// `extent: "parent"` — see toFlowNode) so dragging the group frame moves them for free via
// React Flow's own parent/child rendering — the authoritative model still stores every node's
// position as absolute (the document model), so this map (and the relative-position math
// below) exists only at this rendering-adapter boundary, converted back to absolute in
// onNodeDragStop.
function buildChildToGroup(diagram: Diagram): Map<string, GroupNodeModel> {
  const map = new Map<string, GroupNodeModel>();
  for (const n of diagram.nodes) {
    if (n.type === "group") {
      for (const childId of n.childIds) map.set(childId, n);
    }
  }
  return map;
}

/** A node's class while tracing: traced, a line away, or dimmed (D117). */
function traceClass(traced: TracedSet, id: string): string {
  if (traced.focus.has(id)) return "nd-trace-focus";
  return traced.nodes.has(id) ? "nd-trace-near" : "nd-trace-dim";
}

/**
 * A node's or line's class from what is lit or hidden: a reader's trace first, then Spotlight's
 * focus, then Build's progress (A6, D123). Undefined when none applies.
 */
function stageClass(id: string, kind: "node" | "edge", traced: TracedSet | null, present: PresentationState | null): string | undefined {
  if (traced) return kind === "node" ? traceClass(traced, id) : traced.edges.has(id) ? "nd-trace-on" : "nd-trace-dim";
  if (present?.lit) {
    if (kind === "edge") return present.lit.edges.has(id) ? "nd-trace-on" : "nd-trace-dim";
    return present.lit.nodes.has(id) ? (present.lit.edges.size ? "nd-trace-near" : "nd-trace-focus") : "nd-trace-dim";
  }
  if (present?.hidden) return present.hidden.has(id) ? "nd-build-hidden" : "nd-build-shown";
  return undefined;
}

function toFlowNode(
  node: DNode,
  selected: boolean,
  childToGroup: Map<string, GroupNodeModel>,
  locked: boolean,
  traced: TracedSet | null = null,
  present: PresentationState | null = null,
): FlowNode {
  const group = childToGroup.get(node.id);
  const position = group
    ? { x: node.position.x - group.position.x, y: node.position.y - group.position.y }
    : node.position;
  const base = {
    id: node.id,
    position,
    selected,
    width: node.size.w,
    height: node.size.h,
    zIndex: node.z,
    // A locked layer's shapes still render and connect, but can't be selected, moved, or
    // resized — a locked layer protects its content from edits.
    selectable: !locked,
    draggable: !locked,
    // parentId alone (no `extent: "parent"`) is deliberate: React Flow's extent clamp confines
    // a dragged child's own reported position to the parent frame's *local* bounds — since the
    // frame is sized tightly around its children, that clamp bit within ~20-30px of travel. The
    // group-drag logic below (onNodeDragStart/onNodeDrag/onNodeDragStop) already fully overrides
    // child-drag semantics — it reads the child's raw reported delta to move the frame, so an
    // extent clamp on that delta caps how far the *whole group* can be dragged, not just the
    // child. Without it, the child's own visual position still gets reset to its pre-drag value
    // every frame (see onNodeDrag), so nothing about not clamping lets it visually escape the
    // frame — it just stops the delta computation itself from saturating early.
    ...(group ? { parentId: group.id } : {}),
    // Trace (D117): the traced shapes, the ones a line away, and everything else dimmed; or what
    // a presentation lights or has not shown yet (A6, D123).
    ...(stageClass(node.id, "node", traced, present) ? { className: stageClass(node.id, "node", traced, present) } : {}),
  };
  const step = present?.steps?.get(node.id);
  const stepData = step && present?.badge ? { step: { n: step, kind: present.badge } } : {};
  if (node.type === "nested") {
    const litPorts = traced ? node.ports.filter((p) => traced.ports.has(p.id)).map((p) => p.id) : undefined;
    return { ...base, type: "nested", data: { node, ...stepData, ...(litPorts?.length ? { litPorts } : {}) } };
  }
  if (node.type === "group") {
    return { ...base, type: "group", data: { node } };
  }
  return { ...base, type: "shape", data: { node, ...stepData } };
}

// Resolves a grouped child's drag delta against `diagram` (the authoritative, doc-committed
// model — never mutated mid-drag, so it's a stable baseline for the whole gesture): how far
// has the member moved from where it started, in relative-to-frame terms. Returns null when
// the drag isn't "a single grouped child."
function resolveGroupDragDelta(
  diagram: Diagram,
  node: FlowNode,
  draggedNodes: FlowNode[],
): { frame: GroupNodeModel; dx: number; dy: number } | null {
  if (draggedNodes.length !== 1 || !node.parentId) return null;
  const frame = diagram.nodes.find((n) => n.id === node.parentId);
  const draggedModel = diagram.nodes.find((n) => n.id === node.id);
  if (!frame || frame.type !== "group" || !draggedModel) return null;
  const originalRelX = draggedModel.position.x - frame.position.x;
  const originalRelY = draggedModel.position.y - frame.position.y;
  return { frame, dx: node.position.x - originalRelX, dy: node.position.y - originalRelY };
}

// Color-codes the minimap's node thumbnails by type so a nested diagram's structure (which
// boxes are "drill-in" boxes vs. plain shapes vs. groups) reads at a glance, using the same
// violet nesting accent as the real NestedNode rendering (the nesting accent in styles/tokens.css).
function minimapNodeColor(node: FlowNode): string {
  if (node.type === "point") return "transparent";
  if (node.type === "nested") return "#6D5AE6";
  if (node.type === "group") return "#D8DCE3";
  return "#66707D";
}

// React Flow's own MarkerType has exactly two shapes, two short of what UML needs, so every
// arrowhead goes through our own <marker> defs instead (canvas/arrowheads.ts, rendered by
// ArrowheadDefs below). React Flow takes a string markerEnd as a marker *id* and wraps it in
// url('#…') itself, so it must be given the bare id — see markerId for what happened when it
// was not.
const toMarker = markerId;

/**
 * The arrowhead marker definitions, mounted once inside the flow.
 *
 * Zero-size and aria-hidden: it exists only so `url(#nd-arrow-…)` has something to resolve
 * against. It has to live inside the React Flow subtree rather than at document level, because
 * that is the SVG scope the edges are drawn in.
 */
function ArrowheadDefs() {
  return (
    <svg width="0" height="0" aria-hidden="true" style={{ position: "absolute" }}>
      {/* eslint-disable-next-line no-restricted-syntax -- built from the fixed arrowhead table, no document data */}
      <defs dangerouslySetInnerHTML={{ __html: markerDefs() }} />
    </svg>
  );
}

function toFlowEdge(
  edge: DEdge,
  selected: boolean,
  locked: boolean,
  traced: TracedSet | null = null,
  present: PresentationState | null = null,
): FlowDiagramEdge {
  const on = traced?.edges.has(edge.id) ?? false;
  const stage = stageClass(edge.id, "edge", traced, present);
  const step = present?.steps?.get(edge.id);
  return {
    id: edge.id,
    type: "diagram",
    ...(stage ? { className: stage } : {}),
    // A free end hangs from its own invisible anchor node (PointNode.tsx).
    source: edge.source.nodeId ?? pointNodeId(edge.id, "source"),
    target: edge.target.nodeId ?? pointNodeId(edge.id, "target"),
    // Derived, not read: a port end attaches to its port whatever the style string says.
    sourceHandle: edge.source.nodeId ? endHandle(edge.source, edge.style.sourceHandle) : POINT_HANDLE,
    targetHandle: edge.target.nodeId ? endHandle(edge.target, edge.style.targetHandle) : POINT_HANDLE,
    selected,
    selectable: !locked,
    data: {
      edge,
      ...(on ? { traced: true } : {}),
      ...(present?.hidden?.has(edge.id) ? { hidden: true } : {}),
      ...(step && present?.badge ? { step: { n: step, kind: present.badge } } : {}),
    },
    markerStart: toMarker(edge.style.startArrow),
    markerEnd: toMarker(edge.style.endArrow),
  };
}

// Custom Zoom In/Out (replacing React Flow's default <Controls> zoom buttons, hidden via
// showZoom={false} below) so clicks step through the same clean 25% grid as Ctrl+=/Ctrl+-,
// both calling the same canvasApi.stepZoom function.
function ZoomControls() {
  const { zoom } = useViewport();
  const { zoomTo } = useReactFlow();
  const percent = Math.round(zoom * 100);

  return (
    <div className={styles.zoomControls} data-testid="nd-zoom-controls">
      <button
        type="button"
        className={styles.zoomBtn}
        onClick={() => stepZoom(-1)}
        title="Zoom out"
        aria-label="Zoom out"
        data-testid="nd-zoom-out"
      >
        −
      </button>
      {/* Free-form zoom to any value in the 10%-400% range, independent of
          the +/- buttons' 25% grid. Per-diagram by construction: the store already keeps a
          viewport per diagram id, so a nested canvas remembers its own zoom. */}
      <input
        type="range"
        className={styles.zoomSlider}
        min={MIN_ZOOM * 100}
        max={MAX_ZOOM * 100}
        step={1}
        value={percent}
        onChange={(e) => zoomTo(Number(e.target.value) / 100, { duration: 0 })}
        title={`Zoom: ${percent}%`}
        aria-label="Zoom level"
        data-testid="nd-zoom-slider"
      />
      <span className={styles.zoomBadge}>{percent}%</span>
      <button
        type="button"
        className={styles.zoomBtn}
        onClick={() => stepZoom(1)}
        title="Zoom in"
        aria-label="Zoom in"
        data-testid="nd-zoom-in"
      >
        +
      </button>
      {/* Fit view is a zoom action, so it lives here, after +, set apart by a thin rule (D108; it
          sat at the left end of the canvas chip). Still React Flow's own fit-view control —
          icon, "Fit View" tooltip and name, fitView() — only re-seated: its panel is laid out
          in this bar instead of pinned to the canvas corner. */}
      <span className={styles.zoomDivider} aria-hidden="true" />
      <Controls showZoom={false} showInteractive={false} className={styles.fitControl} style={{ position: "static", margin: 0 }} />
    </div>
  );
}

function DiagramCanvasInner() {
  const panOnDrag = useSpaceDragPan();
  const doc = useDocStore((s) => s.doc);
  const diagramId = useDocStore((s) => s.currentDiagramId());
  const selectedNodeIds = useDocStore((s) => s.selection.nodeIds);
  const selectedEdgeIds = useDocStore((s) => s.selection.edgeIds);
  const gridEnabled = useDocStore((s) => s.ui.gridEnabled);
  const snapEnabled = useDocStore((s) => s.ui.snapEnabled);
  // Read-only because this canvas is showing a shared diagram opened from a link. Pan, zoom and
  // drill-down all stay live — a viewer that can't be navigated is not a viewer — but every
  // affordance that would change the document is switched off below.
  const viewerMode = useDocStore((s) => s.ui.viewerMode);
  const minimapOpen = useDocStore((s) => s.ui.minimapOpen);
  const moveOrResizeNodes = useDocStore((s) => s.moveOrResizeNodes);
  const setSelection = useDocStore((s) => s.setSelection);
  const bringToFront = useDocStore((s) => s.bringToFront);
  const connect = useDocStore((s) => s.connect);

  const diagram = doc.diagrams[diagramId];
  const { screenToFlowPosition, getViewport, setViewport, getEdges, getNodes } = useReactFlow();
  const flowStore = useStoreApi();
  const updateNodeInternals = useUpdateNodeInternals();

  useEffect(() => {
    // Per-level viewport memory: restore where the user left off, or default to 100% zoom
    // (matching most diagram editors' default for a diagram with no view history yet) on a
    // first visit — no more auto-fit-to-content, which produced an unpredictable zoom level
    // depending on how spread out the content was.
    // Inside a Nested Block, a first visit leaves the incoming ghost pills room (D113).
    const { viewportByDiagramId, doc, navStack } = useDocStore.getState();
    setViewport(viewportByDiagramId[diagramId] ?? firstVisitViewport(doc, navStack, diagramId), { duration: 300 });
  }, [diagramId, setViewport]);

  // Zoom In/Out step through clean 25% increments (zoomSteps.ts) rather than React Flow's
  // default freeform multiplier, zooming toward the pane's visual center the same way RF's
  // own zoomIn/zoomOut does. Registered on canvasApi so the keyboard shortcut hook — which
  // lives outside this ReactFlowProvider tree — can reach it too.
  const stepZoom = useCallback(
    (direction: ZoomDirection) => {
      const vp = getViewport();
      const newZoom = nextSteppedZoom(vp.zoom, direction);
      if (newZoom === vp.zoom) return;
      const bounds = document.querySelector('[data-testid="nd-canvas"]')?.getBoundingClientRect();
      if (!bounds) {
        setViewport({ ...vp, zoom: newZoom }, { duration: 150 });
        return;
      }
      const centerScreen = { x: bounds.left + bounds.width / 2, y: bounds.top + bounds.height / 2 };
      const flowCenter = screenToFlowPosition(centerScreen);
      setViewport(
        {
          zoom: newZoom,
          x: centerScreen.x - bounds.left - flowCenter.x * newZoom,
          y: centerScreen.y - bounds.top - flowCenter.y * newZoom,
        },
        { duration: 150 },
      );
    },
    [getViewport, setViewport, screenToFlowPosition],
  );
  useEffect(() => {
    setStepZoom(stepZoom);
    return () => setStepZoom(null);
  }, [stepZoom]);

  // Trace (D117): what is lit on this level, if the trace is here and still names a shape on it.
  const trace = useDocStore((s) => s.trace);
  const traced = useMemo(() => {
    if (!trace || trace.diagramId !== diagramId) return null;
    const focus = trace.focus.filter((id) => diagram.nodes.some((n) => n.id === id));
    return focus.length ? traceSet(diagram, focus) : null;
  }, [trace, diagram, diagramId]);

  // Presentation (A6, D123): Build's progress, Spotlight's focus, the step badges.
  const present = usePresentation(diagram, diagramId);
  const presentOrStill = present.steps || present.hidden || present.lit ? present : null;
  const walkOrder = useMemo(() => (present.walking && present.steps ? [...present.steps.keys()] : null), [present]);

  const [nodes, setNodes, onNodesChange] = useNodesState<FlowNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<FlowDiagramEdge>([]);

  const layerLookup = useMemo(() => {
    const map = new Map<string, { visible: boolean; locked: boolean }>();
    for (const l of getLayers(diagram)) map.set(l.id, { visible: l.visible, locked: l.locked });
    return map;
  }, [diagram]);

  useEffect(() => {
    // React Flow requires a parent node to appear before its children in the nodes array;
    // groups (only ever parents, never nested inside another group — flat groups stay flat)
    // go first. A hidden layer's nodes are dropped entirely rather than rendered-but-invisible
    // (hidden layer content doesn't take part in the canvas at all).
    // While a box is being dragged, React Flow owns what is selected. This effect pushes our
    // store's idea of it into the canvas, and it re-runs the moment the selection changes — which
    // happens *during* the drag, overwriting the box's own in-progress state with the selection
    // from before it started. React Flow then takes the union, so the old selection is folded into
    // the new one: two shapes, then five, then everything. The gesture's end reconciles both
    // sides (onSelectionEnd), so nothing is lost by standing back until then.
    if (boxSelectingRef.current) return;
    const childToGroup = buildChildToGroup(diagram);
    const groupFlowNodes: FlowNode[] = [];
    const otherFlowNodes: FlowNode[] = [];
    for (const n of diagram.nodes) {
      const layer = layerLookup.get(getLayerId(n, diagram));
      if (layer && !layer.visible) continue;
      const flowNode = toFlowNode(n, selectedNodeIds.includes(n.id), childToGroup, layer?.locked ?? false, traced, presentOrStill);
      (n.type === "group" ? groupFlowNodes : otherFlowNodes).push(flowNode);
    }
    for (const e of diagram.edges) {
      if (layerLookup.get(getLayerId(e, diagram))?.visible === false) continue;
      otherFlowNodes.push(...pointNodesFor(e));
    }
    setNodes([...groupFlowNodes, ...otherFlowNodes]);
    // diagram is a fresh object reference on every doc mutation (immutable updates), so this
    // effect re-syncs exactly when the model actually changed, not on every render.
  }, [diagram, selectedNodeIds, setNodes, layerLookup, traced, presentOrStill]);

  useEffect(() => {
    // Belt-and-suspenders per React Flow's own docs: nodes with a fixed custom handle set
    // should force a remeasure so edges resolve their endpoints reliably. Deliberately
    // depends on `diagram` (only changes when the store actually commits a mutation) rather
    // than the live `nodes` state (which React Flow also rewrites on every intermediate
    // pointermove frame while dragging) — remeasuring handle bounds does real layout work
    // (getBoundingClientRect per node), and handles move for free via the drag transform, so
    // doing this on every drag frame at a few hundred nodes was a real 60fps risk for no
    // benefit: nothing about a node's handle geometry changes just because its position did.
    const ids = diagram.nodes.map((n) => n.id);
    if (ids.length > 0) updateNodeInternals(ids);
  }, [diagram, updateNodeInternals]);

  useEffect(() => {
    const visibleEdges = diagram.edges.filter((e) => layerLookup.get(getLayerId(e, diagram))?.visible ?? true);
    setEdges(
      visibleEdges.map((e) =>
        toFlowEdge(e, selectedEdgeIds.includes(e.id), layerLookup.get(getLayerId(e, diagram))?.locked ?? false, traced, presentOrStill),
      ),
    );
  }, [diagram, selectedEdgeIds, setEdges, layerLookup, traced, presentOrStill]);

  // Trace input (D117): in the viewer a click on a shape traces it — the viewer selects nothing,
  // so a click is free for it; in the editor a click selects, and Trace is the context bar's and
  // the palette's. A click on empty canvas stops tracing in either.
  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: FlowNode) => {
      if (!useDocStore.getState().ui.viewerMode || node.type === "point") return;
      useDocStore.getState().setTrace([node.id]);
    },
    [],
  );
  const onPaneClick = useCallback(() => {
    if (useDocStore.getState().trace) useDocStore.getState().setTrace(null);
  }, []);

  const onInit: OnInit<FlowNode, FlowDiagramEdge> = useCallback((instance) => {
    setCanvasInstance(instance);
    // The canvas is up: a returning visitor's startup screen goes now (N3). After the frame it
    // paints in, so the screen never lifts off an empty page.
    requestAnimationFrame(() => splashCanvasReady());
    // A share link with Draw in set draws its lines once (A5, D121).
    maybeDrawIn();
    if (import.meta.env.DEV) {
      // Dev-only console/debugging hook — never included in production builds.
      (window as unknown as { __rf: unknown }).__rf = instance;
    }
  }, []);
  useEffect(() => () => setCanvasInstance(null), []);

  // React Flow itself sometimes fires onSelectionChange with a spuriously empty selection
  // immediately before the real one for the same gesture — confirmed directly by instrumenting
  // this callback live (an empty call ~10ms ahead of the real one during a box-select).
  // Committing that empty call as-is briefly clears the selection every gesture (a one-frame
  // flash of "nothing selected," perceived as jitter) and opens a window where a *later*,
  // legitimate click's own selection can race with it. Only empty calls are held back briefly
  // (and dropped if a real one supersedes them almost immediately after) — every non-empty
  // selection change still commits synchronously, exactly as before, so click-driven UI that
  // depends on selection updating immediately (e.g. double-click-to-edit) is unaffected.
  const pendingClearRef = useRef<number | null>(null);
  /** True between the start and end of a drag-selection; see the node effect for why. */
  const boxSelectingRef = useRef(false);
  useEffect(() => {
    return () => {
      if (pendingClearRef.current !== null) window.clearTimeout(pendingClearRef.current);
    };
  }, []);
  const onSelectionChange: OnSelectionChangeFunc = useCallback(
    ({ nodes: selectedNodes, edges: selectedEdges }) => {
      // A line's invisible end anchors are never selected themselves: a rubber band that caught
      // every free end of a line selects that line instead (PointNode.tsx).
      const caught = new Set(selectedNodes.filter((n) => isPointNodeId(n.id)).map((n) => n.id));
      const nodeIds = selectedNodes.filter((n) => !isPointNodeId(n.id)).map((n) => n.id);
      const edgeIds = selectedEdges.map((e) => e.id);
      const chosenNodes = new Set(nodeIds);
      for (const id of new Set([...caught].map(edgeIdOfPointNode))) {
        const line = useDocStore.getState().doc.diagrams[useDocStore.getState().currentDiagramId()]?.edges.find((e) => e.id === id);
        if (!line || edgeIds.includes(id)) continue;
        const inside = (end: "source" | "target") =>
          line[end].nodeId ? chosenNodes.has(line[end].nodeId!) : caught.has(pointNodeId(id, end));
        if (inside("source") && inside("target")) edgeIds.push(id);
      }
      const commit = () => {
        const current = useDocStore.getState().selection;
        const same =
          nodeIds.length === current.nodeIds.length &&
          nodeIds.every((id, i) => id === current.nodeIds[i]) &&
          edgeIds.length === current.edgeIds.length &&
          edgeIds.every((id, i) => id === current.edgeIds[i]);
        if (same) return;
        setSelection(nodeIds, edgeIds);
      };

      if (nodeIds.length === 0 && edgeIds.length === 0) {
        if (pendingClearRef.current !== null) window.clearTimeout(pendingClearRef.current);
        const asScheduled = useDocStore.getState().selection;
        pendingClearRef.current = window.setTimeout(() => {
          pendingClearRef.current = null;
          // A stale empty report must not undo a selection made since: placing a line adds its
          // end anchors (nodes) a moment before the line (an edge), and React Flow reports an
          // empty selection in between — clearing on it deselected the line just drawn. So clear
          // only if the selection is unchanged since and nothing is in fact selected now.
          if (useDocStore.getState().selection !== asScheduled) return;
          if (getEdges().some((e) => e.selected) || getNodes().some((n) => n.selected && !isPointNodeId(n.id))) return;
          commit();
        }, 32);
        return;
      }

      if (pendingClearRef.current !== null) {
        window.clearTimeout(pendingClearRef.current);
        pendingClearRef.current = null;
      }
      commit();
    },
    [setSelection, getEdges, getNodes],
  );

  /**
   * What React Flow actually has selected, committed at the end of a box-select.
   *
   * During a drag React Flow can report a selection that still holds the *previous* one as well as
   * the new — seen directly by logging both sides: at the end of a second box the canvas had three
   * nodes selected and this store had all six, including one that was never inside either box. No
   * further report arrives to correct it, so the two stay apart, every later box adds to the pile,
   * and once everything is selected React Flow's own multi-selection overlay covers the canvas and
   * swallows the clicks that would clear it — the editor looks frozen until a reload.
   *
   * So the gesture's end re-reads the canvas and commits that, rather than trusting the last
   * report. This runs after any drag-selection, costs one pass over the nodes, and is the only
   * thing that can tell the two apart.
   */
  /**
   * A new box-select starts from nothing, unless the author is adding to what they have.
   *
   * Without this the previous selection is still in hand when the box begins, and the new one is
   * laid on top of it: drag a box over two shapes, then another over three elsewhere, and all five
   * end up selected — then eight, then everything. Clearing first is what makes a box replace
   * rather than accumulate, which is what every other tool does and what the author expects.
   * Shift is React Flow's own multi-selection key, so holding it still adds.
   */
  const startSelectionBox = useCallback(
    (event: React.MouseEvent) => {
      boxSelectingRef.current = true;
      if (event.shiftKey) return;
      // React Flow's own selection is cleared directly rather than by letting our store's change
      // reach it through a render: a render is a frame away, and the box is computed before that
      // frame lands, which left the old selection in the new box about one drag in six.
      flowStore.getState().unselectNodesAndEdges();
      useDocStore.getState().clearSelection();
    },
    [flowStore],
  );

  const reconcileSelection = useCallback(() => {
    boxSelectingRef.current = false;
    onSelectionChange({
      nodes: getNodes().filter((n) => n.selected),
      edges: getEdges().filter((e) => e.selected),
    });
  }, [onSelectionChange, getNodes, getEdges]);

  const onConnect: OnConnect = useCallback(
    (connection: Connection) => {
      if (!connection.sourceHandle || !connection.targetHandle) return;
      connect({
        sourceNodeId: connection.source,
        sourceHandleId: connection.sourceHandle,
        targetNodeId: connection.target,
        targetHandleId: connection.targetHandle,
      });
    },
    [connect],
  );

  // A connection let go short of a handle attaches to the shape it was dropped on, anywhere
  // on that shape, and is left as a free line when dropped on open canvas; both
  // used to be silently discarded here. (Dragging an existing edge's ends is DiagramEdge's own
  // endpoint handles, which do the same for a line already drawn.)
  const onConnectEnd = useCallback(
    (event: MouseEvent | TouchEvent, state: FinalConnectionState<InternalNode>) => {
      if (state.isValid || !state.fromNode || !state.fromHandle?.id || !state.from) return;
      const touch = "changedTouches" in event ? event.changedTouches[0] : undefined;
      const client = touch ? { x: touch.clientX, y: touch.clientY } : { x: (event as MouseEvent).clientX, y: (event as MouseEvent).clientY };
      const flow = screenToFlowPosition(client);
      // A click on a handle, not a drag from it, is not a line.
      if (Math.hypot(flow.x - state.from.x, flow.y - state.from.y) < 12) return;
      const fromId = state.fromNode.id;
      const store = useDocStore.getState();
      const target = dropTargetAt(client, flow, diagram.nodes, fromId);
      if (target) {
        connect({ sourceNodeId: fromId, sourceHandleId: state.fromHandle.id, targetNodeId: target.nodeId, targetHandleId: target.handleId });
        return;
      }
      const snap = store.ui.snapEnabled;
      const point = snap ? { x: Math.round(flow.x / GRID_SIZE) * GRID_SIZE, y: Math.round(flow.y / GRID_SIZE) * GRID_SIZE } : flow;
      store.connectToPoint(fromId, state.fromHandle.id, point);
    },
    [connect, diagram, screenToFlowPosition],
  );

  const [guides, setGuides] = useState<{ verticalX?: number; horizontalY?: number }>({});
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; target: ContextMenuTarget } | null>(null);

  const onNodeContextMenu: NodeMouseHandler<FlowNode> = useCallback((event, node) => {
    if (useDocStore.getState().ui.viewerMode) return;
    event.preventDefault();
    const currentSelection = useDocStore.getState().selection.nodeIds;
    if (!currentSelection.includes(node.id)) {
      useDocStore.getState().setSelection([node.id]);
    }
    setContextMenu({ x: event.clientX, y: event.clientY, target: "node" });
  }, []);

  // With two or more nodes selected React Flow covers them with its own `nodesselection`
  // overlay, which swallows the right-click before it can reach any node — so onNodeContextMenu
  // never fired and the menu simply didn't open on a multi-selection. This is React Flow's
  // dedicated hook for that case; the selection is already what the user wants to act on, so
  // unlike the single-node handler it deliberately doesn't touch it.
  const onSelectionContextMenu = useCallback((event: React.MouseEvent) => {
    if (useDocStore.getState().ui.viewerMode) return;
    event.preventDefault();
    setContextMenu({ x: event.clientX, y: event.clientY, target: "node" });
  }, []);

  const onEdgeContextMenu: EdgeMouseHandler<FlowDiagramEdge> = useCallback((event, edge) => {
    if (useDocStore.getState().ui.viewerMode) return;
    event.preventDefault();
    const currentSelection = useDocStore.getState().selection.edgeIds;
    if (!currentSelection.includes(edge.id)) {
      useDocStore.getState().setSelection([], [edge.id]);
    }
    setContextMenu({ x: event.clientX, y: event.clientY, target: "edge" });
  }, []);

  const onPaneContextMenu = useCallback((event: React.MouseEvent | MouseEvent) => {
    if (useDocStore.getState().ui.viewerMode) return;
    event.preventDefault();
    const { clientX, clientY } = event as MouseEvent;
    setContextMenu({ x: clientX, y: clientY, target: "canvas" });
  }, []);

  const onNodeDragStart: OnNodeDrag<FlowNode> = useCallback(
    (_event, node) => {
      useDocStore.getState().setCanvasGesture(true);
      const selection = useDocStore.getState().selection.nodeIds;
      bringToFront(selection.includes(node.id) ? selection : [node.id]);
    },
    [bringToFront],
  );

  // Smart guides only apply to single-node drags — the common case, and it keeps the snap
  // math (and what "align to" means) unambiguous. A grouped child's node.position is
  // parent-relative (React Flow convention), not the absolute coordinates `others` and the
  // snap math below use, so guides are skipped for it rather than comparing mismatched
  // coordinate spaces.
  const onNodeDrag: OnNodeDrag<FlowNode> = useCallback(
    (_event, node, draggedNodes) => {
      if (draggedNodes.length !== 1) {
        setGuides({});
        return;
      }
      // A group is one rigid unit: dragging a single member moves the whole group (frame +
      // every sibling) together, not just that member. React Flow is already dragging `node`
      // itself smoothly and unclamped (no extent on grouped children — see toFlowNode); the
      // dragged node's own position is *never* touched here — overwriting it mid-gesture
      // previously fought React Flow's own internal drag tracking for that node, causing
      // jitter and an apparent movement cap. Instead, only the *siblings* (and, at drop time,
      // the frame) are shifted by the same delta, computed fresh from `diagram` (the stable,
      // untouched-mid-drag model) each frame so there's no incremental drift.
      const groupDrag = resolveGroupDragDelta(diagram, node, draggedNodes);
      if (groupDrag) {
        const { frame, dx, dy } = groupDrag;
        const originalPositions = new Map(diagram.nodes.map((n) => [n.id, n.position]));
        setNodes((prev) =>
          prev.map((n) => {
            if (n.id === node.id || !frame.childIds.includes(n.id)) return n;
            const orig = originalPositions.get(n.id);
            if (!orig) return n;
            return { ...n, position: { x: orig.x - frame.position.x + dx, y: orig.y - frame.position.y + dy } };
          }),
        );
        setGuides({});
        return;
      }
      if (node.parentId) {
        setGuides({});
        return;
      }
      const others = diagram.nodes.filter((n) => n.id !== node.id).map((n) => ({ x: n.position.x, y: n.position.y, w: n.size.w, h: n.size.h }));
      const dragged = { x: node.position.x, y: node.position.y, w: node.width ?? 0, h: node.height ?? 0 };
      const { dx, dy, verticalGuideX, horizontalGuideY } = computeSnap(dragged, others);
      setGuides({ verticalX: verticalGuideX, horizontalY: horizontalGuideY });
      if (dx !== 0 || dy !== 0) {
        setNodes((prev) =>
          prev.map((n) => (n.id === node.id ? { ...n, position: { x: n.position.x + dx, y: n.position.y + dy } } : n)),
        );
      }
    },
    [diagram, setNodes],
  );

  // A dragged child's node.position is parent-relative (React Flow convention); convert back
  // to the model's absolute coordinates using the parent group's last-known absolute
  // position. Dragging the group frame itself only reports the group in draggedNodes — its
  // children's stored (absolute) positions never changed, so the same delta the group moved
  // by is applied to each child here to keep them visually attached. Dragging a single member
  // of a group is treated the same way: the member's own relative-position delta (vs. its
  // pre-drag position in `diagram`) is the group's move delta, applied to the frame and every
  // child in one commit.
  const onNodeDragStop: OnNodeDrag<FlowNode> = useCallback(
    (_event, node, draggedNodes) => {
      setGuides({});
      useDocStore.getState().setCanvasGesture(false);
      const nodeById = new Map(diagram.nodes.map((n) => [n.id, n]));
      const updates: NodePatch[] = [];

      const groupDrag = resolveGroupDragDelta(diagram, node, draggedNodes);
      if (groupDrag) {
        const { frame, dx, dy } = groupDrag;
        updates.push({ id: frame.id, patch: { position: { x: frame.position.x + dx, y: frame.position.y + dy } } });
        for (const childId of frame.childIds) {
          const child = nodeById.get(childId);
          if (!child) continue;
          updates.push({ id: childId, patch: { position: { x: child.position.x + dx, y: child.position.y + dy } } });
        }
        moveOrResizeNodes(updates);
        return;
      }

      for (const dragged of draggedNodes) {
        const modelNode = nodeById.get(dragged.id);
        if (!modelNode) continue;
        if (dragged.parentId) {
          const parent = nodeById.get(dragged.parentId);
          if (!parent) continue;
          updates.push({
            id: dragged.id,
            patch: { position: { x: parent.position.x + dragged.position.x, y: parent.position.y + dragged.position.y } },
          });
        } else {
          updates.push({ id: dragged.id, patch: { position: dragged.position } });
          if (modelNode.type === "group") {
            const dx = dragged.position.x - modelNode.position.x;
            const dy = dragged.position.y - modelNode.position.y;
            for (const childId of modelNode.childIds) {
              const child = nodeById.get(childId);
              if (!child) continue;
              updates.push({ id: childId, patch: { position: { x: child.position.x + dx, y: child.position.y + dy } } });
            }
          }
        }
      }
      moveOrResizeNodes(updates);
    },
    [diagram, moveOrResizeNodes],
  );

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      if (useDocStore.getState().ui.viewerMode) return;
      event.preventDefault();
      const raw = event.dataTransfer.getData(STENCIL_MIME);
      if (!raw) return;
      const payload = JSON.parse(raw) as {
        id: string;
        w: number;
        h: number;
        kind?: "shape" | "nested" | "scratchpad";
        item?: ScratchpadItem;
      };
      const point = screenToFlowPosition({ x: event.clientX, y: event.clientY });
      const position = { x: point.x - payload.w / 2, y: point.y - payload.h / 2 };
      // A library shape joins Recently used (R4, D93); a Favorite is already one click away.
      if (payload.kind !== "scratchpad") recordShapeUse(payload.id);
      if (payload.kind === "nested") {
        useDocStore.getState().addNestedNode(position, { w: payload.w, h: payload.h });
        return;
      }

      const newNodeId =
        payload.kind === "scratchpad" && payload.item
          ? useDocStore.getState().addShapeNodeFromScratchpad(payload.item, position)
          : useDocStore.getState().addShapeNode(payload.id, position, { w: payload.w, h: payload.h });

      // Dropping a new shape onto an existing nested-diagram box groups it with that box (a
      // real Group, same one Ctrl+G produces), so dragging the box later moves the shape with
      // it — reuses the existing group mechanism rather than inventing a new attached-icon
      // concept.
      const droppedBox = { x: position.x, y: position.y, w: payload.w, h: payload.h };
      const targetNested = findNestedNodeUnderDrop(diagram, droppedBox);
      // A line from the Lines section is an edge, not a shape to group with the box.
      const placedLine = useDocStore.getState().selection.edgeIds.includes(newNodeId);
      if (targetNested && !placedLine) {
        useDocStore.getState().setSelection([targetNested.id, newNodeId]);
        useDocStore.getState().groupSelection();
      }
    },
    [diagram, screenToFlowPosition],
  );

  const snapGrid = useMemo((): [number, number] => [GRID_SIZE, GRID_SIZE], []);

  return (
    <div className={present.lit ? `${styles.wrapper} nd-spotlight` : styles.wrapper} data-testid="nd-canvas" onDrop={onDrop} onDragOver={onDragOver}>
      <ReactFlow<FlowNode, FlowDiagramEdge>
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onConnectEnd={onConnectEnd}
        nodesDraggable={!viewerMode}
        nodesConnectable={!viewerMode}
        // Ends are moved with DiagramEdge's own endpoint handles, which can also leave an end
        // free on open canvas — React Flow's reconnect can only move it to another handle.
        edgesReconnectable={false}
        // Selection is switched off rather than merely made harmless: selection handles,
        // resizers and the selection toolbar all key off it, and a reader who cannot change
        // anything has no use for any of them. Buttons rendered inside a node (the nested
        // box's ⤢) are ordinary DOM and keep working.
        elementsSelectable={!viewerMode}
        onError={(code, msg) => console.error(`[React Flow ${code}]`, msg)}
        connectionMode={ConnectionMode.Loose}
        isValidConnection={(c) => c.source !== c.target}
        onSelectionChange={onSelectionChange}
        onNodeClick={onNodeClick}
        onPaneClick={onPaneClick}
        onNodeDragStart={onNodeDragStart}
        onNodeDrag={onNodeDrag}
        onNodeDragStop={onNodeDragStop}
        onNodeContextMenu={onNodeContextMenu}
        onSelectionContextMenu={onSelectionContextMenu}
        onEdgeContextMenu={onEdgeContextMenu}
        onPaneContextMenu={onPaneContextMenu}
        onInit={onInit}
        minZoom={MIN_ZOOM}
        maxZoom={MAX_ZOOM}
        // Dragging the empty canvas rubber-band-selects in the editor; with nothing to select
        // it should pan instead, which is what a reader expects from a picture.
        panOnDrag={viewerMode ? true : panOnDrag}
        panOnScroll
        zoomOnScroll={false}
        zoomOnPinch
        selectionOnDrag={!viewerMode}
        onSelectionStart={startSelectionBox}
        onSelectionEnd={reconcileSelection}
        snapToGrid={snapEnabled}
        snapGrid={snapGrid}
        deleteKeyCode={null}
        multiSelectionKeyCode="Shift"
        onlyRenderVisibleElements
        proOptions={{ hideAttribution: true }}
        style={diagram.background ? { background: diagram.background } : undefined}
      >
        {diagram.pageSize && <PageBoundaries diagram={diagram} pageSize={diagram.pageSize} />}
        {gridEnabled && (
          <Background variant={BackgroundVariant.Dots} gap={GRID_SIZE} size={1.5} color="var(--nd-color-grid-dot)" />
        )}
        <ArrowheadDefs />
        {minimapOpen && (
          <MiniMap
            position="top-left"
            nodeColor={minimapNodeColor}
            nodeStrokeWidth={0}
            maskColor="rgba(30, 39, 51, 0.08)"
            pannable
            zoomable
            data-testid="nd-minimap"
          />
        )}
        <ZoomControls />
        <TraceHint />
        <PreviewHint />
        {walkOrder && <WalkthroughDot diagram={diagram} order={walkOrder} />}
        <AlignmentGuides verticalX={guides.verticalX} horizontalY={guides.horizontalY} />
        <ContextBar />
        <ZoomVariable />
        <CanvasChip />
        <NoteCard />
        <GhostLinks />
      </ReactFlow>
      {contextMenu && (
        <ContextMenu
          target={contextMenu.target}
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  );
}

export function DiagramCanvas() {
  return (
    <ReactFlowProvider>
      <DiagramCanvasInner />
    </ReactFlowProvider>
  );
}
