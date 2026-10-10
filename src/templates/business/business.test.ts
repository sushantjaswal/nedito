// What only these templates can get wrong.
//
// The catalogue test already checks every document validates, every shapeRef resolves and every
// port is mapped. These diagrams are read by their *layout* more than by their shapes — a
// swimlane step in the wrong lane says the wrong role owns it, a SWOT quadrant in the wrong
// corner inverts its meaning — so the assertions here are mostly geometric.
import { describe, expect, it } from "vitest";
import type { DNode, DiagramDocument, NestedNode } from "../../model/types";
import bpmnBasic from "./bpmnBasic";
import businessModelCanvas from "./businessModelCanvas";
import customerJourney from "./customerJourney";
import fishbone from "./fishbone";
import milestoneTimeline from "./milestoneTimeline";
import orgChart from "./orgChart";
import swimlane from "./swimlane";
import swot from "./swot";

const ALL: [string, DiagramDocument][] = [
  ["org-chart", orgChart],
  ["swimlane-process", swimlane],
  ["bpmn-basic", bpmnBasic],
  ["fishbone", fishbone],
  ["swot", swot],
  ["business-model-canvas", businessModelCanvas],
  ["customer-journey", customerJourney],
  ["milestone-timeline", milestoneTimeline],
];

const nodesOf = (doc: DiagramDocument) => Object.values(doc.diagrams).flatMap((d) => d.nodes);
const edgesOf = (doc: DiagramDocument) => Object.values(doc.diagrams).flatMap((d) => d.edges);
const find = (doc: DiagramDocument, prefix: string) => nodesOf(doc).find((n) => n.id.startsWith(prefix))!;
const centreY = (n: DNode) => n.position.y + n.size.h / 2;
const inside = (outer: DNode, inner: DNode) =>
  inner.position.x >= outer.position.x &&
  inner.position.y >= outer.position.y &&
  inner.position.x + inner.size.w <= outer.position.x + outer.size.w &&
  inner.position.y + inner.size.h <= outer.position.y + outer.size.h;

describe("the Business & Process templates", () => {
  it.each(ALL)("%s names both ends of every link", (_id, doc) => {
    for (const edge of edgesOf(doc)) {
      if (edge.source.portId || edge.target.portId) continue;
      expect(edge.style.sourceHandle, `${edge.id} has an unanchored source`).toBeTruthy();
      expect(edge.style.targetHandle, `${edge.id} has an unanchored target`).toBeTruthy();
    }
  });

  // A lane is an unfilled body beside a narrow name band (see swimlane.ts for why the band is
  // its own shape). Lane bodies: ids "sl<n>" in the swimlane, "pPool"/"pLane<n>" in BPMN.
  const laneBodies = (doc: DiagramDocument) =>
    nodesOf(doc).filter((n) => n.type === "shape" && /^(sl\d_|pPool_|pLane\d_)/.test(n.id));
  const nameBands = (doc: DiagramDocument) => nodesOf(doc).filter((n) => n.type === "shape" && n.style.horizontal === false);

  // Same reason as the cloud boundaries: React Flow draws nodes above
  // the edge layer, so a filled container hides the links running through it.
  it.each([
    ["swimlane-process", swimlane],
    ["bpmn-basic", bpmnBasic],
  ])("%s leaves its lanes unfilled so the flow shows through", (_id, doc) => {
    const lanes = laneBodies(doc);
    expect(lanes.length).toBeGreaterThan(1);
    for (const n of lanes) expect(n.style.fill, `${n.id} would hide the steps inside it`).toBe("none");
  });

  // A lane's name goes in its left-hand band, reading bottom to top. Across the lane's middle it
  // lands on top of the first task — which is exactly what happened before `align` worked.
  it.each([
    ["swimlane-process", swimlane],
    ["bpmn-basic", bpmnBasic],
  ])("%s writes each lane's name into its band, not across its middle", (_id, doc) => {
    const lanes = laneBodies(doc);
    const bands = nameBands(doc);
    expect(bands.length).toBeGreaterThan(1);
    for (const band of bands) {
      expect(band.label?.text.trim(), `${band.id} names nothing`).toBeTruthy();
      expect(band.size.w, `${band.id} is not a narrow band`).toBeLessThanOrEqual(48);
      // Each band sits flush against the left of a lane body (or of the pool's lanes).
      const beside = lanes.some((l) => Math.abs(l.position.y - band.position.y) < 1 && l.position.x >= band.position.x + band.size.w - 1);
      expect(beside, `${band.id} is not at the head of a lane`).toBe(true);
    }
  });

  it("puts every swimlane step squarely inside exactly one lane", () => {
    const lanes = laneBodies(swimlane);
    const steps = nodesOf(swimlane).filter((n) => n.type === "shape" && n.shapeRef === "general/rounded-rect");
    expect(steps.length).toBeGreaterThan(5);
    for (const step of steps) {
      const owning = lanes.filter((l) => inside(l, step));
      // Which lane a step sits in *is* the claim a swimlane diagram makes about who owns it.
      expect(owning, `${step.id} is not cleanly in one lane`).toHaveLength(1);
    }
  });

  it("labels both branches out of the BPMN gateway", () => {
    const gate = find(bpmnBasic, "pGate");
    const out = edgesOf(bpmnBasic).filter((e) => e.source.nodeId === gate.id);
    expect(out.length).toBeGreaterThan(1);
    // An unlabelled gateway is the commonest way a BPMN diagram stops being readable.
    for (const e of out) expect(e.label?.text.trim(), `${e.id} leaves the gateway unlabelled`).toBeTruthy();
  });

  it("keeps SWOT's quadrants in their published corners", () => {
    const s = find(swot, "wS");
    const w = find(swot, "wW");
    const o = find(swot, "wO");
    const t = find(swot, "wT");
    // Top row internal, bottom row external; left column helpful, right column harmful.
    expect(s.position.x).toBeLessThan(w.position.x);
    expect(o.position.x).toBeLessThan(t.position.x);
    expect(s.position.y).toBeLessThan(o.position.y);
    expect(w.position.y).toBeLessThan(t.position.y);
  });

  it("lays the canvas out in its published order, money along the bottom", () => {
    const order = ["mPartners", "mActivities", "mValue", "mRelations", "mSegments"].map((p) => find(businessModelCanvas, p));
    for (let i = 1; i < order.length; i++) {
      expect(order[i].position.x).toBeGreaterThan(order[i - 1].position.x);
    }
    const costs = find(businessModelCanvas, "mCosts");
    const revenue = find(businessModelCanvas, "mRevenue");
    for (const block of order) {
      expect(costs.position.y).toBeGreaterThan(block.position.y);
      expect(revenue.position.y).toBeGreaterThan(block.position.y);
    }
  });

  it("runs the journey map left to right, one column per stage", () => {
    const stages = nodesOf(customerJourney).filter((n) => n.id.startsWith("jStage"));
    const actions = nodesOf(customerJourney).filter((n) => n.id.startsWith("jAct"));
    expect(stages).toHaveLength(actions.length);
    for (let i = 1; i < stages.length; i++) expect(stages[i].position.x).toBeGreaterThan(stages[i - 1].position.x);
    // Each column's cells share an x, so a stage reads down as one story.
    for (let i = 0; i < stages.length; i++) expect(actions[i].position.x).toBe(stages[i].position.x);
  });

  it("spaces the timeline evenly, because it is explicitly not to scale", () => {
    const dots = nodesOf(milestoneTimeline)
      .filter((n) => n.id.startsWith("tDot"))
      .sort((a, b) => a.position.x - b.position.x);
    expect(dots.length).toBeGreaterThan(3);
    const gaps = dots.slice(1).map((d, i) => d.position.x - dots[i].position.x);
    // Uneven spacing would imply a time axis the model cannot actually honour.
    expect(new Set(gaps).size).toBe(1);
  });

  it("alternates timeline milestones above and below the line so labels have room", () => {
    const boxes = nodesOf(milestoneTimeline)
      .filter((n) => n.id.startsWith("tBox"))
      .sort((a, b) => a.position.x - b.position.x);
    const axis = find(milestoneTimeline, "tAxis");
    const sides = boxes.map((b) => centreY(b) < centreY(axis));
    for (let i = 1; i < sides.length; i++) expect(sides[i]).not.toBe(sides[i - 1]);
  });

  it("angles every fishbone rib into the spine rather than dropping it straight down", () => {
    const byId = new Map(nodesOf(fishbone).map((n) => [n.id, n]));
    const ribs = edgesOf(fishbone).filter((e) => e.id.includes("Rib"));
    expect(ribs.length).toBeGreaterThan(3);
    for (const rib of ribs) {
      const from = byId.get(rib.source.nodeId!)!;
      const to = byId.get(rib.target.nodeId!)!;
      const dx = Math.abs(from.position.x + from.size.w / 2 - (to.position.x + to.size.w / 2));
      // A vertical rib reads as a separate column, not as a cause feeding the spine.
      expect(dx, `${rib.id} is vertical`).toBeGreaterThan(20);
    }
  });

  it("opens each org-chart department onto its own team, through a mapped port", () => {
    const root = orgChart.diagrams[orgChart.rootDiagramIds[0]];
    const depts = root.nodes.filter((n): n is NestedNode => n.type === "nested");
    expect(depts).toHaveLength(3);
    for (const dept of depts) {
      const child = orgChart.diagrams[dept.childDiagramId];
      expect(child).toBeDefined();
      expect(child.nodes.length).toBeGreaterThan(2);
      for (const port of dept.ports) {
        // The port maps to that department's own lead, not to another department's.
        expect(child.nodes.some((n) => n.id === port.innerNodeId), `${port.id} points outside its child`).toBe(true);
      }
    }
  });
});
