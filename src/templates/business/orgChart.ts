// Org chart, with each department a Nested Block holding its team.
//
// The reason to nest here is the reason org charts are usually two documents: the leadership
// view fits on a page, the full headcount does not. Drawn flat, a company of any size either
// stops at director level or becomes unreadable. Each department opens into its own team, so
// one document serves both audiences — and the reporting line into the department survives the
// drill-in as a ghost, so a team member can see who their department answers to.
import type { Diagram, NestedNode } from "../../model/types";
import { templateDoc, tid } from "../starters/basicFlowchart";
import { ACCENT, PLAIN, REPORTS, ZONE, link, node, page } from "./bizKit";

const BOX = "general/rounded-rect";

/** One department's child diagram: its lead, then the people reporting to them. */
function department(key: string, lead: string, leadTitle: string, team: [string, string][]): Diagram {
  const k = (s: string) => `${key}${s}`;
  return page(
    k("d"),
    leadTitle,
    [
      node(k("lead"), BOX, `${lead}\n${leadTitle}`, 320, 40, 190, 70, 2, ACCENT),
      ...team.map(([name, role], i) => node(k(`m${i}`), BOX, `${name}\n${role}`, 60 + i * 230, 220, 190, 70, 3 + i, PLAIN)),
    ],
    team.map(([, ], i) => link(k(`r${i}`), k("lead"), k(`m${i}`), REPORTS, undefined, ["bottom", "top"])),
  );
}

const engineering = department("oe", "Priya Raman", "VP Engineering", [
  ["Tom Ellery", "Platform Lead"],
  ["Sara Nkemi", "Product Eng Lead"],
  ["Jonas Brandt", "QA Lead"],
]);

const sales = department("os", "Marcus Hale", "VP Sales", [
  ["Ana Duarte", "Enterprise"],
  ["Wei Lin", "Mid-market"],
  ["Ruth Adeyemi", "Partnerships"],
]);

const operations = department("oo", "Clara Bennett", "VP Operations", [
  ["Ivan Petrov", "Facilities"],
  ["Nadia Farouk", "Supply Chain"],
]);

/** `key` is the department's id prefix, so the port maps to that department's own lead. */
function deptBlock(slug: string, title: string, child: Diagram, key: string, x: number, z: number): NestedNode {
  return {
    id: tid(slug),
    type: "nested",
    childDiagramId: child.id,
    position: { x, y: 440 },
    size: { w: 250, h: 150 },
    z,
    style: {},
    label: { text: title, align: "center" },
    collapsed: { icons: [], summary: "lead · direct reports" },
    ports: [{ id: tid(`${slug}P`), side: "top", offset: 0.5, innerNodeId: tid(`${key}lead`), label: "reports to" }],
  };
}

const engBlock = deptBlock("bEng", "Engineering", engineering, "oe", 60, 4);
const salesBlock = deptBlock("bSales", "Sales", sales, "os", 360, 5);
const opsBlock = deptBlock("bOps", "Operations", operations, "oo", 660, 6);

const top: Diagram = page(
  "dOrgChart",
  "Leadership",
  [
    // The board sits above the chief executive it appoints, as the reporting line runs.
    node("oBoard", BOX, "Board of Directors", 390, 30, 180, 56, 1, ZONE),
    node("oCeo", BOX, "Helen Osei\nChief Executive", 380, 140, 200, 70, 2, ACCENT),
    node("oCoo", BOX, "Daniel Krause\nChief Operating Officer", 380, 290, 200, 70, 3, PLAIN),
    node("oCfo", BOX, "Grace Mensah\nChief Financial Officer", 760, 290, 200, 70, 4, PLAIN),
    engBlock,
    salesBlock,
    opsBlock,
  ],
  [
    link("oBoardCeo", "oBoard", "oCeo", REPORTS, undefined, ["bottom", "top"]),
    link("oCeoCoo", "oCeo", "oCoo", REPORTS, undefined, ["bottom", "top"]),
    link("oCeoCfo", "oCeo", "oCfo", REPORTS, undefined, ["bottom", "top"]),
    ...[engBlock, salesBlock, opsBlock].map((b, i) => ({
      id: tid(`oDept${i}`),
      source: { nodeId: tid("oCoo") },
      target: { nodeId: b.id, portId: b.ports[0].id },
      style: { ...REPORTS, sourceHandle: "bottom", targetHandle: "top" },
    })),
  ],
);

export default templateDoc("Leadership", [top, engineering, sales, operations]);
