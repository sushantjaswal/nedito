// X4 (D135): a line's labels stored as cells of their own, a line ending on a line, and where
// draw.io fixed a line to its shapes.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { DEdge, Diagram, ShapeNode } from "../../model/types";
import { decodeDrawio } from "./drawioImport";

async function decode(xml: string): Promise<{ page: Diagram; notices: string[] }> {
  const result = await decodeDrawio(xml, "t.drawio");
  if (!result.ok) throw new Error(result.error);
  return { page: result.doc.diagrams[result.doc.rootDiagramIds[0]], notices: result.notices.map((n) => n.message) };
}

const file = (cells: string) =>
  `<mxfile><diagram id="p" name="P"><mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/>${cells}</root></mxGraphModel></diagram></mxfile>`;
const box = (id: string, x: number, y: number, value = id) =>
  `<mxCell id="${id}" value="${value}" style="whiteSpace=wrap;" vertex="1" parent="1"><mxGeometry x="${x}" y="${y}" width="100" height="50" as="geometry"/></mxCell>`;

describe("labels stored as cells of their own", () => {
  it("become the line's label, where they were along it — not a box near the origin", async () => {
    const { page, notices } = await decode(
      file(
        box("a", 0, 0) +
          box("b", 300, 0) +
          `<mxCell id="e" style="endArrow=classic;" edge="1" parent="1" source="a" target="b"><mxGeometry relative="1" as="geometry"/></mxCell>` +
          `<mxCell id="l" value="pays" style="edgeLabel;html=1;" vertex="1" connectable="0" parent="e"><mxGeometry x="-0.5" y="0" relative="1" as="geometry"><mxPoint x="0" y="-12" as="offset"/></mxGeometry></mxCell>`,
      ),
    );
    expect(page.nodes.map((n) => n.label?.text)).toEqual(["a", "b"]);
    const e = page.edges[0];
    expect(e.label?.text).toBe("pays");
    expect(e.labelPosition).toEqual({ t: 0.25, dx: 0, dy: -12 });
    expect(notices.join("\n")).not.toMatch(/edgelabel/i);
  });

  it("a line that already has a label keeps a second as text beside it, and says so", async () => {
    const { page, notices } = await decode(readFileSync("src/file/drawio/fixtures/audit/flow-basics.drawio", "utf8"));
    const restock = page.nodes.find((n) => n.label?.text === "restock") as ShapeNode;
    expect(restock.shapeRef).toBe("general/text");
    expect(page.edges.find((e) => e.label?.text === "no")).toBeDefined();
    expect(notices.some((m) => /second label/.test(m))).toBe(true);
  });
});

describe("a line that ends on a line", () => {
  it("is kept, its end loose at that line's middle, and said so", async () => {
    const { page, notices } = await decode(
      file(
        box("a", 0, 0) +
          box("b", 300, 0) +
          box("c", 150, 200) +
          `<mxCell id="ab" edge="1" parent="1" source="a" target="b"><mxGeometry relative="1" as="geometry"/></mxCell>` +
          `<mxCell id="cab" edge="1" parent="1" source="c" target="ab"><mxGeometry relative="1" as="geometry"/></mxCell>`,
      ),
    );
    expect(page.edges).toHaveLength(2);
    const onLine = page.edges.find((e) => !e.target.nodeId) as DEdge;
    // Midway between a's centre (50, 25) and b's (350, 25).
    expect(onLine.target.point).toEqual({ x: 200, y: 25 });
    expect(notices.some((m) => /attached to another line/.test(m))).toBe(true);
  });
});

describe("where draw.io fixed a line to its shapes", () => {
  it("the middle of a side is that side's handle; any other point is a fixed anchor", async () => {
    const { page } = await decode(
      file(
        box("a", 0, 0) +
          box("b", 300, 0) +
          `<mxCell id="e" style="exitX=1;exitY=0.5;entryX=0.25;entryY=0;" edge="1" parent="1" source="a" target="b"><mxGeometry relative="1" as="geometry"/></mxCell>`,
      ),
    );
    const e = page.edges[0];
    expect(e.style.sourceHandle).toBe("right");
    expect(e.source.anchor).toBeUndefined();
    expect(e.target.anchor).toEqual({ x: 0.25, y: 0 });
  });

  it("the audit's flow keeps the sides the original leaves and enters by", async () => {
    const { page } = await decode(readFileSync("src/file/drawio/fixtures/audit/flow-basics.drawio", "utf8"));
    const check = page.edges.find((e) => e.label?.text === "check")!;
    expect([check.style.sourceHandle, check.style.targetHandle]).toEqual(["right", "left"]);
    const no = page.edges.find((e) => e.label?.text === "no")!;
    expect([no.style.sourceHandle, no.style.targetHandle]).toEqual(["bottom", "top"]);
  });
});
