import { beforeEach, describe, expect, it } from "vitest";
import { cacheStencils, getStencil, loadSection, pickerShapes, resolveStencilId } from "./index";
import { ARROWHEADS } from "../../canvas/arrowheads";
import { useDocStore } from "../../model/store";
import { parseMxStyle, toShapeRef } from "../../file/drawio/mxStyle";

async function lines() {
  const section = (await loadSection("lines"))!;
  cacheStencils(section.shapes);
  return section;
}

describe("the Lines section", () => {
  beforeEach(() => {
    const s = useDocStore.getState();
    const rootId = s.doc.rootDiagramIds[0];
    useDocStore.setState({
      doc: { ...s.doc, rootDiagramIds: [rootId], diagrams: { [rootId]: { id: rootId, title: "Page 1", nodes: [], edges: [] } } },
      navStack: [rootId],
      selection: { nodeIds: [], edgeIds: [] },
    });
  });

  it("draws every line with the shared arrowhead vocabulary", async () => {
    const known = new Set(ARROWHEADS.map((a) => a.id));
    for (const shape of (await lines()).shapes) {
      for (const m of shape.svgBody.matchAll(/(?:start|end)="([^"]+)"/g)) {
        expect(known, `${shape.id} names an arrowhead the canvas cannot draw`).toContain(m[1]);
      }
      // A line is never filled: a closed elbow or curve would otherwise paint a white wedge.
      expect(shape.defaultFill, shape.id).toBe("none");
    }
  });

  it("offers no two lines that draw and dash identically", async () => {
    const seen = new Map<string, string>();
    for (const shape of pickerShapes(await lines())) {
      const key = `${shape.svgBody}|${shape.defaultStyle?.dash ?? ""}`;
      expect(seen.get(key), `${shape.id} duplicates ${seen.get(key)}`).toBeUndefined();
      seen.set(key, shape.id);
    }
  });

  // draw.io's sidebar lines are lines, not boxes with a line drawn in them: free at both ends,
  // ready to be bent or dropped onto a shape (D86).
  it("places a real line with free ends, not a box, styled as the entry shows", async () => {
    await lines();
    const id = useDocStore.getState().addShapeNode("lines/realization", { x: 100, y: 200 }, { w: 160, h: 40 });
    const s = useDocStore.getState();
    const diagram = s.doc.diagrams[s.currentDiagramId()];
    expect(diagram.nodes).toHaveLength(0);
    const edge = diagram.edges.find((e) => e.id === id)!;
    expect(edge.source).toEqual({ point: { x: 100, y: 220 } });
    expect(edge.target).toEqual({ point: { x: 260, y: 220 } });
    expect(edge.style).toMatchObject({ edgeStyle: "straight", dash: "dashed", endArrow: "triangle", startArrow: "none" });
    expect(s.selection.edgeIds).toEqual([id]);
  });

  it("scales a line to the size it is dropped at, bends included", async () => {
    await lines();
    const id = useDocStore.getState().addShapeNode("lines/arrow-curved", { x: 0, y: 0 }, { w: 320, h: 160 });
    const s = useDocStore.getState();
    const edge = s.doc.diagrams[s.currentDiagramId()].edges.find((e) => e.id === id)!;
    expect(edge.target.point).toEqual({ x: 320, y: 152 });
    expect(edge.waypoints).toEqual([{ x: 160, y: 12 }]);
  });

  it("gives every entry in the section a real line to place — none is a box", async () => {
    const section = await lines();
    expect(section.shapes.filter((s) => !s.line).map((s) => s.id)).toEqual([]);
  });

  it("keeps the old Advanced lines drawing under their old ids", async () => {
    await lines();
    expect(resolveStencilId("advanced/line-horizontal")).toBe("lines/line");
    expect(getStencil("advanced/line-vertical")).toBe(getStencil("lines/line-vertical"));
  });

  it("brings draw.io's line shape across as a line", () => {
    expect(toShapeRef(parseMxStyle("shape=line;html=1;"))).toMatchObject({ shapeRef: "lines/line", matched: true });
  });
});
