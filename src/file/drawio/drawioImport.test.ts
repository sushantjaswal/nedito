import { describe, expect, it } from "vitest";
import { decodeDrawio } from "./drawioImport";
import { validateDoc } from "../../model/validate";
import type { GroupNode, ShapeNode } from "../../model/types";

/** A file shaped the way app.diagrams.net actually writes one. */
const SAMPLE = `<mxfile host="app.diagrams.net" modified="2026-01-01T00:00:00.000Z" agent="test" version="24.0.0">
  <diagram id="page-one" name="Architecture">
    <mxGraphModel dx="1114" dy="762" grid="1" gridSize="10" page="1" pageWidth="850" pageHeight="1100" background="#ffffff">
      <root>
        <mxCell id="0" />
        <mxCell id="1" parent="0" />
        <mxCell id="2" value="API Gateway" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#dae8fc;strokeColor=#6c8ebf;" vertex="1" parent="1">
          <mxGeometry x="120" y="80" width="160" height="60" as="geometry" />
        </mxCell>
        <mxCell id="3" value="&lt;b&gt;Orders&lt;/b&gt; DB" style="shape=cylinder3;whiteSpace=wrap;html=1;fontSize=16;" vertex="1" parent="1">
          <mxGeometry x="400" y="240" width="120" height="80" as="geometry" />
        </mxCell>
        <mxCell id="4" value="calls" style="edgeStyle=orthogonalEdgeStyle;html=1;endArrow=block;strokeColor=#ff0000;" edge="1" parent="1" source="2" target="3">
          <mxGeometry relative="1" as="geometry">
            <Array as="points">
              <mxPoint x="300" y="200" />
              <mxPoint x="350" y="220" />
            </Array>
          </mxGeometry>
        </mxCell>
      </root>
    </mxGraphModel>
  </diagram>
  <diagram id="page-two" name="Detail">
    <mxGraphModel dx="1114" dy="762" grid="1">
      <root>
        <mxCell id="0" />
        <mxCell id="1" parent="0" />
        <mxCell id="10" value="Note" style="shape=note;whiteSpace=wrap;html=1;" vertex="1" parent="1">
          <mxGeometry x="40" y="40" width="100" height="80" as="geometry" />
        </mxCell>
      </root>
    </mxGraphModel>
  </diagram>
</mxfile>`;

async function importOk(xml: string, name?: string) {
  const result = await decodeDrawio(xml, name);
  if (!result.ok) throw new Error(`expected a successful import, got: ${result.error}`);
  return result;
}

describe("decodeDrawio", () => {
  it("makes one page per <diagram>, in file order", async () => {
    const { doc } = await importOk(SAMPLE);
    expect(doc.rootDiagramIds).toHaveLength(2);
    const titles = doc.rootDiagramIds.map((id) => doc.diagrams[id].title);
    expect(titles).toEqual(["Architecture", "Detail"]);
  });

  it("produces a document that passes the same validation as any opened file", async () => {
    const { doc } = await importOk(SAMPLE);
    expect(validateDoc(doc)).toEqual([]);
  });

  it("carries geometry, shape, colours and label across", async () => {
    const { doc } = await importOk(SAMPLE);
    const page = doc.diagrams[doc.rootDiagramIds[0]];
    const gateway = page.nodes.find((n) => n.label?.text === "API Gateway") as ShapeNode;

    expect(gateway.shapeRef).toBe("general/rounded-rect");
    expect(gateway.position).toEqual({ x: 120, y: 80 });
    expect(gateway.size).toEqual({ w: 160, h: 60 });
    expect(gateway.style).toMatchObject({ fill: "#dae8fc", stroke: "#6c8ebf" });
  });

  it("reduces an HTML label to readable text, keeping what RichLabel can hold", async () => {
    const { doc } = await importOk(SAMPLE);
    const page = doc.diagrams[doc.rootDiagramIds[0]];
    const db = page.nodes.find((n) => (n as ShapeNode).shapeRef === "general/cylinder")!;
    expect(db.label?.text).toBe("Orders DB");
    expect(db.label?.bold).toBe(true);
    expect(db.label?.fontSize).toBe(16);
  });

  it("rewires edges onto the new node ids and keeps waypoints and styling", async () => {
    const { doc } = await importOk(SAMPLE);
    const page = doc.diagrams[doc.rootDiagramIds[0]];
    expect(page.edges).toHaveLength(1);
    const edge = page.edges[0];

    const nodeIds = new Set(page.nodes.map((n) => n.id));
    expect(nodeIds.has(edge.source.nodeId!)).toBe(true);
    expect(nodeIds.has(edge.target.nodeId!)).toBe(true);
    // draw.io's ids ("2", "3") must not survive: ids are nanoids unique across
    // the whole document, and two pages would otherwise both claim id "1".
    expect(edge.source.nodeId).not.toBe("2");

    expect(edge.waypoints).toEqual([
      { x: 300, y: 200 },
      { x: 350, y: 220 },
    ]);
    expect(edge.style).toMatchObject({ edgeStyle: "orthogonal", endArrow: "classic", stroke: "#ff0000" });
    expect(edge.label?.text).toBe("calls");
  });

  it("gives every page its own ids, so two pages never collide", async () => {
    const { doc } = await importOk(SAMPLE);
    const all = Object.values(doc.diagrams).flatMap((d) => [...d.nodes.map((n) => n.id), ...d.edges.map((e) => e.id)]);
    expect(new Set(all).size).toBe(all.length);
  });

  it("takes the document title from the file name", async () => {
    const { doc } = await importOk(SAMPLE, "Payments Architecture.drawio");
    expect(doc.meta.title).toBe("Payments Architecture");
  });

  it("reads a bare <mxGraphModel>, which is what Edit Diagram shows and people paste", async () => {
    const bare = `<mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/>
      <mxCell id="2" value="Solo" style="ellipse;" vertex="1" parent="1">
        <mxGeometry x="10" y="20" width="80" height="40" as="geometry"/>
      </mxCell></root></mxGraphModel>`;
    const { doc } = await importOk(bare);
    expect(doc.rootDiagramIds).toHaveLength(1);
    expect((doc.diagrams[doc.rootDiagramIds[0]].nodes[0] as ShapeNode).shapeRef).toBe("general/ellipse");
  });
});

describe("decodeDrawio — nested coordinates and groups", () => {
  const GROUPED = `<mxGraphModel><root>
    <mxCell id="0"/><mxCell id="1" parent="0"/>
    <mxCell id="g" value="" style="group" vertex="1" connectable="0" parent="1">
      <mxGeometry x="200" y="100" width="240" height="120" as="geometry"/>
    </mxCell>
    <mxCell id="c1" value="Inside" style="rounded=0;" vertex="1" parent="g">
      <mxGeometry x="10" y="20" width="80" height="40" as="geometry"/>
    </mxCell>
  </root></mxGraphModel>`;

  it("converts a draw.io group into a GroupNode naming its members", async () => {
    const { doc } = await importOk(GROUPED);
    const page = doc.diagrams[doc.rootDiagramIds[0]];
    const group = page.nodes.find((n) => n.type === "group") as GroupNode;
    const child = page.nodes.find((n) => n.label?.text === "Inside")!;

    expect(group).toBeDefined();
    expect(group.childIds).toContain(child.id);
  });

  it("resolves a child's parent-relative geometry into diagram coordinates", async () => {
    const { doc } = await importOk(GROUPED);
    const page = doc.diagrams[doc.rootDiagramIds[0]];
    const child = page.nodes.find((n) => n.label?.text === "Inside")!;
    // draw.io stores (10,20) relative to a group at (200,100).
    expect(child.position).toEqual({ x: 210, y: 120 });
  });

  it("survives a cyclic parent chain instead of hanging on it", async () => {
    const cyclic = `<mxGraphModel><root>
      <mxCell id="0"/><mxCell id="1" parent="0"/>
      <mxCell id="a" style="rounded=0;" vertex="1" parent="b"><mxGeometry x="5" y="5" width="10" height="10" as="geometry"/></mxCell>
      <mxCell id="b" style="rounded=0;" vertex="1" parent="a"><mxGeometry x="5" y="5" width="10" height="10" as="geometry"/></mxCell>
    </root></mxGraphModel>`;
    const { doc } = await importOk(cyclic);
    expect(doc.diagrams[doc.rootDiagramIds[0]].nodes).toHaveLength(2);
  });
});

describe("decodeDrawio — best effort, stated out loud", () => {
  it("draws an unmappable shape as a rectangle and says which ones", async () => {
    const exotic = `<mxGraphModel><root>
      <mxCell id="0"/><mxCell id="1" parent="0"/>
      <mxCell id="2" value="VM" style="shape=mxgraph.azure.virtual_machine;" vertex="1" parent="1">
        <mxGeometry x="0" y="0" width="50" height="50" as="geometry"/>
      </mxCell>
    </root></mxGraphModel>`;
    const result = await importOk(exotic);
    const node = result.doc.diagrams[result.doc.rootDiagramIds[0]].nodes[0] as ShapeNode;

    expect(node.shapeRef).toBe("general/rect");
    expect(node.label?.text).toBe("VM"); // the content survives even when the shape doesn't
    const text = result.notices.map((n) => n.message).join(" ");
    expect(text).toContain("mxgraph.azure.virtual_machine");
    // Reads as a sentence for one shape as well as for many.
    expect(text).toContain("as a plain rectangle");
  });

  // The point of structured notices over an alert: the user can be taken to what changed.
  it("says which page and which nodes a substitution note is about", async () => {
    const exotic = `<mxGraphModel><root>
      <mxCell id="0"/><mxCell id="1" parent="0"/>
      <mxCell id="2" value="VM" style="shape=mxgraph.azure.virtual_machine;" vertex="1" parent="1">
        <mxGeometry x="0" y="0" width="50" height="50" as="geometry"/>
      </mxCell>
      <mxCell id="3" value="Fine" style="rounded=0;" vertex="1" parent="1">
        <mxGeometry x="100" y="0" width="50" height="50" as="geometry"/>
      </mxCell>
    </root></mxGraphModel>`;
    const result = await importOk(exotic);
    const page = result.doc.diagrams[result.doc.rootDiagramIds[0]];
    const [notice] = result.notices;

    expect(notice.diagramId).toBe(page.id);
    // Exactly the stand-in, not the shape that mapped cleanly beside it.
    const vm = page.nodes.find((n) => n.label?.text === "VM")!;
    expect(notice.nodeIds).toEqual([vm.id]);
  });

  // A line drawn from draw.io's sidebar floats at both ends; since v4 an end can be free here too
  // (D86), so it comes across where it was drawn, its double-line or block-arrow shape included.
  it("brings a free-floating line across at its own points", async () => {
    const lines = `<mxGraphModel><root>
      <mxCell id="0"/><mxCell id="1" parent="0"/>
      <mxCell id="2" style="rounded=0;" vertex="1" parent="1"><mxGeometry x="0" y="0" width="50" height="50" as="geometry"/></mxCell>
      <mxCell id="7" style="endArrow=classic;html=1;" edge="1" parent="1">
        <mxGeometry width="50" height="50" relative="1" as="geometry">
          <mxPoint x="100" y="200" as="sourcePoint"/><mxPoint x="300" y="180" as="targetPoint"/>
        </mxGeometry>
      </mxCell>
      <mxCell id="8" style="shape=flexArrow;endArrow=classic;html=1;" edge="1" parent="1" source="2">
        <mxGeometry relative="1" as="geometry"><mxPoint x="400" y="25" as="targetPoint"/></mxGeometry>
      </mxCell>
    </root></mxGraphModel>`;
    const result = await importOk(lines);
    const page = result.doc.diagrams[result.doc.rootDiagramIds[0]];
    expect(page.edges).toHaveLength(2);
    const [free, half] = page.edges;
    expect(free.source).toEqual({ point: { x: 100, y: 200 } });
    expect(free.target).toEqual({ point: { x: 300, y: 180 } });
    expect(half.source.nodeId).toBe(page.nodes[0].id);
    expect(half.target).toEqual({ point: { x: 400, y: 25 } });
    expect(half.style.edgeShape).toBe("arrow");
    expect(result.notices).toEqual([]);
    expect(validateDoc(result.doc)).toEqual([]);
  });

  // An end with neither a cell nor a point has nowhere to be: counted, not invented onto a neighbour.
  it("skips a connection with an end that is nowhere and counts it rather than faking one", async () => {
    const floating = `<mxGraphModel><root>
      <mxCell id="0"/><mxCell id="1" parent="0"/>
      <mxCell id="2" style="rounded=0;" vertex="1" parent="1"><mxGeometry x="0" y="0" width="50" height="50" as="geometry"/></mxCell>
      <mxCell id="9" style="html=1;" edge="1" parent="1" source="2">
        <mxGeometry relative="1" as="geometry"/>
      </mxCell>
    </root></mxGraphModel>`;
    const result = await importOk(floating);
    expect(result.doc.diagrams[result.doc.rootDiagramIds[0]].edges).toHaveLength(0);
    const [notice] = result.notices;
    expect(notice.message).toMatch(/skipped 1 connection/);
    // Nothing survived to point at, so the note can only open the page.
    expect(notice.nodeIds).toEqual([]);
    expect(notice.diagramId).toBe(result.doc.rootDiagramIds[0]);
  });

  it("reads a label off an <object> wrapper, not just the mxCell value", async () => {
    const wrapped = `<mxGraphModel><root>
      <mxCell id="0"/><mxCell id="1" parent="0"/>
      <object label="Wrapped up" tag="custom" id="7">
        <mxCell style="rounded=0;" vertex="1" parent="1">
          <mxGeometry x="0" y="0" width="80" height="40" as="geometry"/>
        </mxCell>
      </object>
    </root></mxGraphModel>`;
    const { doc } = await importOk(wrapped);
    expect(doc.diagrams[doc.rootDiagramIds[0]].nodes[0].label?.text).toBe("Wrapped up");
  });

  it("says nothing when everything came across cleanly", async () => {
    const { notices } = await importOk(SAMPLE);
    expect(notices).toEqual([]);
  });
});

describe("decodeDrawio — files it should refuse", () => {
  it("rejects XML that isn't draw.io at all", async () => {
    const result = await decodeDrawio("<html><body>not a diagram</body></html>");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("draw.io");
  });

  it("rejects text that isn't XML, without throwing", async () => {
    const result = await decodeDrawio('{"format":"nedito"}');
    expect(result.ok).toBe(false);
  });

  it("reports an mxfile with no pages instead of loading an empty document", async () => {
    const result = await decodeDrawio(`<mxfile host="test"></mxfile>`);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/no pages/);
  });
});
