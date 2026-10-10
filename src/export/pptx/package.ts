// Assembles the .pptx package: takes finished slides and their media, emits the ZIP.
//
// Split from the diagram walk (pptxExport.ts) so the package layout can be exercised on hand-
// built slides — which is exactly what the Slide Zoom prototype the spec asks for needs.
import { createZip, type ZipEntry } from "./zip";
import {
  appProps,
  contentTypes,
  coreProps,
  notesMaster,
  notesMasterRels,
  notesSlide,
  notesSlideRels,
  packageRels,
  presentation,
  presentationRels,
  presProps,
  slideLayout,
  slideLayoutRels,
  slideMaster,
  slideMasterRels,
  tableStyles,
  theme,
  viewProps,
  NOTES_THEME_PART,
  NS_R,
} from "./ooxml";

export interface SlideMedia {
  /** File name inside ppt/media, e.g. "image3.png". */
  fileName: string;
  bytes: Uint8Array;
  /** Relationship id this slide will use to reach it, e.g. "rId2". */
  relId: string;
}

export interface SlideLink {
  relId: string;
  /** 1-based slide number this link jumps to. */
  targetSlideNumber: number;
}

export interface PptxSlide {
  /** Finished <p:sld> XML. */
  xml: string;
  media: SlideMedia[];
  links?: SlideLink[];
  /** Speaker-note text, usually the breadcrumb path. Omit for no notes slide. */
  notes?: string;
}

/**
 * The notes relationship has to claim an id nothing else on the slide is using. Ids are
 * allocated by the caller (they appear inside the slide XML), so the only safe value is one
 * past the highest already present — a fixed id would eventually collide on a slide with
 * enough nested blocks, and a duplicate rId is the kind of fault PowerPoint reports only as
 * "repair".
 */
function nextRelId(slide: PptxSlide): string {
  const used = [...slide.media.map((m) => m.relId), ...(slide.links ?? []).map((l) => l.relId), "rId1"];
  const highest = used.reduce((max, id) => {
    const n = Number(/^rId(\d+)$/.exec(id)?.[1] ?? 0);
    return Number.isFinite(n) && n > max ? n : max;
  }, 0);
  return `rId${highest + 1}`;
}

function slideRels(slide: PptxSlide, notesSlideNumber: number | null): string {
  const media = slide.media
    .map((m) => `<Relationship Id="${m.relId}" Type="${NS_R}/image" Target="../media/${m.fileName}"/>`)
    .join("");
  const links = (slide.links ?? [])
    .map(
      (l) => `<Relationship Id="${l.relId}" Type="${NS_R}/slide" Target="slide${l.targetSlideNumber}.xml"/>`,
    )
    .join("");
  const notes =
    notesSlideNumber === null
      ? ""
      : `<Relationship Id="${nextRelId(slide)}" Type="${NS_R}/notesSlide" Target="../notesSlides/notesSlide${notesSlideNumber}.xml"/>`;
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    `<Relationship Id="rId1" Type="${NS_R}/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>` +
    media +
    links +
    notes +
    "</Relationships>"
  );
}

export interface PptxPackageOptions {
  /** Document title for docProps/core.xml. */
  title?: string;
  /** ISO timestamp for the core properties. Fixed by default so output stays reproducible. */
  isoDate?: string;
}

export async function buildPptxPackage(
  slides: PptxSlide[],
  options: PptxPackageOptions = {},
): Promise<Uint8Array> {
  const withNotes = slides.filter((s) => s.notes !== undefined);
  const hasNotes = withNotes.length > 0;
  const title = options.title ?? "Diagram";
  const isoDate = options.isoDate ?? "2020-01-01T00:00:00Z";

  // [Content_Types].xml must be the first entry in the archive, and every part listed below
  // is present in a deck PowerPoint accepts — including the five (presProps, viewProps,
  // tableStyles, and the two docProps) that the schema marks optional. See ooxml.ts.
  const entries: ZipEntry[] = [
    { path: "[Content_Types].xml", data: contentTypes(slides.length, withNotes.length) },
    { path: "_rels/.rels", data: packageRels() },
    { path: "docProps/core.xml", data: coreProps(title, isoDate) },
    { path: "docProps/app.xml", data: appProps(slides.length, withNotes.length) },
    { path: "ppt/presentation.xml", data: presentation(slides.length, hasNotes) },
    { path: "ppt/_rels/presentation.xml.rels", data: presentationRels(slides.length, hasNotes) },
    { path: "ppt/presProps.xml", data: presProps() },
    { path: "ppt/viewProps.xml", data: viewProps() },
    { path: "ppt/tableStyles.xml", data: tableStyles() },
    { path: "ppt/slideMasters/slideMaster1.xml", data: slideMaster() },
    { path: "ppt/slideMasters/_rels/slideMaster1.xml.rels", data: slideMasterRels() },
    { path: "ppt/slideLayouts/slideLayout1.xml", data: slideLayout() },
    { path: "ppt/slideLayouts/_rels/slideLayout1.xml.rels", data: slideLayoutRels() },
    { path: "ppt/theme/theme1.xml", data: theme() },
  ];

  if (hasNotes) {
    entries.push(
      { path: "ppt/notesMasters/notesMaster1.xml", data: notesMaster() },
      { path: "ppt/notesMasters/_rels/notesMaster1.xml.rels", data: notesMasterRels() },
      // Its own copy of the theme: a master may not share its theme part with another (D74).
      { path: NOTES_THEME_PART, data: theme() },
    );
  }

  const mediaWritten = new Set<string>();
  let notesIndex = 0;
  slides.forEach((slide, i) => {
    const slideNumber = i + 1;
    const notesSlideNumber = slide.notes === undefined ? null : ++notesIndex;

    entries.push({ path: `ppt/slides/slide${slideNumber}.xml`, data: slide.xml });
    entries.push({ path: `ppt/slides/_rels/slide${slideNumber}.xml.rels`, data: slideRels(slide, notesSlideNumber) });

    if (notesSlideNumber !== null) {
      entries.push(
        { path: `ppt/notesSlides/notesSlide${notesSlideNumber}.xml`, data: notesSlide(slide.notes!) },
        {
          path: `ppt/notesSlides/_rels/notesSlide${notesSlideNumber}.xml.rels`,
          data: notesSlideRels(slideNumber),
        },
      );
    }

    for (const media of slide.media) {
      // Two slides can legitimately name the same image (a nested block's cover appears on the
      // parent slide, and the same picture may be reused). A ZIP with the same path twice is
      // malformed, so the part is written once and simply referenced again.
      if (mediaWritten.has(media.fileName)) continue;
      mediaWritten.add(media.fileName);
      // PNG is already deflate-compressed; running it through again costs time and saves
      // nothing, so it goes in stored.
      entries.push({ path: `ppt/media/${media.fileName}`, data: media.bytes, store: true });
    }
  });

  return createZip(entries);
}
