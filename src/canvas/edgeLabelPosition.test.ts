// Draggable edge labels: the geometry, the model, the store and the export.
import { beforeEach, describe, expect, it } from "vitest";
import { cacheStencils } from "../library/stencils";
import generalSection from "../library/stencils/general";
import { decodeDoc, encodeDoc } from "../file/documentFormat";
import { diagramToSvg } from "../file/svgExport";
import { createEmptyDoc, useDocStore } from "../model/store";
import { validateDoc } from "../model/validate";
import type { DiagramDocument } from "../model/types";
import { nearestOnPath, pathMidpoint, pathPointAt } from "./edgeGeometry";
import { labelPositionAt, SNAP_TO_LINE } from "./edgeLabelPosition";
import { buildEdgePath } from "./edgeRouting";
import { Position } from "@xyflow/react";

const STRAIGHT = "M0,0 L100,0 L100,100"; // 200 long: along the top, then down

describe("geometry along a path", () => {
  it("finds the point a fraction of the way along it, by length", () => {
    expect(pathPointAt(STRAIGHT, 0)).toEqual({ x: 0, y: 0 });
    expect(pathPointAt(STRAIGHT, 0.25)).toEqual({ x: 50, y: 0 });
    expect(pathPointAt(STRAIGHT, 0.75)).toEqual({ x: 100, y: 50 });
    expect(pathPointAt(STRAIGHT, 1)).toEqual({ x: 100, y: 100 });
    // The middle is exactly what it always was, so a label never moved draws where it did.
    expect(pathPointAt(STRAIGHT, 0.5)).toEqual(pathMidpoint(STRAIGHT));
  });

  it("finds the nearest point on it, and how far along that is", () => {
    expect(nearestOnPath(STRAIGHT, { x: 30, y: -20 })).toEqual({ t: 0.15, point: { x: 30, y: 0 } });
    expect(nearestOnPath(STRAIGHT, { x: 140, y: 80 })).toEqual({ t: 0.9, point: { x: 100, y: 80 } });
  });
});

describe("where a dragged label is kept", () => {
  it("records how far along the line it is and its offset from it", () => {
    expect(labelPositionAt(STRAIGHT, { x: 50, y: 40 })).toEqual({ t: 0.25, dx: 0, dy: 40 });
  });

  it(`sits on the line when dropped within ${SNAP_TO_LINE}px of it`, () => {
    expect(labelPositionAt(STRAIGHT, { x: 50, y: 4 })).toEqual({ t: 0.25, dx: 0, dy: 0 });
  });

  it("keeps the file tidy: a few decimals, no more", () => {
    const at = labelPositionAt(STRAIGHT, { x: 33.333333, y: 21.987654 });
    expect(at.t).toBe(0.1667);
    expect(at.dy).toBe(22);
  });
});

describe("buildEdgePath", () => {
  const input = {
    sourceX: 0,
    sourceY: 0,
    sourcePosition: Position.Right,
    targetX: 200,
    targetY: 0,
    targetPosition: Position.Left,
    waypoints: [],
    kind: "straight" as const,
  };

  it("draws the label at its kept spot, and still reports the line's own middle", () => {
    const plain = buildEdgePath(input);
    expect(plain.labelPos).toEqual(plain.midPos);
    const moved = buildEdgePath({ ...input, label: { t: 0.25, dx: 0, dy: 30 } });
    expect(moved.labelPos).toEqual({ x: 50, y: 30 });
    expect(moved.midPos).toEqual(plain.midPos);
    expect(moved.path).toBe(plain.path);
  });
});

// ---------------------------------------------------------------- the model

function docWithEdge(): { doc: DiagramDocument; edgeId: string } {
  const s = useDocStore.getState();
  s.loadDoc(createEmptyDoc());
  const a = s.addShapeNode("general/rect", { x: 0, y: 0 }, { w: 100, h: 60 });
  const b = useDocStore.getState().addShapeNode("general/rect", { x: 300, y: 0 }, { w: 100, h: 60 });
  const edgeId = useDocStore.getState().connect({ sourceNodeId: a, sourceHandleId: "right", targetNodeId: b, targetHandleId: "left" });
  useDocStore.getState().setEdgeLabel(edgeId, { text: "sends" });
  return { doc: useDocStore.getState().doc, edgeId };
}

const edgeOf = (id: string) => {
  const s = useDocStore.getState();
  return s.doc.diagrams[s.currentDiagramId()].edges.find((e) => e.id === id)!;
};

// Every test here starts editable: one of them switches the read-only viewer on.
beforeEach(() => useDocStore.setState((s) => ({ ui: { ...s.ui, viewerMode: false } })));

describe("the store", () => {
  it("moves a label as one undo step, and puts it back in the middle", () => {
    const { edgeId } = docWithEdge();
    useDocStore.temporal.getState().clear();
    useDocStore.getState().setEdgeLabelPosition([edgeId], { t: 0.3, dx: 0, dy: 20 });
    expect(edgeOf(edgeId).labelPosition).toEqual({ t: 0.3, dx: 0, dy: 20 });
    expect(useDocStore.temporal.getState().pastStates).toHaveLength(1);
    useDocStore.getState().setEdgeLabelPosition([edgeId], null);
    expect(edgeOf(edgeId)).not.toHaveProperty("labelPosition");
    useDocStore.temporal.getState().undo();
    expect(edgeOf(edgeId).labelPosition).toEqual({ t: 0.3, dx: 0, dy: 20 });
  });

  it("does nothing in the read-only viewer", () => {
    const { edgeId } = docWithEdge();
    useDocStore.setState((s) => ({ ui: { ...s.ui, viewerMode: true } }));
    useDocStore.getState().setEdgeLabelPosition([edgeId], { t: 0.3, dx: 0, dy: 20 });
    expect(edgeOf(edgeId)).not.toHaveProperty("labelPosition");
  });
});

describe("the file", () => {
  it("keeps a moved label through save and open, exactly", () => {
    const { edgeId } = docWithEdge();
    useDocStore.getState().setEdgeLabelPosition([edgeId], { t: 0.3, dx: -4.5, dy: 20 });
    const text = encodeDoc(useDocStore.getState().doc);
    expect(text).toContain('"labelPosition"');
    const back = decodeDoc(text);
    expect(back.ok && encodeDoc(back.doc)).toBe(text);
  });

  it("rejects a label position that is not a place", () => {
    const { doc, edgeId } = docWithEdge();
    const root = doc.rootDiagramIds[0];
    const bad: DiagramDocument = {
      ...doc,
      diagrams: { ...doc.diagrams, [root]: { ...doc.diagrams[root], edges: doc.diagrams[root].edges.map((e) => (e.id === edgeId ? { ...e, labelPosition: { t: 2, dx: 0, dy: 0 } } : e)) } },
    };
    expect(validateDoc(bad).some((e) => e.message.includes("label position"))).toBe(true);
  });

  it("is drawn where it was moved to in an export, as on the canvas", () => {
    cacheStencils(generalSection.shapes);
    const { edgeId } = docWithEdge();
    const s = useDocStore.getState();
    const middle = diagramToSvg(s.doc.diagrams[s.currentDiagramId()], { padding: 0 });
    s.setEdgeLabelPosition([edgeId], { t: 0.5, dx: 0, dy: 40 });
    const moved = diagramToSvg(useDocStore.getState().doc.diagrams[s.currentDiagramId()], { padding: 0 });
    const y = (svg: string) => Number(/<text x="[\d.-]+" y="([\d.-]+)"[^>]*>sends</.exec(svg)?.[1]);
    expect(y(moved) - y(middle)).toBeCloseTo(40, 0);
  });
});
