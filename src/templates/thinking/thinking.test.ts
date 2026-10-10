// What only these templates can get wrong.
//
// The catalogue test already checks every document validates and every shapeRef resolves. These
// diagrams have almost no notation, so what can go wrong is different: a Venn whose circles do
// not actually overlap, a concept map with a bare line where a verb should be, a decision tree
// with an unlabelled branch.
import { describe, expect, it } from "vitest";
import type { DNode, DiagramDocument } from "../../model/types";
import conceptMap from "./conceptMap";
import decisionTree from "./decisionTree";
import sitemap from "./sitemap";
import treeDiagram from "./treeDiagram";
import vennThree from "./vennThree";
import vennTwo from "./vennTwo";

const ALL: [string, DiagramDocument][] = [
  ["venn-two", vennTwo],
  ["venn-three", vennThree],
  ["tree-diagram", treeDiagram],
  ["decision-tree", decisionTree],
  ["concept-map", conceptMap],
  ["sitemap", sitemap],
];

const nodesOf = (doc: DiagramDocument) => Object.values(doc.diagrams).flatMap((d) => d.nodes);
const edgesOf = (doc: DiagramDocument) => Object.values(doc.diagrams).flatMap((d) => d.edges);
const ellipses = (doc: DiagramDocument) =>
  nodesOf(doc).filter((n) => n.type === "shape" && n.shapeRef === "general/ellipse");

/** Do two boxes overlap at all? Good enough for circles laid out on a grid. */
function overlaps(a: DNode, b: DNode): boolean {
  return (
    a.position.x < b.position.x + b.size.w &&
    b.position.x < a.position.x + a.size.w &&
    a.position.y < b.position.y + b.size.h &&
    b.position.y < a.position.y + a.size.h
  );
}

describe("the Thinking & Planning templates", () => {
  it.each(ALL)("%s names both ends of every link", (_id, doc) => {
    for (const edge of edgesOf(doc)) {
      expect(edge.style.sourceHandle, `${edge.id} has an unanchored source`).toBeTruthy();
      expect(edge.style.targetHandle, `${edge.id} has an unanchored target`).toBeTruthy();
    }
  });

  // A Venn drawn with whole-node opacity fades its own outlines and labels; fillOpacity is the
  // reason this batch touched the Style panel at all.
  it.each([
    ["venn-two", vennTwo, 2],
    ["venn-three", vennThree, 3],
  ])("%s gives each of its %i sets a translucent fill and a solid border", (_id, doc, count) => {
    const sets = ellipses(doc);
    expect(sets).toHaveLength(count as number);
    for (const s of sets) {
      expect(s.style.fillOpacity, `${s.id} is opaque, so the overlaps will not read`).toBeLessThan(1);
      expect(s.style.fillOpacity).toBeGreaterThan(0);
      // The border and the label stay solid — that is the whole point of fill-only opacity.
      expect(s.style.opacity, `${s.id} fades its own outline and text`).toBeUndefined();
      expect(Number(s.style.strokeWidth)).toBeGreaterThan(0);
    }
  });

  it("actually overlaps every pair of sets, or there are no regions to label", () => {
    for (const doc of [vennTwo, vennThree]) {
      const sets = ellipses(doc);
      for (let i = 0; i < sets.length; i++) {
        for (let j = i + 1; j < sets.length; j++) {
          expect(overlaps(sets[i], sets[j]), `${sets[i].id} and ${sets[j].id} do not meet`).toBe(true);
        }
      }
    }
  });

  // "Customer — places → Order" is a claim; an unlabelled line between them is not. This is the
  // one thing that distinguishes a concept map from a mind map.
  it("labels every link in the concept map with a verb", () => {
    const edges = edgesOf(conceptMap);
    expect(edges.length).toBeGreaterThan(5);
    for (const e of edges) expect(e.label?.text.trim(), `${e.id} is a bare line`).toBeTruthy();
  });

  it("labels every branch out of every decision in the decision tree", () => {
    const decisions = nodesOf(decisionTree).filter((n) => n.type === "shape" && n.shapeRef === "flowchart/decision");
    expect(decisions.length).toBeGreaterThan(1);
    for (const d of decisions) {
      const out = edgesOf(decisionTree).filter((e) => e.source.nodeId === d.id);
      expect(out.length, `${d.id} branches nowhere`).toBeGreaterThan(1);
      for (const e of out) expect(e.label?.text.trim(), `${e.id} leaves a decision unlabelled`).toBeTruthy();
    }
  });

  // A tree's direction is its layout, so heads on every branch just add noise.
  it.each([
    ["tree-diagram", treeDiagram],
    ["sitemap", sitemap],
  ])("%s draws its hierarchy without arrowheads", (_id, doc) => {
    for (const e of edgesOf(doc)) {
      expect(e.style.endArrow ?? "none").toBe("none");
      expect(e.style.startArrow ?? "none").toBe("none");
    }
  });

  it.each([
    ["tree-diagram", treeDiagram],
    ["sitemap", sitemap],
  ])("%s puts every child below its parent", (_id, doc) => {
    const byId = new Map(nodesOf(doc).map((n) => [n.id, n]));
    for (const e of edgesOf(doc)) {
      const parent = byId.get(e.source.nodeId!)!;
      const child = byId.get(e.target.nodeId!)!;
      // A hierarchy read top-down stops being readable the moment one branch goes up.
      expect(child.position.y, `${e.id} points upwards`).toBeGreaterThan(parent.position.y);
    }
  });

  it("gives every template a title or a labelled root, so it is not a page of bare boxes", () => {
    for (const [id, doc] of ALL) {
      const labelled = nodesOf(doc).filter((n) => n.label?.text.trim());
      expect(labelled.length, `${id} has nothing written on it`).toBeGreaterThan(3);
    }
  });
});
