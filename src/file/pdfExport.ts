// Browser half of PDF export: rasterize the diagram, zlib-compress the raw pixels, and hand
// them to the pure writer in pdfWriter.ts.
//
// Raw RGB + FlateDecode rather than embedding a JPEG (/DCTDecode, the usual no-library trick):
// diagrams are line art and text, exactly the content JPEG blurs worst, and deflate on a mostly
// flat-colour raster compresses hard enough that losing quality buys very little.
import { computeDiagramBounds, renderDiagramSvg } from "./svgExport";
import { buildSingleImagePdf } from "./pdfWriter";
import { pxToPt, type PageSize } from "../model/pageSize";
import type { Diagram, ImageAsset } from "../model/types";

export interface PdfExportOptions {
  /** Page box; defaults to the diagram's own bounds when it has no page size set. */
  pageSize?: PageSize;
  /** Raster oversampling — 2 keeps text legible at print scale without a huge file. */
  scale?: number;
  padding?: number;
  /** Every diagram in the document, so a Nested Block draws its live miniature. */
  diagrams?: Record<string, Diagram>;
  /** The document's pictures, so image nodes draw (D79). */
  assets?: Record<string, ImageAsset>;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Failed to rasterize diagram SVG for PDF export"));
    img.src = src;
  });
}

async function deflate(bytes: Uint8Array): Promise<Uint8Array> {
  // "deflate" is zlib-wrapped (RFC 1950), which is exactly what PDF's /FlateDecode expects —
  // "deflate-raw" would produce a stream Acrobat rejects.
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new CompressionStream("deflate"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/**
 * Renders the diagram onto one PDF page. The diagram is scaled to fit the page while keeping
 * its aspect ratio and centred, so nothing is cropped or stretched — the same "fit to page"
 * behaviour a browser's own print dialog applies.
 */
export async function diagramToPdfBlob(diagram: Diagram, options: PdfExportOptions = {}): Promise<Blob> {
  const scale = options.scale ?? 2;
  const bounds = computeDiagramBounds(diagram, options.padding);
  const page: PageSize = options.pageSize ?? { w: bounds.width, h: bounds.height };

  const svgText = await renderDiagramSvg(diagram, { ...options, background: "#ffffff" });
  const url = URL.createObjectURL(new Blob([svgText], { type: "image/svg+xml;charset=utf-8" }));

  try {
    const img = await loadImage(url);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(page.w * scale));
    canvas.height = Math.max(1, Math.round(page.h * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D context unavailable");

    // PDF has no notion of a transparent page; paint the sheet white first.
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const fit = Math.min(canvas.width / bounds.width, canvas.height / bounds.height);
    const drawW = bounds.width * fit;
    const drawH = bounds.height * fit;
    ctx.drawImage(img, (canvas.width - drawW) / 2, (canvas.height - drawH) / 2, drawW, drawH);

    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    // Drop the alpha channel: the page is already opaque, and DeviceRGB is a third smaller.
    const rgb = new Uint8Array((data.length / 4) * 3);
    for (let i = 0, o = 0; i < data.length; i += 4) {
      rgb[o++] = data[i];
      rgb[o++] = data[i + 1];
      rgb[o++] = data[i + 2];
    }

    const pdf = buildSingleImagePdf({
      imageData: await deflate(rgb),
      imageWidth: canvas.width,
      imageHeight: canvas.height,
      pageWidthPt: pxToPt(page.w),
      pageHeightPt: pxToPt(page.h),
      title: diagram.title,
    });
    return new Blob([pdf as BlobPart], { type: "application/pdf" });
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Print via a hidden iframe holding the exported SVG at page size. Going through the browser's
 * own print pipeline (rather than printing the app window) means none of the editor chrome can
 * leak onto the page, and the user still gets their platform's "Save as PDF" for free.
 */
export async function printDiagram(
  diagram: Diagram,
  pageSize?: PageSize,
  diagrams?: Record<string, Diagram>,
  assets?: Record<string, ImageAsset>,
): Promise<void> {
  const bounds = computeDiagramBounds(diagram);
  const page = pageSize ?? { w: bounds.width, h: bounds.height };
  const svg = await renderDiagramSvg(diagram, { background: "#ffffff", diagrams, assets });

  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;";
  document.body.appendChild(frame);

  const doc = frame.contentDocument;
  if (!doc) {
    frame.remove();
    return;
  }
  doc.open();
  doc.write(
    `<!doctype html><html><head><title>${diagram.title}</title><style>` +
      `@page { size: ${page.w}px ${page.h}px; margin: 0 }` +
      `html,body { margin:0; padding:0 }` +
      `svg { display:block; width:100%; height:100%; object-fit:contain }` +
      `</style></head><body>${svg}</body></html>`,
  );
  doc.close();

  const run = () => {
    frame.contentWindow?.focus();
    frame.contentWindow?.print();
    // Left in the DOM briefly: removing it synchronously can cancel the print job in some
    // browsers, which is a silent no-op from the user's point of view.
    window.setTimeout(() => frame.remove(), 1000);
  };
  if (frame.contentWindow?.document.readyState === "complete") run();
  else frame.addEventListener("load", run, { once: true });
}
