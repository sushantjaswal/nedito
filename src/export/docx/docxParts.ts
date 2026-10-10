// The boilerplate parts of a .docx: content types, relationships, styles, and the custom XML
// part that carries the original document.
//
// Same approach as the PowerPoint export (D58) and for the same reason — the mechanisms this
// item needs (a drawing hyperlinked to a bookmark, a custom XML part) are ones a general
// document library would have to be post-processed for anyway.

import { BRAND, LEGACY_BRANDS } from "../../app/brand";

export const DECL = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';

export const NS_W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
export const NS_R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
export const NS_A = "http://schemas.openxmlformats.org/drawingml/2006/main";
export const NS_WP = "http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing";
export const NS_PIC = "http://schemas.openxmlformats.org/drawingml/2006/picture";
export const NS_WPS = "http://schemas.microsoft.com/office/word/2010/wordprocessingShape";

/** EMU per CSS pixel at 96dpi. */
export const EMU_PER_PX = 9525;

/** US Letter with 1in margins: 6.5in of usable width. */
export const CONTENT_WIDTH_EMU = Math.round(6.5 * 914400);

export function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * A Word bookmark name: letters, digits and underscores only, and never starting with a digit.
 * Figure bookmarks are generated rather than user-supplied, but the rule is enforced here
 * because a malformed name is silently dropped by Word and the link then goes nowhere.
 */
export function bookmarkName(index: number): string {
  return `ddFigure${index}`;
}

export function contentTypes(imageCount: number, hasCustomXml: boolean): string {
  void imageCount; // images are covered by the png Default below
  return (
    DECL +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '<Default Extension="png" ContentType="image/png"/>' +
    '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
    '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>' +
    '<Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/>' +
    (hasCustomXml
      ? '<Override PartName="/customXml/itemProps1.xml" ContentType="application/vnd.openxmlformats-officedocument.customXmlProperties+xml"/>'
      : "") +
    "</Types>"
  );
}

export function packageRels(): string {
  return (
    DECL +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    `<Relationship Id="rId1" Type="${NS_R}/officeDocument" Target="word/document.xml"/>` +
    "</Relationships>"
  );
}

export interface DocumentRel {
  id: string;
  /** "image" or "hyperlink". */
  kind: "image" | "hyperlink";
  target: string;
}

/**
 * The main document part's relationships. The custom XML part hangs off *this* part, not the
 * package root: Word only loads custom XML related from the main document, so a root-level
 * relationship left the embedded diagram invisible to Word and at risk of being dropped the first
 * time someone saved the file there — the round trip the part exists for (D74).
 */
export function documentRels(rels: DocumentRel[], hasCustomXml = true): string {
  const entries = rels
    .map((r) =>
      r.kind === "image"
        ? `<Relationship Id="${r.id}" Type="${NS_R}/image" Target="${esc(r.target)}"/>`
        : // An internal link is a relationship whose target is the bookmark fragment. No
          // TargetMode: this is a same-document reference, not an external URL.
          `<Relationship Id="${r.id}" Type="${NS_R}/hyperlink" Target="${esc(r.target)}"/>`,
    )
    .join("");
  return (
    DECL +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    `<Relationship Id="rIdStyles" Type="${NS_R}/styles" Target="styles.xml"/>` +
    `<Relationship Id="rIdSettings" Type="${NS_R}/settings" Target="settings.xml"/>` +
    (hasCustomXml ? `<Relationship Id="rIdCustomXml" Type="${NS_R}/customXml" Target="../customXml/item1.xml"/>` : "") +
    entries +
    "</Relationships>"
  );
}

/**
 * Heading 1/2/3 and Caption. Real Word style ids, so the appendix collapses natively and the
 * headings appear in the navigation pane — which is the whole point of using headings rather
 * than bold text.
 */
export function styles(): string {
  const heading = (level: number, size: number, color: string) =>
    `<w:style w:type="paragraph" w:styleId="Heading${level}">` +
    `<w:name w:val="heading ${level}"/><w:basedOn w:val="Normal"/><w:uiPriority w:val="9"/><w:qFormat/>` +
    // CT_PPr is an xsd:sequence: spacing (position 22) must precede outlineLvl (31). This was
    // written the other way round and Word opened it anyway — which is luck, not validity; it is
    // the same class of defect that made PowerPoint refuse our files (D61). Found by
    // docx/partOrder.test.ts, D73.
    `<w:pPr><w:keepNext/><w:spacing w:before="${level === 1 ? 360 : 240}" w:after="120"/><w:outlineLvl w:val="${level - 1}"/></w:pPr>` +
    `<w:rPr><w:b/><w:color w:val="${color}"/><w:sz w:val="${size}"/></w:rPr>` +
    "</w:style>";

  return (
    DECL +
    `<w:styles xmlns:w="${NS_W}">` +
    "<w:docDefaults><w:rPrDefault><w:rPr>" +
    '<w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/><w:sz w:val="22"/>' +
    "</w:rPr></w:rPrDefault></w:docDefaults>" +
    '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>' +
    heading(1, 32, "1E2733") +
    heading(2, 26, "1E2733") +
    heading(3, 24, "4B3BC4") +
    '<w:style w:type="paragraph" w:styleId="Caption"><w:name w:val="caption"/><w:basedOn w:val="Normal"/><w:qFormat/>' +
    '<w:pPr><w:spacing w:before="60" w:after="240"/></w:pPr>' +
    '<w:rPr><w:i/><w:color w:val="66707D"/><w:sz w:val="18"/></w:rPr></w:style>' +
    '<w:style w:type="character" w:styleId="Hyperlink"><w:name w:val="Hyperlink"/>' +
    '<w:rPr><w:color w:val="4B3BC4"/><w:u w:val="single"/></w:rPr></w:style>' +
    "</w:styles>"
  );
}

/**
 * Declares the file as a current-format document. Without it Word opens every export in
 * Compatibility Mode — Word 2007 layout rules and a "Compatibility Mode" title bar, as though the
 * file had been converted from an old .doc (D74). 15 is Word 2013 and later, what Word itself
 * writes today.
 */
export function settings(): string {
  return (
    DECL +
    `<w:settings xmlns:w="${NS_W}">` +
    '<w:compat><w:compatSetting w:name="compatibilityMode" w:uri="http://schemas.microsoft.com/office/word" w:val="15"/></w:compat>' +
    "</w:settings>"
  );
}

/**
 * The fixed parts of every export, in archive order; the caller adds the document body, its
 * relationships and the media. One list, shared with the schema-order test, so a part added here
 * is checked there without anyone remembering to.
 */
export function boilerplateParts(figureCount: number, docJson: string): { path: string; data: string }[] {
  return [
    { path: "[Content_Types].xml", data: contentTypes(figureCount, true) },
    { path: "_rels/.rels", data: packageRels() },
    { path: "word/styles.xml", data: styles() },
    { path: "word/settings.xml", data: settings() },
    { path: "customXml/item1.xml", data: customXmlItem(docJson) },
    { path: "customXml/itemProps1.xml", data: customXmlProps() },
    { path: "customXml/_rels/item1.xml.rels", data: customXmlRels() },
  ];
}

/**
 * The whole document, carried inside the docx as a custom XML part so the exported file stays
 * the source rather than becoming a dead picture — the spec's round-trip requirement. The JSON is
 * wrapped in an element because a custom XML part must be XML; it is put in a CDATA section so
 * braces, quotes and angle brackets survive untouched.
 *
 * Element and namespace are the brand's own (D100). Word files written before the rename used
 * `<deepdraw xmlns="https://deepdraw.local/document">`; those are read forever, never written.
 */
export const CUSTOM_XML_NS = `https://${BRAND.host}/ns/document`;
const CUSTOM_XML_ELEMENT = BRAND.formatId;

/** Every element name and namespace a docx of ours has ever used, current first. */
const KNOWN_PARTS: readonly { element: string; ns: string }[] = [
  { element: CUSTOM_XML_ELEMENT, ns: CUSTOM_XML_NS },
  ...LEGACY_BRANDS.map((b) => ({ element: b.formatId, ns: `https://${b.formatId}.local/document` })),
];

export function customXmlItem(docJson: string): string {
  // "]]>" cannot appear inside CDATA; splitting it across two sections is the standard escape
  // and reassembles to the identical string on read.
  const safe = docJson.replace(/]]>/g, "]]]]><![CDATA[>");
  return DECL + `<${CUSTOM_XML_ELEMENT} xmlns="${CUSTOM_XML_NS}"><![CDATA[${safe}]]></${CUSTOM_XML_ELEMENT}>`;
}

export function customXmlProps(): string {
  return (
    DECL +
    '<ds:datastoreItem xmlns:ds="http://schemas.openxmlformats.org/officeDocument/2006/customXml" ' +
    'ds:itemID="{4D9F1B2A-7C3E-4A5B-9E8D-1F2A3B4C5D6E}">' +
    `<ds:schemaRefs><ds:schemaRef ds:uri="${CUSTOM_XML_NS}"/></ds:schemaRefs>` +
    "</ds:datastoreItem>"
  );
}

export function customXmlRels(): string {
  return (
    DECL +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    `<Relationship Id="rId1" Type="${NS_R}/customXmlProps" Target="itemProps1.xml"/>` +
    "</Relationships>"
  );
}

/** Reads the JSON back out of a custom XML part — the other half of the round trip. */
export function readCustomXmlJson(xml: string): string | null {
  for (const { element } of KNOWN_PARTS) {
    const match = new RegExp(`<!\\[CDATA\\[([\\s\\S]*?)\\]\\]></${element}>`).exec(xml);
    if (match) return match[1].replace(/]]]]><!\[CDATA\[>/g, "]]>");
    // Word owns this part once someone saves the file there, and an XML serializer is free to
    // write the same text as escaped character data instead of CDATA. Same content, other form.
    const escaped = new RegExp(`<${element}\\b[^>]*>([^<]+)</${element}>`).exec(xml);
    if (!escaped) continue;
    return escaped[1]
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
      .replace(/&#x([0-9a-f]+);/gi, (_, n: string) => String.fromCodePoint(parseInt(n, 16)))
      .replace(/&amp;/g, "&");
  }
  return null;
}

/** True when a custom XML part is ours, whatever Word has since named it. */
export function isDocumentCustomXml(xml: string): boolean {
  return KNOWN_PARTS.some(({ ns }) => xml.includes(`xmlns="${ns}"`));
}
