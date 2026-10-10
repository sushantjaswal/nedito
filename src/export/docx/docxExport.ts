// Word export with a diagram appendix (CLAUDE_HISTORY.md D59).
//
// The parent diagram is a captioned figure; every diagram below it becomes a numbered heading
// and figure in a "Diagram Appendix", depth-first, under real Heading styles so Word's own
// collapse and navigation pane work on them.
//
// Navigation is deliberately doubled up. Each nested block gets a transparent hyperlinked
// rectangle over it — the mechanism the spec asks for, since Word has no image maps — and each
// figure also carries plain text links ("Open Figure 2", "Return to Figure 1"). The overlay is
// the nice version; the text link is the one that cannot fail, and a reader who ends up in Word
// Online or a PDF still has a way through.
import { computeDiagramBounds } from "../../file/svgExport";
import { diagramToPngBlob } from "../../file/pngExport";
import { createZip, type ZipEntry } from "../pptx/zip";
import { encodeDoc } from "../../file/documentFormat";
import type { DiagramDocument, Diagram, NestedNode } from "../../model/types";
import {
  boilerplateParts,
  bookmarkName,
  documentRels,
  CONTENT_WIDTH_EMU,
  EMU_PER_PX,
  type DocumentRel,
} from "./docxParts";
import { documentXml, figureParagraph, heading, internalLinkParagraph, paragraph, type OverlayLink } from "./docxBody";

export interface DocxFigurePlan {
  diagramId: string;
  /** 1-based figure number, which is also its position in the document. */
  figureNumber: number;
  title: string;
  path: string[];
  /** Figure number of the diagram that contains it, or null for a page. */
  parentFigureNumber: number | null;
}

/** Depth-first, parent before children — the same order the PowerPoint export uses. */
export function planFigures(doc: DiagramDocument): DocxFigurePlan[] {
  const plans: DocxFigurePlan[] = [];
  const seen = new Set<string>();

  const visit = (diagramId: string, path: string[], parentFigureNumber: number | null): void => {
    const diagram = doc.diagrams[diagramId];
    if (!diagram || seen.has(diagramId)) return;
    seen.add(diagramId);

    const figureNumber = plans.length + 1;
    const here = [...path, diagram.title];
    plans.push({ diagramId, figureNumber, title: diagram.title, path: here, parentFigureNumber });

    for (const node of nestedNodesOf(diagram)) visit(node.childDiagramId, here, figureNumber);
  };

  for (const rootId of doc.rootDiagramIds) visit(rootId, [], null);
  return plans;
}

function nestedNodesOf(diagram: Diagram): NestedNode[] {
  return diagram.nodes.filter((n): n is NestedNode => n.type === "nested").sort((a, b) => a.z - b.z);
}

/** Scales a diagram to the page's text width, never up past it. */
export function figureSize(widthPx: number, heightPx: number): { width: number; height: number; scale: number } {
  const w = Math.max(1, widthPx) * EMU_PER_PX;
  const h = Math.max(1, heightPx) * EMU_PER_PX;
  const scale = Math.min(1, CONTENT_WIDTH_EMU / w);
  return { width: Math.round(w * scale), height: Math.round(h * scale), scale };
}

export interface DocxExportResult {
  blob: Blob;
  figureCount: number;
  linkCount: number;
}

export async function exportDocx(doc: DiagramDocument): Promise<DocxExportResult> {
  const plans = planFigures(doc);
  const figureByDiagram = new Map(plans.map((p) => [p.diagramId, p.figureNumber]));

  const rels: DocumentRel[] = [];
  const media: ZipEntry[] = [];
  let relCounter = 0;
  const nextRelId = () => `rId${++relCounter}`;
  let docPrId = 1000;
  let bookmarkId = 1;
  let linkCount = 0;

  let body = "";

  for (const plan of plans) {
    const diagram = doc.diagrams[plan.diagramId];
    const bounds = computeDiagramBounds(diagram);
    const size = figureSize(bounds.width, bounds.height);

    const blob = await diagramToPngBlob(diagram, { background: "#ffffff", scale: 2, diagrams: doc.diagrams, assets: doc.assets });
    const fileName = `image${plan.figureNumber}.png`;
    const imageRelId = nextRelId();
    rels.push({ id: imageRelId, kind: "image", target: `media/${fileName}` });
    media.push({ path: `word/media/${fileName}`, data: new Uint8Array(await blob.arrayBuffer()), store: true });

    // The first figure is the document's subject; everything after it is appendix material.
    if (plan.figureNumber === 1) {
      body += heading(doc.meta.title, 1);
    } else if (plan.figureNumber === 2) {
      body += heading("Diagram Appendix", 1);
    }

    const anchor = bookmarkName(plan.figureNumber);
    if (plan.figureNumber > 1) {
      body += heading(`${plan.figureNumber - 1}. ${plan.title}`, 2, { id: bookmarkId++, name: anchor });
    } else {
      body += `<w:p><w:bookmarkStart w:id="${bookmarkId}" w:name="${anchor}"/><w:bookmarkEnd w:id="${bookmarkId++}"/></w:p>`;
    }

    const overlays: OverlayLink[] = [];
    const childLinks: { figureNumber: number; title: string }[] = [];

    for (const node of nestedNodesOf(diagram)) {
      const childFigure = figureByDiagram.get(node.childDiagramId);
      if (childFigure === undefined) continue;

      const linkRelId = nextRelId();
      rels.push({ id: linkRelId, kind: "hyperlink", target: `#${bookmarkName(childFigure)}` });
      const label = node.label?.text?.trim() || "Nested block";

      overlays.push({
        docPrId: ++docPrId,
        name: `Link to Figure ${childFigure}`,
        x: (node.position.x + bounds.offsetX) * EMU_PER_PX * size.scale,
        y: (node.position.y + bounds.offsetY) * EMU_PER_PX * size.scale,
        w: Math.max(1, node.size.w * EMU_PER_PX * size.scale),
        h: Math.max(1, node.size.h * EMU_PER_PX * size.scale),
        linkRelId,
        tooltip: `Open Figure ${childFigure}: ${label}`,
      });
      childLinks.push({ figureNumber: childFigure, title: label });
      linkCount += 1;
    }

    body += figureParagraph({
      imageRelId,
      widthEmu: size.width,
      heightEmu: size.height,
      docPrId: ++docPrId,
      name: `${plan.title} diagram`,
      overlays,
    });
    body += paragraph(`Figure ${plan.figureNumber}. ${plan.path.join(" › ")}`, "Caption");

    // The text equivalents of the overlays: the same navigation, in a form nothing can drop.
    for (const child of childLinks) {
      body += internalLinkParagraph(
        `↓ Open Figure ${child.figureNumber}: ${child.title}`,
        bookmarkName(child.figureNumber),
      );
    }
    if (plan.parentFigureNumber !== null) {
      body += internalLinkParagraph(
        `↑ Return to Figure ${plan.parentFigureNumber}`,
        bookmarkName(plan.parentFigureNumber),
      );
    }
  }

  const docJson = encodeDoc(doc);
  const entries: ZipEntry[] = [
    ...boilerplateParts(plans.length, docJson),
    { path: "word/document.xml", data: documentXml(body) },
    { path: "word/_rels/document.xml.rels", data: documentRels(rels) },
    ...media,
  ];

  const bytes = await createZip(entries);
  return {
    blob: new Blob([bytes as BlobPart], {
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    }),
    figureCount: plans.length,
    linkCount,
  };
}
