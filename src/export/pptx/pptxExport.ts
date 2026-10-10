// PowerPoint export with native Slide Zoom (CLAUDE_HISTORY.md D58).
//
// One slide per diagram, depth-first. Every nested block on a parent slide gets a navigation
// object sitting exactly over its box, targeting that child's slide:
//
//   navigation: "zoom"  — a native Slide Zoom. Animated drill-in, click-back to the parent,
//                         and the cover image is the block's own collapsed view, so the deck
//                         looks like the app. Created only by PowerPoint 2016+ on Windows;
//                         plays on Mac and mobile; older versions show a static thumbnail.
//   navigation: "link"  — a transparent hyperlinked rectangle. No animation, but it works in
//                         every PowerPoint on every platform.
//
// Both are offered rather than one being a hidden fallback, because the trade is the user's:
// the spec's own degradation note is a list of environments we cannot detect from here.
//
// Browser-only, like file/pngExport.ts — it rasterises through a <canvas>.
import { computeDiagramBounds } from "../../file/svgExport";
import { diagramToPngBlob } from "../../file/pngExport";
import type { DiagramDocument } from "../../model/types";
import { buildPptxPackage, type PptxSlide, type SlideLink, type SlideMedia } from "./package";
import {
  breadcrumbText,
  fitToSlide,
  nestedNodesOf,
  nodeRectInImage,
  nodeRectOnSlide,
  planSlides,
  type Rect,
} from "./layout";
import { formatGuid, slideLinkShape, slidePicture, slideXml, slideZoomFrame } from "./slideZoom";

export interface PptxExportOptions {
  /** @default "zoom" */
  navigation?: "zoom" | "link";
  /** Zoom transition in ms. Omit to inherit the destination slide's own transition. */
  transitionDurationMs?: number;
  /** Render scale for the slide pictures. @default 2 */
  scale?: number;
}

async function blobToBytes(blob: Blob): Promise<Uint8Array> {
  return new Uint8Array(await blob.arrayBuffer());
}

/** Crops a region out of a rendered PNG — used for a nested block's cover thumbnail. */
async function cropPng(source: Blob, rect: Rect): Promise<Blob> {
  const bitmap = await createImageBitmap(source);
  try {
    const canvas = document.createElement("canvas");
    canvas.width = rect.w;
    canvas.height = rect.h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D context unavailable");
    ctx.drawImage(bitmap, rect.x, rect.y, rect.w, rect.h, 0, 0, rect.w, rect.h);
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Could not encode the cover image"))), "image/png"),
    );
  } finally {
    bitmap.close();
  }
}

export interface PptxExportResult {
  blob: Blob;
  slideCount: number;
  /** How many nested blocks became navigation objects. */
  zoomCount: number;
}

export async function exportPptx(doc: DiagramDocument, options: PptxExportOptions = {}): Promise<PptxExportResult> {
  const navigation = options.navigation ?? "zoom";
  const renderScale = options.scale ?? 2;

  const plans = planSlides(doc);
  const slideNumberByDiagram = new Map(plans.map((p) => [p.diagramId, p.slideNumber]));
  const slideIdByDiagram = new Map(plans.map((p) => [p.diagramId, p.slideId]));

  const slides: PptxSlide[] = [];
  let mediaCounter = 0;
  let zoomCount = 0;

  for (const plan of plans) {
    const diagram = doc.diagrams[plan.diagramId];
    const bounds = computeDiagramBounds(diagram);
    const fitted = fitToSlide(bounds.width, bounds.height);

    const pageBlob = await diagramToPngBlob(diagram, {
      background: "#ffffff",
      scale: renderScale,
      diagrams: doc.diagrams,
      assets: doc.assets,
    });
    const media: SlideMedia[] = [];
    const links: SlideLink[] = [];

    // rId1 is the slide layout (see package.ts), so this slide's own relationships start at 2.
    let relCounter = 1;
    const nextRelId = () => `rId${++relCounter}`;

    const pictureRelId = nextRelId();
    mediaCounter += 1;
    media.push({ fileName: `image${mediaCounter}.png`, bytes: await blobToBytes(pageBlob), relId: pictureRelId });

    let shapeId = 2; // 1 is the slide's own group shape
    let body = slidePicture({
      shapeId: shapeId++,
      name: `${plan.title} diagram`,
      frame: { x: fitted.offsetX, y: fitted.offsetY, w: fitted.width, h: fitted.height },
      imageRelId: pictureRelId,
    });

    for (const node of nestedNodesOf(diagram)) {
      const targetSlideNumber = slideNumberByDiagram.get(node.childDiagramId);
      const targetSlideId = slideIdByDiagram.get(node.childDiagramId);
      // A nested node whose child isn't in the deck would produce a link to nowhere, which
      // PowerPoint reports as a damaged file rather than a missing slide. Skip it instead.
      if (targetSlideNumber === undefined || targetSlideId === undefined) continue;

      const frame = nodeRectOnSlide(node, bounds, fitted);
      const name = node.label?.text ? `Nested block: ${node.label.text}` : "Nested block";
      zoomCount += 1;

      if (navigation === "link") {
        const linkRelId = nextRelId();
        links.push({ relId: linkRelId, targetSlideNumber });
        body += slideLinkShape({ shapeId: shapeId++, name, frame, linkRelId });
        continue;
      }

      // The cover is cut straight out of the page we just rendered, so it *is* the collapsed
      // view as drawn in the app — no second renderer to drift out of step with the canvas.
      const cover = await cropPng(pageBlob, nodeRectInImage(node, bounds, renderScale));
      const coverRelId = nextRelId();
      mediaCounter += 1;
      media.push({ fileName: `image${mediaCounter}.png`, bytes: await blobToBytes(cover), relId: coverRelId });
      const fallbackLinkRelId = nextRelId();
      links.push({ relId: fallbackLinkRelId, targetSlideNumber });

      body += slideZoomFrame({
        fallbackLinkRelId,
        shapeId: shapeId++,
        name,
        frame,
        targetSlideId,
        coverImageRelId: coverRelId,
        guid: formatGuid(node.id.replace(/[^0-9a-fA-F]/g, "").padEnd(32, "0")),
        returnToParent: true,
        transitionDurationMs: options.transitionDurationMs,
      });
    }

    slides.push({
      xml: slideXml({ title: plan.title, body }),
      media,
      links,
      notes: breadcrumbText(plan.path),
    });
  }

  const bytes = await buildPptxPackage(slides, { title: doc.meta.title });
  return {
    blob: new Blob([bytes as BlobPart], {
      type: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    }),
    slideCount: slides.length,
    zoomCount,
  };
}
