import { describe, expect, it } from "vitest";
import { planFigures, figureSize } from "./docxExport";
import {
  boilerplateParts,
  bookmarkName,
  customXmlItem,
  documentRels,
  readCustomXmlJson,
  CONTENT_WIDTH_EMU,
  CUSTOM_XML_NS,
  isDocumentCustomXml,
} from "./docxParts";
import { documentXml, figureParagraph, heading, internalLinkParagraph } from "./docxBody";
import { decodeDocx } from "./docxImport";
import { createZip } from "../pptx/zip";
import type { DiagramDocument, Diagram } from "../../model/types";

function nested(id: string, childDiagramId: string, z = 1) {
  return {
    id,
    type: "nested" as const,
    childDiagramId,
    position: { x: 40, y: 30 },
    size: { w: 200, h: 120 },
    z,
    style: {},
    label: { text: "Payments" },
    collapsed: { icons: [] },
    ports: [],
  };
}

function diagram(id: string, title: string, nodes: Diagram["nodes"] = []): Diagram {
  return { id, title, nodes, edges: [] };
}

function treeDoc(): DiagramDocument {
  return {
    formatVersion: 2,
    meta: { title: "Architecture", created: "", modified: "", appVersion: "0" },
    rootDiagramIds: ["main"],
    diagrams: {
      main: diagram("main", "Main", [nested("n1", "payments")]),
      payments: diagram("payments", "Payments", [nested("n2", "fraud")]),
      fraud: diagram("fraud", "Fraud"),
    },
  };
}

describe("planFigures", () => {
  it("numbers figures depth-first, parent before children", () => {
    expect(planFigures(treeDoc()).map((p) => `${p.figureNumber}:${p.title}`)).toEqual([
      "1:Main",
      "2:Payments",
      "3:Fraud",
    ]);
  });

  it("records which figure each one should return to", () => {
    const plans = planFigures(treeDoc());
    expect(plans.map((p) => p.parentFigureNumber)).toEqual([null, 1, 2]);
  });

  it("gives a diagram reached twice one figure, not two", () => {
    const doc = treeDoc();
    doc.diagrams.main.nodes.push(nested("n3", "payments", 2));
    expect(planFigures(doc)).toHaveLength(3);
  });
});

describe("figureSize", () => {
  it("scales a wide diagram down to the text width", () => {
    const size = figureSize(2000, 1000);
    expect(size.width).toBe(CONTENT_WIDTH_EMU);
    expect(size.scale).toBeLessThan(1);
  });

  it("never enlarges a small diagram past its natural size", () => {
    const size = figureSize(100, 80);
    expect(size.scale).toBe(1);
    expect(size.width).toBeLessThan(CONTENT_WIDTH_EMU);
  });

  it("keeps the aspect ratio", () => {
    const size = figureSize(2000, 1000);
    expect(size.width / size.height).toBeCloseTo(2, 1);
  });
});

describe("bookmarks and internal links", () => {
  // Word silently drops a malformed bookmark name, and the link then goes nowhere with no
  // error — so the name shape is worth pinning down.
  it("generates bookmark names Word will accept", () => {
    for (const n of [1, 2, 99]) {
      expect(bookmarkName(n)).toMatch(/^[A-Za-z][A-Za-z0-9_]*$/);
    }
  });

  it("puts the bookmark inside the heading it names", () => {
    const xml = heading("2. Payments", 2, { id: 5, name: bookmarkName(2) });
    expect(xml).toContain('<w:bookmarkStart w:id="5" w:name="ddFigure2"/>');
    expect(xml).toContain('<w:bookmarkEnd w:id="5"/>');
    expect(xml.indexOf("bookmarkStart")).toBeLessThan(xml.indexOf("2. Payments"));
  });

  // The plain form of an internal link: no relationship, nothing to resolve, nothing to drop.
  it("writes a text link as w:hyperlink/@w:anchor with no relationship", () => {
    const xml = internalLinkParagraph("↑ Return to Figure 1", bookmarkName(1));
    expect(xml).toContain('<w:hyperlink w:anchor="ddFigure1">');
    expect(xml).not.toContain("r:id");
  });
});

describe("figure overlays", () => {
  const figure = () =>
    figureParagraph({
      imageRelId: "rId1",
      widthEmu: 5943600,
      heightEmu: 3000000,
      docPrId: 10,
      name: "Main diagram",
      overlays: [
        { docPrId: 11, name: "Link to Figure 2", x: 100, y: 200, w: 300, h: 400, linkRelId: "rId2", tooltip: "Open" },
      ],
    });

  it("carries the hyperlink on the drawing's docPr, where a:hlinkClick lives", () => {
    const xml = figure();
    expect(xml).toContain('<a:hlinkClick xmlns:a=');
    expect(xml).toContain('r:id="rId2"');
  });

  // The shape has to sit above the picture to be clickable, and Word pushes overlapping
  // anchored shapes apart unless told not to.
  it("floats the overlay above the picture rather than behind it", () => {
    const xml = figure();
    expect(xml).toContain('behindDoc="0"');
    expect(xml).toContain('allowOverlap="1"');
    expect(xml).toContain("<wp:wrapNone/>");
  });

  it("is transparent and borderless, so it never shows in the document", () => {
    const xml = figure();
    expect(xml).toContain("<a:noFill/>");
    expect(xml).toContain("<a:ln><a:noFill/></a:ln>");
  });

  it("shares the picture's paragraph, so its offsets share the picture's origin", () => {
    const xml = figure();
    expect(xml.startsWith("<w:p>")).toBe(true);
    expect(xml.endsWith("</w:p>")).toBe(true);
    expect((xml.match(/<w:p>/g) ?? []).length).toBe(1);
  });

  it("emits a figure with no overlays when nothing is nested", () => {
    const xml = figureParagraph({ imageRelId: "rId1", widthEmu: 100, heightEmu: 50, docPrId: 1, name: "x" });
    expect(xml).not.toContain("wp:anchor");
    expect(xml).toContain("wp:inline");
  });
});

describe("the embedded document copy", () => {
  it("round-trips JSON through the custom XML part", () => {
    const json = '{"format":"nedito","note":"has <angle> & \\"quotes\\""}';
    expect(readCustomXmlJson(customXmlItem(json))).toBe(json);
  });

  // "]]>" is the one sequence CDATA cannot contain; a diagram label could legitimately hold it.
  it("survives a label containing the CDATA terminator", () => {
    const json = '{"label":"a]]>b"}';
    const part = customXmlItem(json);
    expect(part).not.toMatch(/[^\]]\]\]>(?!<\/nedito>|<!\[CDATA\[)/);
    expect(readCustomXmlJson(part)).toBe(json);
  });

  it("returns null for a part that has no payload", () => {
    expect(readCustomXmlJson("<nedito/>")).toBeNull();
  });

  // Once saved in Word the part is Word's to re-serialize; escaped text is the same content.
  it("reads the payload back when it was written as escaped text rather than CDATA", () => {
    const json = '{"label":"a <b> & \\"c\\" ]]> d"}';
    const escaped = json.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    expect(readCustomXmlJson(`<?xml version="1.0"?><nedito xmlns="${CUSTOM_XML_NS}">${escaped}</nedito>`)).toBe(json);
  });

  // D100: Word files exported before the rename carry <deepdraw xmlns="https://deepdraw.local/document">.
  it("writes the new element and namespace, and still reads a part written before the rename", () => {
    expect(customXmlItem("{}")).toContain('<nedito xmlns="https://nedito.app/ns/document">');
    const json = '{"format":"deepdraw","x":"a]]>b"}';
    const old = `<?xml version="1.0"?><deepdraw xmlns="https://deepdraw.local/document"><![CDATA[${json.replace(/]]>/g, "]]]]><![CDATA[>")}]]></deepdraw>`;
    expect(isDocumentCustomXml(old)).toBe(true);
    expect(readCustomXmlJson(old)).toBe(json);
  });
});

// D74, both found by opening real exports in desktop Word.
describe("what Word needs from the package", () => {
  const parts = boilerplateParts(1, '{"format":"nedito"}');
  const part = (path: string) => parts.find((p) => p.path === path)?.data ?? "";

  it("relates the embedded source from the main document, where Word looks for it", () => {
    expect(documentRels([])).toContain('Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/customXml" Target="../customXml/item1.xml"');
    expect(part("_rels/.rels")).not.toContain("customXml");
  });

  it("declares the current compatibility mode, so Word does not open it in Compatibility Mode", () => {
    expect(part("word/settings.xml")).toContain('w:name="compatibilityMode"');
    expect(part("word/settings.xml")).toContain('w:val="15"');
    expect(documentRels([])).toContain('Target="settings.xml"');
    expect(part("[Content_Types].xml")).toContain('PartName="/word/settings.xml"');
  });
});

describe("decodeDocx", () => {
  async function docxWith(part: string | null): Promise<ArrayBuffer> {
    const entries = [{ path: "word/document.xml", data: "<w:document/>" }];
    if (part !== null) entries.push({ path: "customXml/item1.xml", data: part });
    const zip = await createZip(entries);
    return zip.buffer.slice(zip.byteOffset, zip.byteOffset + zip.byteLength) as ArrayBuffer;
  }

  it("reads a document back out of a Word file this app wrote", async () => {
    const doc = treeDoc();
    const { encodeDoc } = await import("../../file/documentFormat");
    const result = await decodeDocx(await docxWith(customXmlItem(encodeDoc(doc))));

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.doc.meta.title).toBe("Architecture");
      expect(Object.keys(result.doc.diagrams)).toHaveLength(3);
    }
  });

  // Word renumbers custom XML parts on save; its own can take item1.
  it("finds the source by its namespace after Word has renumbered the part", async () => {
    const { encodeDoc } = await import("../../file/documentFormat");
    const zip = await createZip([
      { path: "word/document.xml", data: "<w:document/>" },
      { path: "customXml/item1.xml", data: '<b:Sources xmlns:b="http://schemas.openxmlformats.org/officeDocument/2006/bibliography"/>' },
      { path: "customXml/item2.xml", data: customXmlItem(encodeDoc(treeDoc())) },
    ]);
    const result = await decodeDocx(zip.buffer.slice(zip.byteOffset, zip.byteOffset + zip.byteLength) as ArrayBuffer);
    expect(result.ok).toBe(true);
  });

  it("says plainly that an ordinary Word file has no diagram in it", async () => {
    const result = await decodeDocx(await docxWith(null));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("doesn't carry");
  });

  it("rejects something that isn't a Word file at all, without throwing", async () => {
    const result = await decodeDocx(new TextEncoder().encode("plain text").buffer as ArrayBuffer);
    expect(result.ok).toBe(false);
  });
});

describe("documentXml", () => {
  it("closes with a Letter-portrait section matching the figure width", () => {
    const xml = documentXml("<w:p/>");
    expect(xml).toContain('<w:pgSz w:w="12240" w:h="15840"/>');
    expect(xml).toContain('w:left="1440"');
  });
});
