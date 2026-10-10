// The parts of the PowerPoint export that are pure arithmetic: which slide each diagram
// becomes, and where a nested block's box lands on that slide.
//
// Separated from pptxExport.ts because everything there needs a real <canvas>, and these are
// the decisions worth testing — a zoom pointing at the wrong slide, or sitting a centimetre
// off the box it represents, is the kind of defect that only shows up in a demo.
import type { DiagramDocument, Diagram, NestedNode } from "../../model/types";
import { FIRST_SLIDE_ID, px, SLIDE_H_EMU, SLIDE_W_EMU } from "./ooxml";

export interface SlidePlan {
  diagramId: string;
  /** 1-based position in the deck. */
  slideNumber: number;
  /** p:sldId/@id, which is what a Slide Zoom points at. */
  slideId: number;
  title: string;
  /** Breadcrumb from the root page down to here, e.g. ["Main", "Payment Service"]. */
  path: string[];
}

/**
 * Depth-first: a parent immediately followed by its children, which is both what the spec
 * asks for and what makes the deck readable when someone pages through it instead of
 * presenting.
 *
 * A diagram reached twice (two nested nodes pointing at one child, which the model does not
 * forbid) gets one slide, not two — the second reference simply zooms to the same place.
 */
export function planSlides(doc: DiagramDocument): SlidePlan[] {
  const plans: SlidePlan[] = [];
  const seen = new Set<string>();

  const visit = (diagramId: string, path: string[]): void => {
    const diagram = doc.diagrams[diagramId];
    if (!diagram || seen.has(diagramId)) return;
    seen.add(diagramId);

    const here = [...path, diagram.title];
    plans.push({
      diagramId,
      slideNumber: plans.length + 1,
      slideId: FIRST_SLIDE_ID + plans.length,
      title: diagram.title,
      path: here,
    });

    for (const node of nestedNodesOf(diagram)) visit(node.childDiagramId, here);
  };

  for (const rootId of doc.rootDiagramIds) visit(rootId, []);
  return plans;
}

export function nestedNodesOf(diagram: Diagram): NestedNode[] {
  return diagram.nodes.filter((n): n is NestedNode => n.type === "nested").sort((a, b) => a.z - b.z);
}

export interface FittedContent {
  /** Uniform scale from diagram pixels to slide EMU. */
  scale: number;
  /** Where the fitted picture's top-left sits on the slide, in EMU. */
  offsetX: number;
  offsetY: number;
  width: number;
  height: number;
}

/**
 * Fits a diagram's bounding box into the 16:9 slide, preserving aspect and centring. Letterbox
 * rather than fill: a cropped diagram is a wrong diagram, and the whole point of the export is
 * that the deck shows what the canvas showed.
 */
export function fitToSlide(contentWidthPx: number, contentHeightPx: number): FittedContent {
  const w = px(Math.max(1, contentWidthPx));
  const h = px(Math.max(1, contentHeightPx));
  const scale = Math.min(SLIDE_W_EMU / w, SLIDE_H_EMU / h);
  const width = Math.round(w * scale);
  const height = Math.round(h * scale);
  return {
    scale,
    width,
    height,
    offsetX: Math.round((SLIDE_W_EMU - width) / 2),
    offsetY: Math.round((SLIDE_H_EMU - height) / 2),
  };
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * A node's box in slide EMU. `boundsOffset` is what svgExport's computeDiagramBounds returns:
 * the shift from diagram coordinates into image coordinates, which is where the padding and
 * any negative positions are accounted for.
 */
export function nodeRectOnSlide(
  node: { position: { x: number; y: number }; size: { w: number; h: number } },
  boundsOffset: { offsetX: number; offsetY: number },
  fitted: FittedContent,
): Rect {
  const imageX = node.position.x + boundsOffset.offsetX;
  const imageY = node.position.y + boundsOffset.offsetY;
  return {
    x: Math.round(fitted.offsetX + px(imageX) * fitted.scale),
    y: Math.round(fitted.offsetY + px(imageY) * fitted.scale),
    w: Math.round(px(node.size.w) * fitted.scale),
    h: Math.round(px(node.size.h) * fitted.scale),
  };
}

/** The same box in the rendered image's own device pixels, for cropping the cover thumbnail. */
export function nodeRectInImage(
  node: { position: { x: number; y: number }; size: { w: number; h: number } },
  boundsOffset: { offsetX: number; offsetY: number },
  renderScale: number,
): Rect {
  return {
    x: Math.round((node.position.x + boundsOffset.offsetX) * renderScale),
    y: Math.round((node.position.y + boundsOffset.offsetY) * renderScale),
    w: Math.max(1, Math.round(node.size.w * renderScale)),
    h: Math.max(1, Math.round(node.size.h * renderScale)),
  };
}

/** "Main › Payment Service › Fraud Engine" — the breadcrumb, for the speaker notes. */
export function breadcrumbText(path: string[]): string {
  return path.join(" › ");
}
