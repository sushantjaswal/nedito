import { describe, expect, it } from "vitest";
import { buildPptxPackage, type PptxSlide } from "./package";
import { readZip, readZipText } from "./readZip.testutil";
import { formatGuid, slidePicture, slideXml, slideZoomFrame, NS_MC, NS_P166, NS_SLIDE_ZOOM } from "./slideZoom";
import { FIRST_SLIDE_ID, NS_P, SLIDE_H_EMU, SLIDE_W_EMU } from "./ooxml";

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** The two-slide deck the spec asks to prototype: a parent with one zoom into its child. */
function zoomDeck(): PptxSlide[] {
  const parentBody =
    slidePicture({
      shapeId: 2,
      name: "Main diagram",
      frame: { x: 0, y: 0, w: SLIDE_W_EMU, h: SLIDE_H_EMU },
      imageRelId: "rId2",
    }) +
    slideZoomFrame({
      shapeId: 3,
      name: "Nested block: Payments",
      frame: { x: 100, y: 200, w: 300, h: 400 },
      targetSlideId: FIRST_SLIDE_ID + 1,
      coverImageRelId: "rId3",
      fallbackLinkRelId: "rId4",
      guid: formatGuid("abc"),
      returnToParent: true,
    });

  return [
    {
      xml: slideXml({ title: "Main", body: parentBody }),
      media: [
        { fileName: "image1.png", bytes: PNG, relId: "rId2" },
        { fileName: "image2.png", bytes: PNG, relId: "rId3" },
      ],
      links: [{ relId: "rId4", targetSlideNumber: 2 }],
      notes: "Main",
    },
    {
      xml: slideXml({
        title: "Payments",
        body: slidePicture({
          shapeId: 2,
          name: "Payments diagram",
          frame: { x: 0, y: 0, w: SLIDE_W_EMU, h: SLIDE_H_EMU },
          imageRelId: "rId2",
        }),
      }),
      media: [{ fileName: "image3.png", bytes: PNG, relId: "rId2" }],
      notes: "Main › Payments",
    },
  ];
}

function parse(xml: string): Document {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  if (doc.querySelector("parsererror")) throw new Error(`not well-formed: ${xml.slice(0, 200)}`);
  return doc;
}

describe("buildPptxPackage — OOXML package structure", () => {
  it("contains every part a .pptx needs to open at all", async () => {
    const parts = await readZip(await buildPptxPackage(zoomDeck()));
    for (const required of [
      "[Content_Types].xml",
      "_rels/.rels",
      "ppt/presentation.xml",
      "ppt/_rels/presentation.xml.rels",
      "ppt/slideMasters/slideMaster1.xml",
      "ppt/slideLayouts/slideLayout1.xml",
      "ppt/theme/theme1.xml",
      "ppt/slides/slide1.xml",
      "ppt/slides/slide2.xml",
      "ppt/slides/_rels/slide1.xml.rels",
    ]) {
      expect([...parts.keys()], `${required} missing`).toContain(required);
    }
  });

  it("emits well-formed XML in every XML part", async () => {
    const parts = await readZip(await buildPptxPackage(zoomDeck()));
    for (const [path, bytes] of parts) {
      if (!path.endsWith(".xml") && !path.endsWith(".rels")) continue;
      expect(() => parse(new TextDecoder().decode(bytes)), `${path} is malformed`).not.toThrow();
    }
  });

  // A relationship pointing at a part that isn't in the package is precisely the fault
  // PowerPoint reports only as "repair", with no clue which one.
  it("resolves every relationship target to a part that exists", async () => {
    const parts = await readZip(await buildPptxPackage(zoomDeck()));
    const names = new Set(parts.keys());

    for (const [path, bytes] of parts) {
      if (!path.endsWith(".rels")) continue;
      // A .rels file's targets are relative to the directory its _rels folder sits in, which
      // for the package-root "_rels/.rels" is the root itself.
      const marker = path.lastIndexOf("/_rels/");
      const baseDir = marker === -1 ? "" : path.slice(0, marker);
      const doc = parse(new TextDecoder().decode(bytes));
      for (const rel of Array.from(doc.getElementsByTagName("Relationship"))) {
        if (rel.getAttribute("TargetMode") === "External") continue;
        const target = rel.getAttribute("Target")!;
        const resolved = new URL(target, `file:///${baseDir}/x`).pathname.replace(/^\/+/, "");
        expect(names, `${path}: ${rel.getAttribute("Id")} -> ${target}`).toContain(resolved);
      }
    }
  });

  it("declares a content type for every part", async () => {
    const zip = await buildPptxPackage(zoomDeck());
    const types = await readZipText(zip, "[Content_Types].xml");
    const parts = await readZip(zip);

    for (const path of parts.keys()) {
      if (path === "[Content_Types].xml") continue;
      const extension = path.slice(path.lastIndexOf(".") + 1);
      const covered = types.includes(`Extension="${extension}"`) || types.includes(`PartName="/${path}"`);
      expect(covered, `${path} has no content type`).toBe(true);
    }
  });

  it("lists slides in presentation.xml with ids the zooms can point at", async () => {
    const xml = await readZipText(await buildPptxPackage(zoomDeck()), "ppt/presentation.xml");
    expect(xml).toContain(`<p:sldId id="${FIRST_SLIDE_ID}" r:id="rId2"/>`);
    expect(xml).toContain(`<p:sldId id="${FIRST_SLIDE_ID + 1}" r:id="rId3"/>`);
  });

  it("writes one media part per file even when slides share a name", async () => {
    const slides = zoomDeck();
    slides[1].media = [{ fileName: "image1.png", bytes: PNG, relId: "rId2" }]; // reuse slide 1's
    const parts = await readZip(await buildPptxPackage(slides));
    const media = [...parts.keys()].filter((p) => p.startsWith("ppt/media/"));
    expect(new Set(media).size).toBe(media.length);
  });

  // A duplicate rId inside one .rels is another silent "repair" cause.
  it("gives the notes relationship an id nothing else on the slide is using", async () => {
    const zip = await buildPptxPackage(zoomDeck());
    const rels = await readZipText(zip, "ppt/slides/_rels/slide1.xml.rels");
    const ids = Array.from(parse(rels).getElementsByTagName("Relationship")).map((r) => r.getAttribute("Id"));
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain("rId4"); // past rId1 (layout), rId2 and rId3 (media)
  });

  it("writes the breadcrumb into speaker notes", async () => {
    const xml = await readZipText(await buildPptxPackage(zoomDeck()), "ppt/notesSlides/notesSlide2.xml");
    expect(xml).toContain("Main › Payments");
  });

  it("omits the notes master entirely when no slide has notes", async () => {
    const slides = zoomDeck().map((s) => ({ ...s, notes: undefined }));
    const parts = await readZip(await buildPptxPackage(slides));
    expect([...parts.keys()].some((p) => p.includes("notesMaster"))).toBe(false);
  });
});

describe("the Slide Zoom element", () => {
  it("is built to the published MS-PPTX schema", async () => {
    const xml = await readZipText(await buildPptxPackage(zoomDeck()), "ppt/slides/slide1.xml");
    const doc = parse(xml);

    const frame = doc.getElementsByTagName("p:graphicFrame")[0];
    expect(frame).toBeDefined();
    const data = frame.getElementsByTagName("a:graphicData")[0];
    expect(data.getAttribute("uri")).toBe("http://schemas.microsoft.com/office/powerpoint/2016/slidezoom");

    const zoomObj = doc.getElementsByTagName("pslz:sldZmObj")[0];
    // sldId is the destination's p:sldId/@id — not its rId and not its 1-based position.
    expect(zoomObj.getAttribute("sldId")).toBe(String(FIRST_SLIDE_ID + 1));

    const zmPr = zoomObj.children[0];
    expect(zmPr.getAttribute("returnToParent")).toBe("1");
    // "cover" is the schema's word for a custom image; "custom" is not a valid value.
    expect(zmPr.getAttribute("imageType")).toBe("cover");
    expect(zmPr.getAttribute("id")).toMatch(/^\{[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}\}$/);
  });

  // D74. Checked by resolved namespace URI, never by prefix string: the first version of this
  // test asserted the prefixes the generator wrote, so it agreed with markup PowerPoint refused.
  // Each element takes the namespace of the schema that declares it (both are qualified).
  it("puts each zoom element in the namespace of the schema that declares it", async () => {
    const doc = parse(await readZipText(await buildPptxPackage(zoomDeck()), "ppt/slides/slide1.xml"));
    const zoomObj = doc.getElementsByTagName("pslz:sldZmObj")[0];
    const zmPr = zoomObj.children[0];
    const named = (el: Element) => `${el.namespaceURI} ${el.localName}`;

    expect(named(zmPr)).toBe(`${NS_SLIDE_ZOOM} zmPr`);
    // CT_ZoomObjectProperties: blipFill then spPr, both declared in the p166 schema.
    expect(Array.from(zmPr.children).map(named)).toEqual([`${NS_P166} blipFill`, `${NS_P166} spPr`]);
  });

  it("points its cover image at a relationship the slide actually declares", async () => {
    const zip = await buildPptxPackage(zoomDeck());
    const slide = parse(await readZipText(zip, "ppt/slides/slide1.xml"));
    const rels = parse(await readZipText(zip, "ppt/slides/_rels/slide1.xml.rels"));

    const embed = slide.getElementsByTagName("pslz:zmPr")[0].getElementsByTagName("a:blip")[0].getAttribute("r:embed");
    const declared = Array.from(rels.getElementsByTagName("Relationship")).map((r) => r.getAttribute("Id"));
    expect(declared).toContain(embed);
  });

  // D75: the envelope and the offset below are what PowerPoint wrote when it re-saved our deck.
  it("wraps the zoom in PowerPoint's own envelope: the zoom as the choice, a linked picture as fallback", async () => {
    const zip = await buildPptxPackage(zoomDeck());
    const doc = parse(await readZipText(zip, "ppt/slides/slide1.xml"));
    const named = (el: Element) => `${el.namespaceURI} ${el.localName}`;

    const envelope = doc.getElementsByTagNameNS(NS_MC, "AlternateContent")[0];
    expect(envelope.parentElement?.localName).toBe("spTree");
    const [choice, fallback] = Array.from(envelope.children);
    expect([named(choice), named(fallback)]).toEqual([`${NS_MC} Choice`, `${NS_MC} Fallback`]);

    // Requires names a *prefix*, which must resolve to the slidezoom namespace in scope.
    const required = choice.getAttribute("Requires")!;
    expect(choice.lookupNamespaceURI(required)).toBe(NS_SLIDE_ZOOM);
    expect(Array.from(choice.children).map(named)).toEqual([`${NS_P} graphicFrame`]);

    const picture = fallback.children[0];
    expect(named(picture)).toBe(`${NS_P} pic`);
    // One shape: the reader sees the choice or the fallback, never both, so they share an id.
    const ids = Array.from(envelope.getElementsByTagName("p:cNvPr")).map((c) => c.getAttribute("id"));
    expect(new Set(ids).size).toBe(1);

    // The fallback link must land on the zoom's own destination slide.
    const link = picture.getElementsByTagName("a:hlinkClick")[0];
    expect(link.getAttribute("action")).toBe("ppaction://hlinksldjump");
    const rels = parse(await readZipText(zip, "ppt/slides/_rels/slide1.xml.rels"));
    const rel = Array.from(rels.getElementsByTagName("Relationship")).find((r) => r.getAttribute("Id") === link.getAttribute("r:id"));
    expect(rel?.getAttribute("Target")).toBe("slide2.xml");
  });

  it("places the zoom image at the origin of its frame, not at the frame's slide position", async () => {
    const doc = parse(await readZipText(await buildPptxPackage(zoomDeck()), "ppt/slides/slide1.xml"));
    const off = doc.getElementsByTagName("pslz:zmPr")[0].getElementsByTagName("a:off")[0];
    expect([off.getAttribute("x"), off.getAttribute("y")]).toEqual(["0", "0"]);
    // The frame itself still sits where the nested block is.
    const frameOff = doc.getElementsByTagName("p:xfrm")[0].getElementsByTagName("a:off")[0];
    expect([frameOff.getAttribute("x"), frameOff.getAttribute("y")]).toEqual(["100", "200"]);
  });

  it("omits transitionDur entirely when none was asked for, inheriting the slide's own", async () => {
    const xml = await readZipText(await buildPptxPackage(zoomDeck()), "ppt/slides/slide1.xml");
    expect(xml).not.toContain("transitionDur");
  });
});
