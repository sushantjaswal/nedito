// Native PowerPoint Slide Zoom — the reason this exporter exists. Clicking a nested block in
// slideshow zooms into that child's slide and returns, which is the deck-native equivalent of
// Nedito's own drill-down and breadcrumb.
//
// Slide Zoom is a Microsoft extension, not part of ISO 29500, so no library emits it and the
// XML below is built strictly to the published schema:
//
//   [MS-PPTX] http://schemas.microsoft.com/office/powerpoint/2016/slidezoom
//     <pslz:sldZm><pslz:sldZmObj sldId="..." cId="..."><pslz:zmPr .../></pslz:sldZmObj></pslz:sldZm>
//   [MS-PPTX] CT_ZoomObjectProperties (the *type* lives in .../2016/6/main)
//     children: p166:blipFill (required), p166:spPr (required)
//     attrs: id (GUID, required), returnToParent (bool, default true),
//            imageType ("preview" | "cover", default "preview"),
//            transitionDur (optional), showBg (bool, default true)
//
// Two values here are easy to get wrong and worth naming:
//   * `sldId` is the destination's `p:sldId/@id` from presentation.xml (256, 257, …), NOT its
//     relationship id and NOT its 1-based position.
//   * a custom cover image is `imageType="cover"`, not "custom".
//
// And one that was got wrong, and made desktop PowerPoint refuse every deck containing a zoom as
// "corrupted and unreadable" (D74). Both schemas are elementFormDefault="qualified", so an element
// takes the namespace of the schema that *declares* it, not of its type: zmPr is declared in the
// slidezoom schema (pslz:zmPr, though its type is p166's), and blipFill/spPr are declared in the
// p166 schema (p166:blipFill, p166:spPr, though their types are DrawingML's). This was written as
// p166:zmPr holding a:blipFill and a:spPr — every name taken from the type rather than the
// declaration.
import { esc, NS_A, NS_P, NS_R } from "./ooxml";

export const NS_SLIDE_ZOOM = "http://schemas.microsoft.com/office/powerpoint/2016/slidezoom";
export const NS_P166 = "http://schemas.microsoft.com/office/powerpoint/2016/6/main";

export interface SlideZoomOptions {
  /** Shape id, unique within the slide. */
  shapeId: number;
  name: string;
  /** Position and size on the parent slide, in EMU — the nested node's own box. */
  frame: { x: number; y: number; w: number; h: number };
  /** The destination's p:sldId/@id, not its rId. */
  targetSlideId: number;
  /** Relationship id of the cover image inside this slide's rels. */
  coverImageRelId: string;
  /**
   * Relationship id of a plain slide link to the same destination, for the fallback picture a
   * PowerPoint without Slide Zoom shows instead.
   */
  fallbackLinkRelId: string;
  /** Unique GUID for the zoom object, braced and upper-case as OOXML writes them. */
  guid: string;
  /** Click-back to the parent slide: the deck's breadcrumb. */
  returnToParent: boolean;
  /** Zoom transition duration in ms; omitted means the destination slide's own transition. */
  transitionDurationMs?: number;
}

/**
 * A GUID in the `{XXXXXXXX-XXXX-...}` form OOXML uses. Derived from a caller-supplied random
 * source so exports are reproducible under test.
 */
export function formatGuid(hex32: string): string {
  const h = hex32.toUpperCase().padEnd(32, "0").slice(0, 32);
  return `{${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}}`;
}

export const NS_MC = "http://schemas.openxmlformats.org/markup-compatibility/2006";

/**
 * A Slide Zoom, in the exact envelope PowerPoint itself writes (taken from a deck PowerPoint
 * re-saved, D75): the zoom inside `mc:Choice Requires="pslz"`, and in `mc:Fallback` the cover
 * image as an ordinary picture hyperlinked to the same slide. A PowerPoint that predates Slide
 * Zoom — or any other reader — takes the fallback and still gets a working link, instead of an
 * element it does not know.
 */
export function slideZoomFrame(options: SlideZoomOptions): string {
  const { frame } = options;
  return (
    `<mc:AlternateContent xmlns:mc="${NS_MC}">` +
    `<mc:Choice xmlns:pslz="${NS_SLIDE_ZOOM}" Requires="pslz">` +
    zoomGraphicFrame(options) +
    "</mc:Choice>" +
    "<mc:Fallback>" +
    // Same shape id as the choice: they are one shape, of which a reader sees exactly one.
    "<p:pic>" +
    "<p:nvPicPr>" +
    `<p:cNvPr id="${options.shapeId}" name="${esc(options.name)}">` +
    `<a:hlinkClick r:id="${options.fallbackLinkRelId}" action="ppaction://hlinksldjump"/>` +
    "</p:cNvPr>" +
    '<p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr>' +
    "<p:nvPr/>" +
    "</p:nvPicPr>" +
    `<p:blipFill><a:blip r:embed="${options.coverImageRelId}"/><a:stretch><a:fillRect/></a:stretch></p:blipFill>` +
    `<p:spPr><a:xfrm><a:off x="${frame.x}" y="${frame.y}"/><a:ext cx="${frame.w}" cy="${frame.h}"/></a:xfrm>` +
    '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr>' +
    "</p:pic>" +
    "</mc:Fallback>" +
    "</mc:AlternateContent>"
  );
}

function zoomGraphicFrame(options: SlideZoomOptions): string {
  const { frame } = options;
  const transition =
    options.transitionDurationMs === undefined ? "" : ` transitionDur="${Math.round(options.transitionDurationMs)}"`;

  return (
    "<p:graphicFrame>" +
    "<p:nvGraphicFramePr>" +
    `<p:cNvPr id="${options.shapeId}" name="${esc(options.name)}"/>` +
    "<p:cNvGraphicFramePr/>" +
    "<p:nvPr/>" +
    "</p:nvGraphicFramePr>" +
    `<p:xfrm><a:off x="${frame.x}" y="${frame.y}"/><a:ext cx="${frame.w}" cy="${frame.h}"/></p:xfrm>` +
    "<a:graphic>" +
    `<a:graphicData uri="${NS_SLIDE_ZOOM}">` +
    `<pslz:sldZm xmlns:pslz="${NS_SLIDE_ZOOM}">` +
    `<pslz:sldZmObj sldId="${options.targetSlideId}">` +
    `<pslz:zmPr xmlns:p166="${NS_P166}" id="${options.guid}"` +
    ` returnToParent="${options.returnToParent ? 1 : 0}" imageType="cover" showBg="0"${transition}>` +
    // The cover image is the nested node's own collapsed view, so the deck looks like the app
    // rather than like a shrunken screenshot of the child slide.
    `<p166:blipFill><a:blip r:embed="${options.coverImageRelId}"/><a:stretch><a:fillRect/></a:stretch></p166:blipFill>` +
    // The zoom image's frame is relative to the graphic frame around it, so it sits at the
    // origin. Written as the slide position until D75; PowerPoint silently rewrote it to 0,0.
    `<p166:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${frame.w}" cy="${frame.h}"/></a:xfrm>` +
    '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p166:spPr>' +
    "</pslz:zmPr>" +
    "</pslz:sldZmObj>" +
    "</pslz:sldZm>" +
    "</a:graphicData>" +
    "</a:graphic>" +
    "</p:graphicFrame>"
  );
}

export interface SlidePictureOptions {
  shapeId: number;
  name: string;
  frame: { x: number; y: number; w: number; h: number };
  imageRelId: string;
}

/** The rendered diagram, as a picture filling its slide. */
export function slidePicture(options: SlidePictureOptions): string {
  const { frame } = options;
  return (
    "<p:pic>" +
    "<p:nvPicPr>" +
    `<p:cNvPr id="${options.shapeId}" name="${esc(options.name)}"/>` +
    '<p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr>' +
    "<p:nvPr/>" +
    "</p:nvPicPr>" +
    `<p:blipFill><a:blip r:embed="${options.imageRelId}"/><a:stretch><a:fillRect/></a:stretch></p:blipFill>` +
    `<p:spPr><a:xfrm><a:off x="${frame.x}" y="${frame.y}"/><a:ext cx="${frame.w}" cy="${frame.h}"/></a:xfrm>` +
    '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr>' +
    "</p:pic>"
  );
}

/**
 * A hyperlinked transparent rectangle over a nested node: the documented fallback for when
 * Slide Zoom is unavailable or unwanted. It loses the zoom animation but keeps the navigation,
 * and unlike the zoom it works in every PowerPoint version and on every platform.
 */
export function slideLinkShape(options: {
  shapeId: number;
  name: string;
  frame: { x: number; y: number; w: number; h: number };
  linkRelId: string;
}): string {
  const { frame } = options;
  return (
    "<p:sp>" +
    "<p:nvSpPr>" +
    `<p:cNvPr id="${options.shapeId}" name="${esc(options.name)}">` +
    `<a:hlinkClick xmlns:r="${NS_R}" r:id="${options.linkRelId}" action="ppaction://hlinksldjump"/>` +
    "</p:cNvPr>" +
    "<p:cNvSpPr/><p:nvPr/>" +
    "</p:nvSpPr>" +
    `<p:spPr><a:xfrm><a:off x="${frame.x}" y="${frame.y}"/><a:ext cx="${frame.w}" cy="${frame.h}"/></a:xfrm>` +
    '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/><a:ln><a:noFill/></a:ln></p:spPr>' +
    "<p:txBody><a:bodyPr/><a:lstStyle/><a:p/></p:txBody>" +
    "</p:sp>"
  );
}

export interface SlideXmlOptions {
  /** Shapes already serialised, in z-order. */
  body: string;
  title: string;
}

export function slideXml(options: SlideXmlOptions): string {
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
    `<p:sld xmlns:a="${NS_A}" xmlns:r="${NS_R}" xmlns:p="${NS_P}">` +
    `<p:cSld name="${esc(options.title)}"><p:spTree>` +
    '<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>' +
    '<p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>' +
    options.body +
    "</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr>" +
    "</p:sld>"
  );
}
