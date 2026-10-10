// The Word export's parts, walked against WordprocessingML's schema order.
//
// PowerPoint had this check (D61) because it refused three of our files before we found out why.
// Word had none: it opened our files, so nothing looked wrong — but Word is not a validator, it is
// a tolerant reader, and "it opens today" says nothing about the next element someone adds. The
// PowerPoint defects were exactly this class: children in an order the xsd:sequence forbids.
//
// The package is assembled here from the same part generators exportDocx uses, so no image has to
// be rasterised; only the PNG bytes are stand-ins.
import { describe, expect, it } from "vitest";
import { createZip, type ZipEntry } from "../pptx/zip";
import { readZip } from "../pptx/readZip.testutil";
import { checkElement, parse, violationsInParts, type Sequences, type Violation } from "../ooxmlOrder.testutil";
import { documentXml, figureParagraph, heading, internalLinkParagraph, paragraph } from "./docxBody";
import { boilerplateParts, bookmarkName, documentRels } from "./docxParts";

/** ECMA-376 sequences for every element the Word exporter emits. Order is the schema's. */
const SEQUENCES: Sequences = {
  // CT_Document, CT_Body: block content repeats in any order, then the section properties last.
  "w:document": ["w:background", "w:body"],
  "w:body": [["w:p", "w:tbl", "w:sdt", "w:customXml", "w:bookmarkStart", "w:bookmarkEnd"], "w:sectPr"],
  // CT_P: paragraph properties first, then any mix of run-level content.
  "w:p": ["w:pPr", ["w:r", "w:hyperlink", "w:bookmarkStart", "w:bookmarkEnd", "w:fldSimple", "w:proofErr"]],
  // CT_PPrBase, then CT_PPr's own tail.
  "w:pPr": [
    "w:pStyle",
    "w:keepNext",
    "w:keepLines",
    "w:pageBreakBefore",
    "w:framePr",
    "w:widowControl",
    "w:numPr",
    "w:suppressLineNumbers",
    "w:pBdr",
    "w:shd",
    "w:tabs",
    "w:suppressAutoHyphens",
    "w:kinsoku",
    "w:wordWrap",
    "w:overflowPunct",
    "w:topLinePunct",
    "w:autoSpaceDE",
    "w:autoSpaceDN",
    "w:bidi",
    "w:adjustRightInd",
    "w:snapToGrid",
    "w:spacing",
    "w:ind",
    "w:contextualSpacing",
    "w:mirrorIndents",
    "w:suppressOverlap",
    "w:jc",
    "w:textDirection",
    "w:textAlignment",
    "w:textboxTightWrap",
    "w:outlineLvl",
    "w:divId",
    "w:cnfStyle",
    "w:rPr",
    "w:sectPr",
    "w:pPrChange",
  ],
  "w:r": ["w:rPr", ["w:t", "w:drawing", "w:br", "w:tab", "w:fldChar", "w:instrText"]],
  // EG_RPrBase.
  "w:rPr": [
    "w:rStyle",
    "w:rFonts",
    "w:b",
    "w:bCs",
    "w:i",
    "w:iCs",
    "w:caps",
    "w:smallCaps",
    "w:strike",
    "w:dstrike",
    "w:outline",
    "w:shadow",
    "w:emboss",
    "w:imprint",
    "w:noProof",
    "w:snapToGrid",
    "w:vanish",
    "w:webHidden",
    "w:color",
    "w:spacing",
    "w:w",
    "w:kern",
    "w:position",
    "w:sz",
    "w:szCs",
    "w:highlight",
    "w:u",
    "w:effect",
    "w:bdr",
    "w:shd",
    "w:fitText",
    "w:vertAlign",
    "w:rtl",
    "w:cs",
    "w:em",
    "w:lang",
    "w:eastAsianLayout",
    "w:specVanish",
    "w:oMath",
  ],
  "w:sectPr": [
    ["w:headerReference", "w:footerReference"],
    "w:footnotePr",
    "w:endnotePr",
    "w:type",
    "w:pgSz",
    "w:pgMar",
    "w:paperSrc",
    "w:pgBorders",
    "w:lnNumType",
    "w:pgNumType",
    "w:cols",
    "w:formProt",
    "w:vAlign",
    "w:noEndnote",
    "w:titlePg",
    "w:textDirection",
    "w:bidi",
    "w:rtlGutter",
    "w:docGrid",
  ],
  // CT_Styles, CT_DocDefaults, CT_Style.
  "w:styles": ["w:docDefaults", "w:latentStyles", "w:style"],
  "w:docDefaults": ["w:rPrDefault", "w:pPrDefault"],
  "w:style": [
    "w:name",
    "w:aliases",
    "w:basedOn",
    "w:next",
    "w:link",
    "w:autoRedefine",
    "w:hidden",
    "w:uiPriority",
    "w:semiHidden",
    "w:unhideWhenUsed",
    "w:qFormat",
    "w:locked",
    "w:personal",
    "w:personalCompose",
    "w:personalReply",
    "w:rsid",
    "w:pPr",
    "w:rPr",
    "w:tblPr",
    "w:trPr",
    "w:tcPr",
    "w:tblStylePr",
  ],
  // DrawingML in WordprocessingML: CT_Inline, CT_Anchor.
  "wp:inline": ["wp:extent", "wp:effectExtent", "wp:docPr", "wp:cNvGraphicFramePr", "a:graphic"],
  "wp:anchor": [
    "wp:simplePos",
    "wp:positionH",
    "wp:positionV",
    "wp:extent",
    "wp:effectExtent",
    ["wp:wrapNone", "wp:wrapSquare", "wp:wrapTight", "wp:wrapThrough", "wp:wrapTopAndBottom"],
    "wp:docPr",
    "wp:cNvGraphicFramePr",
    "a:graphic",
  ],
  "wp:docPr": ["a:hlinkClick", "a:hlinkHover", "a:extLst"],
  "pic:pic": ["pic:nvPicPr", "pic:blipFill", "pic:spPr"],
  "pic:nvPicPr": ["pic:cNvPr", "pic:cNvPicPr"],
  "pic:blipFill": ["a:blip", "a:srcRect", ["a:tile", "a:stretch"]],
  // CT_ShapeProperties, shared by pictures and Word shapes.
  "pic:spPr": ["a:xfrm", ["a:custGeom", "a:prstGeom"], ["a:noFill", "a:solidFill", "a:gradFill", "a:blipFill"], "a:ln"],
  "wps:spPr": ["a:xfrm", ["a:custGeom", "a:prstGeom"], ["a:noFill", "a:solidFill", "a:gradFill", "a:blipFill"], "a:ln"],
  "wps:wsp": ["wps:cNvPr", ["wps:cNvSpPr", "wps:cNvCnPr"], "wps:spPr", "wps:style", "wps:extLst", ["wps:txbx", "wps:linkedTxbx"], "wps:bodyPr"],
  "a:xfrm": ["a:off", "a:ext"],
  "a:ln": [["a:noFill", "a:solidFill", "a:gradFill"], "a:prstDash", ["a:round", "a:bevel", "a:miter"], "a:headEnd", "a:tailEnd"],
};

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);

/**
 * A two-figure package in the shape exportDocx builds: a title, a bookmarked first figure with a
 * clickable overlay into the second, a caption, the text link, and the appendix heading.
 */
async function samplePackage(): Promise<Map<string, Uint8Array>> {
  const body =
    heading("Order handling", 1) +
    '<w:p><w:bookmarkStart w:id="1" w:name="ddFigure1"/><w:bookmarkEnd w:id="1"/></w:p>' +
    figureParagraph({
      imageRelId: "rId1",
      widthEmu: 5_000_000,
      heightEmu: 3_000_000,
      docPrId: 1001,
      name: "Order handling diagram",
      overlays: [
        { docPrId: 1002, name: "Link to Figure 2", x: 100, y: 200, w: 300, h: 400, linkRelId: "rId3", tooltip: "Open Figure 2" },
      ],
    }) +
    paragraph("Figure 1. Order handling", "Caption") +
    internalLinkParagraph("↓ Open Figure 2: Validate payment", bookmarkName(2)) +
    heading("Diagram Appendix", 1) +
    heading("1. Validate payment", 2, { id: 2, name: bookmarkName(2) }) +
    internalLinkParagraph("↑ Return to Figure 1", bookmarkName(1));

  const entries: ZipEntry[] = [
    ...boilerplateParts(2, '{"format":"nedito"}'),
    { path: "word/document.xml", data: documentXml(body) },
    {
      path: "word/_rels/document.xml.rels",
      data: documentRels([
        { id: "rId1", kind: "image", target: "media/image1.png" },
        { id: "rId2", kind: "image", target: "media/image2.png" },
        { id: "rId3", kind: "hyperlink", target: `#${bookmarkName(2)}` },
      ]),
    },
    { path: "word/media/image1.png", data: PNG, store: true },
    { path: "word/media/image2.png", data: PNG, store: true },
  ];
  return readZip(await createZip(entries));
}

describe("every generated Word part obeys its schema sequence", () => {
  it("holds across document, styles, relationships and custom XML", async () => {
    const violations = violationsInParts(await samplePackage(), SEQUENCES);
    expect(violations, violations.map((v) => `${v.path}: ${v.message}`).join("\n")).toEqual([]);
  });

  it("covers the parts that matter, so a silent pass means something", async () => {
    const parts = await samplePackage();
    for (const path of ["word/document.xml", "word/styles.xml", "[Content_Types].xml", "word/_rels/document.xml.rels"]) {
      expect(parts.has(path), `${path} was not generated`).toBe(true);
    }
  });
});

describe("the Word sequence table", () => {
  // A checker that cannot fail is worth nothing.
  it("catches paragraph properties in the wrong order", () => {
    const bad = '<w:pPr xmlns:w="w"><w:keepNext/><w:outlineLvl w:val="0"/><w:spacing/></w:pPr>';
    const out: Violation[] = [];
    checkElement(parse(bad, "bad.xml").documentElement, "bad.xml", out, SEQUENCES);
    expect(out).toHaveLength(1);
    expect(out[0].message).toContain("w:spacing");
  });

  it("catches section properties that are not last in the body", () => {
    const bad = '<w:body xmlns:w="w"><w:p/><w:sectPr/><w:p/></w:body>';
    const out: Violation[] = [];
    checkElement(parse(bad, "bad.xml").documentElement, "bad.xml", out, SEQUENCES);
    expect(out).toHaveLength(1);
  });

  it("accepts paragraphs and bookmarks interleaved, which the body allows", () => {
    const ok = '<w:body xmlns:w="w"><w:p/><w:bookmarkStart/><w:p/><w:bookmarkEnd/><w:p/><w:sectPr/></w:body>';
    const out: Violation[] = [];
    checkElement(parse(ok, "ok.xml").documentElement, "ok.xml", out, SEQUENCES);
    expect(out).toEqual([]);
  });
});
