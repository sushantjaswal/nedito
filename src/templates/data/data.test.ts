// What only these templates can get wrong.
//
// The catalogue test already checks every template's document validates, that every shapeRef
// resolves, and that every port is mapped. What it cannot know is whether a *data* template is
// correct as data notation: whether the crow's-foot marks are ones the Style panel offers,
// whether the two DFD dialects stayed unmixed, and whether the two levels of a levelled DFD
// actually balance.
import { describe, expect, it } from "vitest";
import { ARROWHEAD_OPTIONS } from "../../canvas/arrowheads";
import type { DiagramDocument, NestedNode } from "../../model/types";
import dataPipeline from "./dataPipeline";
import dfdGaneSarson from "./dfdGaneSarson";
import dfdYourdon from "./dfdYourdon";
import erChen from "./erChen";
import erCrowsFoot from "./erCrowsFoot";

const ALL: [string, DiagramDocument][] = [
  ["er-chen", erChen],
  ["er-crows-foot", erCrowsFoot],
  ["dfd-yourdon", dfdYourdon],
  ["dfd-gane-sarson", dfdGaneSarson],
  ["data-pipeline", dataPipeline],
];

const nodesOf = (doc: DiagramDocument) => Object.values(doc.diagrams).flatMap((d) => d.nodes);
const edgesOf = (doc: DiagramDocument) => Object.values(doc.diagrams).flatMap((d) => d.edges);
const shapeRefs = (doc: DiagramDocument) => nodesOf(doc).flatMap((n) => (n.type === "shape" ? [n.shapeRef] : []));

describe("the Data templates", () => {
  it.each(ALL)("%s only uses line ends the Style panel offers", (_id, doc) => {
    // The same bar as the UML batch: a template must never use notation the user cannot draw
    // by hand. Crow's foot went into the Style panel before any of this was written.
    const offered = new Set(ARROWHEAD_OPTIONS.map((o) => o.id));
    for (const edge of edgesOf(doc)) {
      expect(offered).toContain(String(edge.style.startArrow ?? "none"));
      expect(offered).toContain(String(edge.style.endArrow ?? "none"));
    }
  });

  it.each(ALL)("%s labels every shape it draws", (_id, doc) => {
    for (const node of nodesOf(doc)) {
      if (node.type !== "shape") continue;
      expect(node.label?.text.trim(), `${node.id} has no label`).toBeTruthy();
    }
  });

  it("puts real crow's-foot cardinality on every relationship, not plain lines", () => {
    const marks = new Set(edgesOf(erCrowsFoot).flatMap((e) => [e.style.startArrow, e.style.endArrow]));
    // Reading one end should tell you both "how many" and "is it optional".
    expect(marks).toContain("er-one");
    expect([...marks].some((m) => String(m).includes("many"))).toBe(true);
    for (const edge of edgesOf(erCrowsFoot)) {
      expect(edge.style.startArrow, `${edge.id} has an unmarked source end`).not.toBe("none");
      expect(edge.style.endArrow, `${edge.id} has an unmarked target end`).not.toBe("none");
    }
  });

  it("writes Chen cardinality as a label, since that notation has no line ends", () => {
    const marked = edgesOf(erChen).filter((e) => e.style.startArrow !== "none" || e.style.endArrow !== "none");
    expect(marked).toHaveLength(0);
    const labels = edgesOf(erChen).flatMap((e) => (e.label ? [e.label.text] : []));
    expect(labels).toContain("1");
    expect(labels).toContain("N");
  });

  // Mixing the two DFD dialects is the classic tell of a diagram drawn by someone who read
  // neither book, and a shipped template doing it would teach the mistake.
  it("keeps the two DFD dialects unmixed", () => {
    const yourdon = shapeRefs(dfdYourdon).filter((r) => r.startsWith("dfd/"));
    const ganeSarson = shapeRefs(dfdGaneSarson).filter((r) => r.startsWith("dfd/"));
    expect(yourdon.length).toBeGreaterThan(0);
    expect(ganeSarson.length).toBeGreaterThan(0);
    for (const ref of yourdon) expect(ref.endsWith("-gs")).toBe(false);
    for (const ref of ganeSarson) expect(ref.endsWith("-gs")).toBe(true);
  });

  it("gives the two dialects disjoint ids, so applying both cannot collide", () => {
    const ids = (doc: DiagramDocument) => [
      ...Object.keys(doc.diagrams),
      ...nodesOf(doc).map((n) => n.id),
      ...edgesOf(doc).map((e) => e.id),
    ];
    const overlap = ids(dfdYourdon).filter((id) => ids(dfdGaneSarson).includes(id));
    expect(overlap).toEqual([]);
  });

  it.each([
    ["yourdon", dfdYourdon],
    ["gane-sarson", dfdGaneSarson],
  ])("%s levels the DFD as real nesting, and the two levels balance", (_name, doc) => {
    expect(doc.rootDiagramIds).toHaveLength(1);
    const context = doc.diagrams[doc.rootDiagramIds[0]];
    const system = context.nodes.find((n): n is NestedNode => n.type === "nested");
    expect(system, "the context process is a Nested Block").toBeDefined();

    const level1 = doc.diagrams[system!.childDiagramId];
    expect(level1).toBeDefined();
    expect(level1.nodes.length).toBeGreaterThan(1);

    // DFD balancing: every flow crossing the context boundary must reach a real Level 1
    // process, and every boundary flow must go through a port rather than at the box.
    const boundary = context.edges.filter((e) => e.source.nodeId === system!.id || e.target.nodeId === system!.id);
    expect(boundary.length).toBe(system!.ports.length);
    for (const edge of boundary) {
      const portId = edge.source.nodeId === system!.id ? edge.source.portId : edge.target.portId;
      expect(portId, `${edge.id} attaches to the block instead of a port`).toBeTruthy();
      const port = system!.ports.find((p) => p.id === portId);
      expect(port).toBeDefined();
      expect(level1.nodes.some((n) => n.id === port!.innerNodeId)).toBe(true);
    }
  });

  it("numbers the Level 1 processes, as a levelled DFD requires", () => {
    const level1 = Object.values(dfdYourdon.diagrams).find((d) => d.title === "Order System")!;
    const processes = level1.nodes.filter((n) => n.type === "shape" && n.shapeRef.startsWith("dfd/process"));
    expect(processes.length).toBeGreaterThan(2);
    // The number is its own text in the process's band, grouped with it so they move together.
    for (const p of processes) {
      const group = level1.nodes.find((n) => n.type === "group" && n.childIds.includes(p.id));
      expect(group, `${p.label?.text} is not grouped with its number`).toBeDefined();
      const number = level1.nodes.find((n) => n.id !== p.id && group!.type === "group" && group!.childIds.includes(n.id));
      expect(number?.label?.text).toMatch(/^\d+$/);
      expect(number!.position.y).toBeLessThan(p.position.y + p.size.h * 0.26);
    }
  });

  it("draws the pipeline left to right, so the flow reads in one direction", () => {
    const byId = new Map(nodesOf(dataPipeline).map((n) => [n.id, n]));
    for (const edge of edgesOf(dataPipeline)) {
      const from = byId.get(edge.source.nodeId!)!;
      const to = byId.get(edge.target.nodeId!)!;
      expect(to.position.x, `${edge.id} runs backwards`).toBeGreaterThanOrEqual(from.position.x);
    }
  });
});
