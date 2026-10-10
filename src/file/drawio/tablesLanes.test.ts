// X5 (D136): draw.io's tables, swimlanes and containers.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { Diagram, GroupNode, ShapeNode } from "../../model/types";
import { validateDoc } from "../../model/validate";
import { decodeDrawio } from "./drawioImport";

async function fixture(name: string): Promise<{ page: Diagram; notices: string[] }> {
  const result = await decodeDrawio(readFileSync(`src/file/drawio/fixtures/audit/${name}`, "utf8"), name);
  if (!result.ok) throw new Error(result.error);
  expect(validateDoc(result.doc)).toEqual([]);
  return { page: result.doc.diagrams[result.doc.rootDiagramIds[0]], notices: result.notices.map((n) => n.message) };
}

const byLabel = (d: Diagram, text: string) => d.nodes.find((n) => n.label?.text === text) as ShapeNode;
const groupOf = (d: Diagram, id: string) => d.nodes.find((n): n is GroupNode => n.type === "group" && n.childIds.includes(id));

describe("tables", () => {
  it("arrive as entity tables with borderless rows and cells, the header kept — not a cage of boxes", async () => {
    const { page, notices } = await fixture("er-table.drawio");
    const customer = byLabel(page, "customer");
    expect(customer.shapeRef).toBe("entity-relation/table");
    const column = byLabel(page, "customer_id");
    expect(column.style.stroke).toBe("none");
    expect(column.style.fill).toBe("none");
    // Rows are invisible but still there: the relationship attaches to them.
    const rows = page.nodes.filter((n) => n.type === "shape" && n.style.stroke === "none" && !n.label);
    expect(rows.length).toBeGreaterThanOrEqual(3);
    expect(page.edges).toHaveLength(1);
    expect(notices.join("\n")).not.toMatch(/table|partialRectangle/i);
  });

  it("move as one: the table and its rows and cells are a group", async () => {
    const { page } = await fixture("er-table.drawio");
    const group = groupOf(page, byLabel(page, "customer").id)!;
    expect(group).toBeDefined();
    expect(group.childIds).toContain(byLabel(page, "customer_id").id);
    expect(group.childIds).toContain(byLabel(page, "email").id);
  });
});

describe("swimlanes and containers", () => {
  it("a swimlane keeps its title band, and holds what is in it", async () => {
    const { page, notices } = await fixture("containers-layers.drawio");
    const lane = byLabel(page, "Payments");
    expect(lane.shapeRef).toBe("advanced/swimlane-vertical");
    const group = groupOf(page, lane.id)!;
    expect(group.childIds).toEqual(expect.arrayContaining([lane.id, byLabel(page, "Cards").id, byLabel(page, "Fraud").id]));
    expect(notices.join("\n")).not.toMatch(/swimlane/);
  });

  it("a container groups its contents, and its see-through fill stays see-through", async () => {
    const { page } = await fixture("containers-layers.drawio");
    const vpc = byLabel(page, "VPC");
    expect(vpc.style.fill).toBe("none");
    expect(groupOf(page, vpc.id)!.childIds).toContain(byLabel(page, "App VM").id);
  });

  it("a collapsed container groups nothing: its contents are folded away (X3)", async () => {
    const { page } = await fixture("containers-layers.drawio");
    expect(groupOf(page, byLabel(page, "Legacy (folded)").id)).toBeUndefined();
  });

  it("a draw.io group stays the only group round its members", async () => {
    const { page } = await fixture("containers-layers.drawio");
    const primary = byLabel(page, "Primary");
    expect(page.nodes.filter((n) => n.type === "group" && n.childIds.includes(primary.id))).toHaveLength(1);
  });

  it("a lane drawn sideways has its title down the side", async () => {
    const xml = `<mxfile><diagram id="p" name="P"><mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/><mxCell id="l" value="Ops" style="swimlane;horizontal=0;startSize=30;" vertex="1" parent="1"><mxGeometry x="0" y="0" width="600" height="120" as="geometry"/></mxCell></root></mxGraphModel></diagram></mxfile>`;
    const result = await decodeDrawio(xml, "lane.drawio");
    expect(result.ok).toBe(true);
    if (result.ok) expect((result.doc.diagrams[result.doc.rootDiagramIds[0]].nodes[0] as ShapeNode).shapeRef).toBe("bpmn/lane");
  });
});

describe("an entity relationship", () => {
  it("runs side to side, from the facing sides, as draw.io's ER style does", async () => {
    const { page } = await fixture("er-table.drawio");
    expect([page.edges[0].style.sourceHandle, page.edges[0].style.targetHandle]).toEqual(["right", "left"]);
  });
});
