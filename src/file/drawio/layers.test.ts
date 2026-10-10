// X3 (D134), on the audit's containers-and-layers fixture: draw.io's layers arrive as Nedito's,
// a hidden one stays hidden, and what a collapsed container folds away stays out of sight.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getLayerId, getLayers } from "../../model/layers";
import type { Diagram } from "../../model/types";
import { decodeDrawio } from "./drawioImport";

async function page(): Promise<{ diagram: Diagram; notices: string[] }> {
  const result = await decodeDrawio(readFileSync("src/file/drawio/fixtures/audit/containers-layers.drawio", "utf8"), "containers-layers.drawio");
  if (!result.ok) throw new Error(result.error);
  return { diagram: result.doc.diagrams[result.doc.rootDiagramIds[0]], notices: result.notices.map((n) => n.message) };
}

const layerOf = (d: Diagram, label: string) => {
  const node = d.nodes.find((n) => n.label?.text === label)!;
  return getLayers(d).find((l) => l.id === getLayerId(node, d))!;
};

describe("draw.io layers", () => {
  it("arrive with their names, in order, a hidden locked one hidden and locked", async () => {
    const { diagram } = await page();
    expect(getLayers(diagram).map((l) => [l.name, l.visible, l.locked])).toEqual([
      ["Base", true, false],
      ["Annotations", true, false],
      ["Hidden layer", false, true],
      ["Folded in draw.io", false, false],
    ]);
  });

  it("put each shape on its own layer", async () => {
    const { diagram } = await page();
    expect(layerOf(diagram, "Cards").name).toBe("Base");
    expect(layerOf(diagram, "Single point of failure").name).toBe("Annotations");
    expect(layerOf(diagram, "Draft").name).toBe("Hidden layer");
  });

  it("keep what a collapsed container folds away on a hidden layer of its own, and say so", async () => {
    const { diagram, notices } = await page();
    expect(layerOf(diagram, "Mainframe").name).toBe("Folded in draw.io");
    // The folded container itself stays where it was.
    expect(layerOf(diagram, "Legacy (folded)").name).toBe("Base");
    expect(notices.some((m) => /folded inside a collapsed container/.test(m))).toBe(true);
    expect(notices.some((m) => /“Hidden layer” was hidden in draw.io and stays hidden/.test(m))).toBe(true);
  });

  it("a file with no layers of its own still imports onto one", async () => {
    const xml = `<mxfile><diagram id="p" name="P"><mxGraphModel><root><mxCell id="a" value="A" style="" vertex="1"><mxGeometry x="0" y="0" width="80" height="40" as="geometry"/></mxCell></root></mxGraphModel></diagram></mxfile>`;
    const result = await decodeDrawio(xml, "x.drawio");
    expect(result.ok).toBe(true);
    if (result.ok) expect(getLayers(result.doc.diagrams[result.doc.rootDiagramIds[0]])).toHaveLength(1);
  });
});
