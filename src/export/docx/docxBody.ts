// Document body: headings, figures, bookmarks, and the transparent hyperlinked rectangles that
// make a nested block clickable.
//
// Word has no image map, so a clickable region over a picture has to be a separately anchored
// shape floating on top of it — which is what the spec calls for and what this builds.
import { esc, NS_A, NS_PIC, NS_R, NS_W, NS_WP, NS_WPS } from "./docxParts";

export function paragraph(text: string, style?: string): string {
  const pPr = style ? `<w:pPr><w:pStyle w:val="${style}"/></w:pPr>` : "";
  return `<w:p>${pPr}<w:r><w:t xml:space="preserve">${esc(text)}</w:t></w:r></w:p>`;
}

export function heading(text: string, level: 1 | 2 | 3, bookmark?: { id: number; name: string }): string {
  const start = bookmark ? `<w:bookmarkStart w:id="${bookmark.id}" w:name="${bookmark.name}"/>` : "";
  const end = bookmark ? `<w:bookmarkEnd w:id="${bookmark.id}"/>` : "";
  return (
    `<w:p><w:pPr><w:pStyle w:val="Heading${level}"/></w:pPr>` +
    start +
    `<w:r><w:t xml:space="preserve">${esc(text)}</w:t></w:r>` +
    end +
    "</w:p>"
  );
}

/**
 * A run of text linking to a bookmark elsewhere in the document. `w:hyperlink/@w:anchor` is the
 * plain, unambiguous form of an internal link and needs no relationship at all — which is why
 * the "Return to Figure N" links use it rather than the drawing mechanism below.
 */
export function internalLinkParagraph(text: string, anchor: string, style?: string): string {
  const pPr = style ? `<w:pPr><w:pStyle w:val="${style}"/></w:pPr>` : "";
  return (
    `<w:p>${pPr}<w:hyperlink w:anchor="${esc(anchor)}">` +
    `<w:r><w:rPr><w:rStyle w:val="Hyperlink"/></w:rPr><w:t xml:space="preserve">${esc(text)}</w:t></w:r>` +
    "</w:hyperlink></w:p>"
  );
}

export interface FigureOptions {
  imageRelId: string;
  widthEmu: number;
  heightEmu: number;
  /** Shape id, unique across the document. */
  docPrId: number;
  name: string;
  /** Floating hyperlinked rectangles drawn over this picture, in image-relative EMU. */
  overlays?: OverlayLink[];
}

export interface OverlayLink {
  docPrId: number;
  name: string;
  /** Position relative to the picture's top-left, in EMU. */
  x: number;
  y: number;
  w: number;
  h: number;
  /** Relationship id whose target is "#bookmark". */
  linkRelId: string;
  tooltip?: string;
}

/**
 * A transparent, borderless rectangle floating over the figure, carrying a hyperlink.
 *
 * The link lives on `wp:docPr/a:hlinkClick` and points at a relationship whose target is the
 * bookmark fragment — `a:hlinkClick` has no anchor attribute of its own, so a same-document
 * link has to be expressed as a relationship to `#name`.
 *
 * `behindDoc="0"` and `allowOverlap="1"` matter: the shape has to sit *above* the picture to be
 * clickable at all, and Word will otherwise push overlapping anchored shapes apart.
 */
function overlayShape(overlay: OverlayLink): string {
  const tooltip = overlay.tooltip ? ` tooltip="${esc(overlay.tooltip)}"` : "";
  return (
    "<w:r><w:drawing>" +
    `<wp:anchor xmlns:wp="${NS_WP}" distT="0" distB="0" distL="0" distR="0" simplePos="0"` +
    ` relativeHeight="${100 + overlay.docPrId}" behindDoc="0" locked="0" layoutInCell="1" allowOverlap="1">` +
    '<wp:simplePos x="0" y="0"/>' +
    `<wp:positionH relativeFrom="column"><wp:posOffset>${Math.round(overlay.x)}</wp:posOffset></wp:positionH>` +
    `<wp:positionV relativeFrom="paragraph"><wp:posOffset>${Math.round(overlay.y)}</wp:posOffset></wp:positionV>` +
    `<wp:extent cx="${Math.round(overlay.w)}" cy="${Math.round(overlay.h)}"/>` +
    '<wp:effectExtent l="0" t="0" r="0" b="0"/><wp:wrapNone/>' +
    `<wp:docPr id="${overlay.docPrId}" name="${esc(overlay.name)}">` +
    `<a:hlinkClick xmlns:a="${NS_A}" xmlns:r="${NS_R}" r:id="${overlay.linkRelId}"${tooltip}/>` +
    "</wp:docPr>" +
    `<wp:cNvGraphicFramePr/>` +
    `<a:graphic xmlns:a="${NS_A}"><a:graphicData uri="${NS_WPS}">` +
    `<wps:wsp xmlns:wps="${NS_WPS}">` +
    '<wps:cNvSpPr/>' +
    `<wps:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${Math.round(overlay.w)}" cy="${Math.round(overlay.h)}"/></a:xfrm>` +
    '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/><a:ln><a:noFill/></a:ln></wps:spPr>' +
    '<wps:bodyPr/>' +
    "</wps:wsp></a:graphicData></a:graphic>" +
    "</wp:anchor>" +
    "</w:drawing></w:r>"
  );
}

export function figureParagraph(options: FigureOptions): string {
  const picture =
    "<w:r><w:drawing>" +
    `<wp:inline xmlns:wp="${NS_WP}" distT="0" distB="0" distL="0" distR="0">` +
    `<wp:extent cx="${options.widthEmu}" cy="${options.heightEmu}"/>` +
    '<wp:effectExtent l="0" t="0" r="0" b="0"/>' +
    `<wp:docPr id="${options.docPrId}" name="${esc(options.name)}"/>` +
    '<wp:cNvGraphicFramePr><a:graphicFrameLocks xmlns:a="' +
    NS_A +
    '" noChangeAspect="1"/></wp:cNvGraphicFramePr>' +
    `<a:graphic xmlns:a="${NS_A}"><a:graphicData uri="${NS_PIC}">` +
    `<pic:pic xmlns:pic="${NS_PIC}">` +
    `<pic:nvPicPr><pic:cNvPr id="${options.docPrId}" name="${esc(options.name)}"/><pic:cNvPicPr/></pic:nvPicPr>` +
    `<pic:blipFill><a:blip xmlns:r="${NS_R}" r:embed="${options.imageRelId}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>` +
    `<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${options.widthEmu}" cy="${options.heightEmu}"/></a:xfrm>` +
    '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>' +
    "</pic:pic></a:graphicData></a:graphic></wp:inline>" +
    "</w:drawing></w:r>";

  // The overlays share the picture's paragraph so their column/paragraph-relative offsets are
  // measured from the same origin the picture starts at.
  const overlays = (options.overlays ?? []).map(overlayShape).join("");
  return `<w:p>${picture}${overlays}</w:p>`;
}

export function documentXml(body: string): string {
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
    `<w:document xmlns:w="${NS_W}" xmlns:r="${NS_R}" xmlns:a="${NS_A}" xmlns:wp="${NS_WP}" xmlns:pic="${NS_PIC}" xmlns:wps="${NS_WPS}">` +
    "<w:body>" +
    body +
    // Letter portrait, 1in margins — the page the CONTENT_WIDTH_EMU figure width assumes.
    '<w:sectPr><w:pgSz w:w="12240" w:h="15840"/>' +
    '<w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/>' +
    "</w:sectPr>" +
    "</w:body></w:document>"
  );
}
