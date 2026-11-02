import { describe, expect, it } from "vitest";
import { ARROWHEAD_OPTIONS } from "../../canvas/arrowheads";
import type { DiagramDocument, NestedNode } from "../../model/types";
import c4Model from "./c4Model";
import ciCdPipeline from "./ciCdPipeline";
import umlActivity from "./umlActivity";
import umlClass from "./umlClass";
import umlComponent from "./umlComponent";
import umlDeployment from "./umlDeployment";
import umlSequence from "./umlSequence";
import umlState from "./umlState";
import umlUseCase from "./umlUseCase";

const ALL: [string, DiagramDocument][] = [
  ["c4-model", c4Model],
  ["ci-cd-pipeline", ciCdPipeline],
  ["uml-class", umlClass],
  ["uml-sequence", umlSequence],
  ["uml-use-case", umlUseCase],
  ["uml-activity", umlActivity],
  ["uml-state-machine", umlState],
  ["uml-component", umlComponent],
  ["uml-deployment", umlDeployment],
];

const nodesOf = (doc: DiagramDocument) => Object.values(doc.diagrams).flatMap((d) => d.nodes);
const edgesOf = (doc: DiagramDocument) => Object.values(doc.diagrams).flatMap((d) => d.edges);

describe("the Software & UML templates", () => {
  it.each(ALL)("%s draws every line end with an arrowhead the Style panel offers", (_id, doc) => {
    // The bar from umlKit.ts: a template must never use notation the user cannot reproduce by
    // hand. UML's meaning is in its line ends, so this is the one that matters here.
    const offered = new Set(ARROWHEAD_OPTIONS.map((o) => o.id));
    for (const edge of edgesOf(doc)) {
      expect(offered).toContain(String(edge.style.startArrow ?? "none"));
      expect(offered).toContain(String(edge.style.endArrow ?? "none"));
    }
  });

  it.each(ALL)("%s labels every shape it draws", (_id, doc) => {
    for (const node of nodesOf(doc)) {
      if (node.type !== "shape") continue;
      // Activation bars and the start/end dots are deliberately wordless.
      if (/uml\/(activation|initial-node|final-node|fork-join)/.test(node.shapeRef)) continue;
      expect(node.label?.text.trim(), `${node.id} has no label`).toBeTruthy();
    }
  });

  it("uses the full UML vocabulary of line ends across the set", () => {
    const used = new Set(edgesOf(umlClass).flatMap((e) => [e.style.startArrow, e.style.endArrow]));
    // Inheritance, realization, composition and aggregation are four different heads, and the
    // class diagram is where a user goes to see all four at once.
    expect(used).toContain("triangle");
    expect(used).toContain("diamond");
    expect(used).toContain("diamond-open");
  });

  it("builds the C4 model as three real nesting levels, not three loose pages", () => {
    expect(c4Model.rootDiagramIds).toHaveLength(1);
    expect(Object.keys(c4Model.diagrams)).toHaveLength(3);

    const context = c4Model.diagrams[c4Model.rootDiagramIds[0]];
    const system = context.nodes.find((n): n is NestedNode => n.type === "nested");
    expect(system, "the context diagram's system is a Nested Block").toBeDefined();

    const containers = c4Model.diagrams[system!.childDiagramId];
    expect(containers).toBeDefined();
    const app = containers.nodes.find((n): n is NestedNode => n.type === "nested");
    expect(app, "the container diagram's application is a Nested Block").toBeDefined();

    const components = c4Model.diagrams[app!.childDiagramId];
    expect(components).toBeDefined();
    expect(components.nodes.some((n) => n.type === "nested")).toBe(false);
  });

  it("maps every C4 port to an inner node and attaches an external edge to it", () => {
    for (const diagram of Object.values(c4Model.diagrams)) {
      for (const node of diagram.nodes) {
        if (node.type !== "nested") continue;
        const child = c4Model.diagrams[node.childDiagramId];
        expect(node.ports.length).toBeGreaterThan(0);
        for (const port of node.ports) {
          // An unmapped port is a legitimate state in the app, but a shipped template should
          // never open onto an amber "waiting to be linked" ghost.
          expect(port.innerNodeId, `${port.id} is unmapped`).toBeTruthy();
          expect(child.nodes.some((n) => n.id === port.innerNodeId)).toBe(true);
          const attached = diagram.edges.some(
            (e) =>
              (e.source.nodeId === node.id && e.source.portId === port.id) ||
              (e.target.nodeId === node.id && e.target.portId === port.id),
          );
          expect(attached, `${port.id} carries no edge`).toBe(true);
        }
      }
    }
  });

  // A pipeline diagram is read under pressure, and its one job then is to say which line is the
  // run and which is the way out. Every stop — a blocked PR, a rollback, a wait — is a grey box,
  // and nothing solid is allowed to arrive at one.
  it("reaches every stop in the pipeline on a dashed line, never on the line the run takes", () => {
    let stops = 0;
    for (const diagram of Object.values(ciCdPipeline.diagrams)) {
      const grey = new Set(
        diagram.nodes.filter((n) => n.type === "shape" && n.style.fill === "#F4F5F7").map((n) => n.id),
      );
      stops += grey.size;
      for (const edge of diagram.edges) {
        if (!edge.target.nodeId || !grey.has(edge.target.nodeId)) continue;
        expect(edge.style.dash, `${edge.id} arrives at a stop on a solid line`).toBe("dashed");
      }
    }
    expect(stops, "the pipeline draws no stops at all").toBeGreaterThan(3);
  });

  it("opens each pipeline stage onto its own jobs, in at one end and out at the other", () => {
    const root = ciCdPipeline.diagrams[ciCdPipeline.rootDiagramIds[0]];
    const stages = root.nodes.filter((n): n is NestedNode => n.type === "nested");
    expect(stages).toHaveLength(3);
    for (const stage of stages) {
      const child = ciCdPipeline.diagrams[stage.childDiagramId];
      expect(child.nodes.length, `${stage.id} opens onto almost nothing`).toBeGreaterThan(5);
      // The two ends of a stage are different jobs: a stage whose way in and way out were the
      // same node would be a box with no pipeline inside it.
      const [first, last] = [stage.ports[0], stage.ports[1]];
      expect(first.innerNodeId).not.toBe(last.innerNodeId);
      for (const port of stage.ports) expect(child.nodes.some((n) => n.id === port.innerNodeId)).toBe(true);
    }
  });
});
