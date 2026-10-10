// X6 (D137): placeholders filled from an object's own data; links, tooltips and minor style
// losses said in a notice rather than dropped quietly.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { Diagram } from "../../model/types";
import { decodeDrawio, fillPlaceholders } from "./drawioImport";

async function decode(xml: string, name = "t.drawio"): Promise<{ page: Diagram; notices: string[] }> {
  const result = await decodeDrawio(xml, name);
  if (!result.ok) throw new Error(result.error);
  return { page: result.doc.diagrams[result.doc.rootDiagramIds[0]], notices: result.notices.map((n) => n.message) };
}

const file = (cells: string) =>
  `<mxfile><diagram id="p" name="P"><mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/>${cells}</root></mxGraphModel></diagram></mxfile>`;

describe("placeholders", () => {
  it("fill from the object's data; an unknown name stays as written; %% is a percent sign", () => {
    expect(fillPlaceholders("Owner: %owner%", { owner: "SRE" })).toBe("Owner: SRE");
    expect(fillPlaceholders("%team% / %missing%", { team: "Ops" })).toBe("Ops / %missing%");
    expect(fillPlaceholders("100%% up", {})).toBe("100% up");
  });

  it("the audit's object reads 'Owner: SRE', not the template", async () => {
    const { page } = await decode(readFileSync("src/file/drawio/fixtures/audit/containers-layers.drawio", "utf8"));
    expect(page.nodes.some((n) => n.label?.text === "Owner: SRE")).toBe(true);
    expect(page.nodes.some((n) => n.label?.text?.includes("%owner%"))).toBe(false);
  });

  it("only when the object asks for it", async () => {
    const { page } = await decode(
      file(`<object label="Owner: %owner%" owner="SRE" id="o"><mxCell style="" vertex="1" parent="1"><mxGeometry width="120" height="40" as="geometry"/></mxCell></object>`),
    );
    expect(page.nodes[0].label?.text).toBe("Owner: %owner%");
  });
});

describe("what has no place here", () => {
  it("links and tooltips are named in a notice, with the shapes to show", async () => {
    const { notices } = await decode(readFileSync("src/file/drawio/fixtures/audit/containers-layers.drawio", "utf8"));
    const said = notices.find((m) => /link/.test(m))!;
    expect(said).toContain("https://example.org/docs");
    expect(said).toContain("tooltip");
  });

  it("gradients, underline and colours within a label are listed, the shapes still all there", async () => {
    const { page, notices } = await decode(
      file(
        `<mxCell id="g" value="Grad" style="fillColor=#dae8fc;gradientColor=#7ea6e0;" vertex="1" parent="1"><mxGeometry width="120" height="40" as="geometry"/></mxCell>` +
          `<mxCell id="u" value="Under" style="fontStyle=4;" vertex="1" parent="1"><mxGeometry y="60" width="120" height="40" as="geometry"/></mxCell>` +
          `<mxCell id="c" value="&lt;font color=&quot;#ff0000&quot;&gt;Red&lt;/font&gt; word" style="html=1;" vertex="1" parent="1"><mxGeometry y="120" width="120" height="40" as="geometry"/></mxCell>`,
      ),
    );
    expect(page.nodes).toHaveLength(3);
    const said = notices.find((m) => /styling/.test(m))!;
    expect(said).toMatch(/gradients on 1, underlined text on 1, colours within the label on 1/);
  });

  it("a plain file says nothing of the kind", async () => {
    const { notices } = await decode(file(`<mxCell id="a" value="A" style="" vertex="1" parent="1"><mxGeometry width="120" height="40" as="geometry"/></mxCell>`));
    expect(notices).toEqual([]);
  });
});
