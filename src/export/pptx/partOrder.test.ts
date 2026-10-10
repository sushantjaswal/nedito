import { describe, expect, it } from "vitest";
import { buildPptxPackage, type PptxSlide } from "./package";
import { readZip } from "./readZip.testutil";
import { formatGuid, slideLinkShape, slidePicture, slideXml, slideZoomFrame } from "./slideZoom";
import { FIRST_SLIDE_ID, SLIDE_H_EMU, SLIDE_W_EMU } from "./ooxml";
import { checkElement as walk, parse, violationsInParts, type Sequences, type Violation } from "../ooxmlOrder.testutil";

// OOXML types are declared as xsd:sequence, so child element ORDER is part of validity, not
// formatting. PowerPoint enforces it and reports a violation only as "PowerPoint can't read
// <file>" — no element named, no hint which part is wrong.
//
// One real defect shipped because nothing checked this: slideLayout1.xml emitted an empty
// <a:overrideClrMapping/>, whose twelve attributes are all required.
//
// A second suspected defect turned out not to be one. presentation.xml emitted sldIdLst before
// notesMasterIdLst, which the schema's sequence forbids — but a library whose output PowerPoint
// accepts emits exactly that order, so PowerPoint tolerates it and this was never the cause of
// the "can't read" failure. The order is written schema-correct anyway, because correct is
// cheap; the lesson recorded here is that a schema violation is not automatically the bug you
// are looking for, and that guessing without ground truth costs a round trip.

/**
 * Schema sequences for every element this exporter emits. Order is the schema's, not ours.
 *
 * An entry may be a single element name, or an array of names sharing one position — that is
 * how a repeating xsd:choice is expressed. `p:spTree` needs it: after the two group-property
 * elements, shapes may appear in any order and any number of times, so listing them as fixed
 * consecutive steps would flag a perfectly legal picture-then-shape slide.
 */
const SEQUENCES: Sequences = {
  "p:presentation": [
    "p:sldMasterIdLst",
    "p:notesMasterIdLst",
    "p:handoutMasterIdLst",
    "p:sldIdLst",
    "p:sldSz",
    "p:notesSz",
    "p:smartTags",
    "p:embeddedFontLst",
    "p:custShowLst",
    "p:photoAlbum",
    "p:custDataLst",
    "p:kinsoku",
    "p:defaultTextStyle",
    "p:modifyVerifier",
    "p:extLst",
  ],
  "p:sld": ["p:cSld", "p:clrMapOvr", "p:transition", "p:timing", "p:extLst"],
  "p:sldMaster": [
    "p:cSld",
    "p:clrMap",
    "p:sldLayoutIdLst",
    "p:transition",
    "p:timing",
    "p:hf",
    "p:txStyles",
    "p:extLst",
  ],
  "p:sldLayout": ["p:cSld", "p:clrMapOvr", "p:transition", "p:timing", "p:hf", "p:extLst"],
  "p:notesMaster": ["p:cSld", "p:clrMap", "p:hf", "p:notesStyle", "p:extLst"],
  "p:notes": ["p:cSld", "p:clrMapOvr", "p:extLst"],
  "p:cSld": ["p:bg", "p:spTree", "p:custDataLst", "p:controls", "p:extLst"],
  // The shape choice repeats in any order, but must still follow the group-property elements.
  // mc:AlternateContent may stand wherever a shape may (ECMA-376 Part 3); it is how a Slide Zoom
  // carries its fallback picture.
  "p:spTree": [
    "p:nvGrpSpPr",
    "p:grpSpPr",
    ["p:sp", "p:pic", "p:graphicFrame", "p:grpSp", "p:cxnSp", "mc:AlternateContent"],
  ],
  // ECMA-376 Part 3: one or more Choices, then at most one Fallback.
  "mc:AlternateContent": [["mc:Choice"], "mc:Fallback"],
  "p:nvGrpSpPr": ["p:cNvPr", "p:cNvGrpSpPr", "p:nvPr"],
  "p:nvSpPr": ["p:cNvPr", "p:cNvSpPr", "p:nvPr"],
  "p:nvPicPr": ["p:cNvPr", "p:cNvPicPr", "p:nvPr"],
  "p:nvGraphicFramePr": ["p:cNvPr", "p:cNvGraphicFramePr", "p:nvPr"],
  "p:sp": ["p:nvSpPr", "p:spPr", "p:style", "p:txBody", "p:extLst"],
  "p:pic": ["p:nvPicPr", "p:blipFill", "p:spPr", "p:style", "p:extLst"],
  "p:graphicFrame": ["p:nvGraphicFramePr", "p:xfrm", "a:graphic", "p:extLst"],
  "a:theme": ["a:themeElements", "a:objectDefaults", "a:extraClrSchemeLst", "a:custClrLst", "a:extLst"],
  "a:themeElements": ["a:clrScheme", "a:fontScheme", "a:fmtScheme"],
  "a:fmtScheme": ["a:fillStyleLst", "a:lnStyleLst", "a:effectStyleLst", "a:bgFillStyleLst"],
  "a:xfrm": ["a:off", "a:ext"],
  "a:fontScheme": ["a:majorFont", "a:minorFont"],
  // CT_ZoomObjectProperties, from [MS-PPTX].
  "pslz:zmPr": ["p166:blipFill", "p166:spPr"],
};

/** Every attribute CT_ColorMapping requires; an override missing any of them is invalid. */
const COLOR_MAP_ATTRS = [
  "bg1",
  "tx1",
  "bg2",
  "tx2",
  "accent1",
  "accent2",
  "accent3",
  "accent4",
  "accent5",
  "accent6",
  "hlink",
  "folHlink",
];

/** PowerPoint's one rule that is not about order: a colour-mapping override needs all twelve slots. */
function colourMapping(el: Element, path: string, out: Violation[]): void {
  if (el.nodeName !== "a:overrideClrMapping") return;
  const missing = COLOR_MAP_ATTRS.filter((a) => !el.hasAttribute(a));
  if (missing.length > 0) {
    out.push({ path, message: `<a:overrideClrMapping> is missing required attributes: ${missing.join(", ")}` });
  }
}

/** The shared walker (../ooxmlOrder.testutil.ts) with PowerPoint's sequences and rule. */
function checkElement(el: Element, path: string, out: Violation[]): void {
  walk(el, path, out, SEQUENCES, colourMapping);
}

async function violationsIn(slides: PptxSlide[]): Promise<Violation[]> {
  return violationsInParts(await readZip(await buildPptxPackage(slides)), SEQUENCES, colourMapping);
}

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);

function deck(navigation: "zoom" | "link", withNotes: boolean): PptxSlide[] {
  const picture = slidePicture({
    shapeId: 2,
    name: "Diagram",
    frame: { x: 0, y: 0, w: SLIDE_W_EMU, h: SLIDE_H_EMU },
    imageRelId: "rId2",
  });
  const navShape =
    navigation === "zoom"
      ? slideZoomFrame({
          shapeId: 3,
          name: "Nested block",
          frame: { x: 10, y: 20, w: 300, h: 400 },
          targetSlideId: FIRST_SLIDE_ID + 1,
          coverImageRelId: "rId3",
          fallbackLinkRelId: "rId4",
          guid: formatGuid("abc"),
          returnToParent: true,
        })
      : slideLinkShape({ shapeId: 3, name: "Nested block", frame: { x: 10, y: 20, w: 300, h: 400 }, linkRelId: "rId3" });

  const first: PptxSlide = {
    xml: slideXml({ title: "Main", body: picture + navShape }),
    media:
      navigation === "zoom"
        ? [
            { fileName: "image1.png", bytes: PNG, relId: "rId2" },
            { fileName: "image2.png", bytes: PNG, relId: "rId3" },
          ]
        : [{ fileName: "image1.png", bytes: PNG, relId: "rId2" }],
    links: [{ relId: navigation === "link" ? "rId3" : "rId4", targetSlideNumber: 2 }],
  };
  const second: PptxSlide = {
    xml: slideXml({ title: "Child", body: picture }),
    media: [{ fileName: "image3.png", bytes: PNG, relId: "rId2" }],
  };
  if (withNotes) {
    first.notes = "Main";
    second.notes = "Main › Child";
  }
  return [first, second];
}

describe("every generated part obeys its schema sequence", () => {
  it("holds for a Slide Zoom deck with notes", async () => {
    expect(await violationsIn(deck("zoom", true))).toEqual([]);
  });

  it("holds for a plain-links deck with notes", async () => {
    expect(await violationsIn(deck("link", true))).toEqual([]);
  });

  it("holds for a deck with no notes at all", async () => {
    expect(await violationsIn(deck("zoom", false))).toEqual([]);
  });

  // Schema-correct order, kept even though PowerPoint turns out to tolerate the reverse.
  it("puts notesMasterIdLst before sldIdLst in presentation.xml", async () => {
    const parts = await readZip(await buildPptxPackage(deck("zoom", true)));
    const xml = new TextDecoder().decode(parts.get("ppt/presentation.xml")!);
    expect(xml.indexOf("<p:notesMasterIdLst>")).toBeGreaterThan(-1);
    expect(xml.indexOf("<p:notesMasterIdLst>")).toBeLessThan(xml.indexOf("<p:sldIdLst>"));
  });

  it("never emits an attribute-less colour-mapping override", async () => {
    const parts = await readZip(await buildPptxPackage(deck("zoom", true)));
    const layout = new TextDecoder().decode(parts.get("ppt/slideLayouts/slideLayout1.xml")!);
    expect(layout).not.toContain("<a:overrideClrMapping/>");
    expect(layout).toContain("<a:masterClrMapping/>");
  });
});

describe("the order checker itself", () => {
  // A checker that cannot fail is worth nothing, so prove it catches the real defect.
  it("catches a sequence violation when one is present", () => {
    const bad =
      '<p:presentation xmlns:p="p" xmlns:r="r"><p:sldMasterIdLst/><p:sldIdLst/><p:notesMasterIdLst/></p:presentation>';
    const out: Violation[] = [];
    checkElement(parse(bad, "bad.xml").documentElement, "bad.xml", out);
    expect(out).toHaveLength(1);
    expect(out[0].message).toContain("p:notesMasterIdLst");
  });

  it("accepts shapes in either order inside spTree, which is a repeating choice", () => {
    const both = [
      '<p:spTree xmlns:p="p"><p:nvGrpSpPr/><p:grpSpPr/><p:pic/><p:sp/><p:pic/></p:spTree>',
      '<p:spTree xmlns:p="p"><p:nvGrpSpPr/><p:grpSpPr/><p:sp/><p:pic/></p:spTree>',
    ];
    for (const xml of both) {
      const out: Violation[] = [];
      checkElement(parse(xml, "ok.xml").documentElement, "ok.xml", out);
      expect(out).toEqual([]);
    }
  });

  it("still rejects a shape placed before the group properties", () => {
    const bad = '<p:spTree xmlns:p="p"><p:nvGrpSpPr/><p:pic/><p:grpSpPr/></p:spTree>';
    const out: Violation[] = [];
    checkElement(parse(bad, "bad.xml").documentElement, "bad.xml", out);
    expect(out).toHaveLength(1);
  });

  it("catches an attribute-less overrideClrMapping", () => {
    const bad = '<p:clrMapOvr xmlns:p="p" xmlns:a="a"><a:overrideClrMapping/></p:clrMapOvr>';
    const out: Violation[] = [];
    checkElement(parse(bad, "bad.xml").documentElement, "bad.xml", out);
    expect(out).toHaveLength(1);
    expect(out[0].message).toContain("missing required attributes");
  });
});
