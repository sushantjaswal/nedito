// Rasterizes the same SVG diagramToSvg produces via an off-screen <canvas> — the standard
// SVG-to-PNG technique, no extra dependency needed. Needs a real Image/Canvas, so this is
// browser-only and verified live rather than under jsdom (see svgExport.test.ts for the
// dependency-free SVG generation itself).
import { computeDiagramBounds, renderDiagramSvg, type SvgExportOptions } from "./svgExport";
import type { Diagram } from "../model/types";
import { embedResolution } from "./pngChunks";

export interface PngExportOptions extends SvgExportOptions {
  /** Device-pixel multiplier for a crisper export. @default 2 */
  scale?: number;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Failed to rasterize diagram SVG for PNG export"));
    img.src = src;
  });
}

export async function diagramToPngBlob(diagram: Diagram, options: PngExportOptions = {}): Promise<Blob> {
  const scale = options.scale ?? 2;
  const { width, height } = computeDiagramBounds(diagram, options.padding);
  // renderDiagramSvg, not diagramToSvg: the raster needs the embedded font, or the rasteriser
  // falls back to whatever face it has and the PNG stops matching the canvas.
  const svgText = await renderDiagramSvg(diagram, options);

  const svgBlob = new Blob([svgText], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(svgBlob);
  try {
    const img = await loadImage(url);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D context unavailable");
    if (options.background) {
      ctx.fillStyle = options.background;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!blob) throw new Error("Canvas toBlob failed");
    // One CSS pixel is 1/96in, so a scale-2 render is 192 dpi. Recorded, not assumed: Office
    // sizes pictures from it (D74).
    const bytes = embedResolution(new Uint8Array(await blob.arrayBuffer()), 96 * scale);
    return new Blob([bytes as BlobPart], { type: "image/png" });
  } finally {
    URL.revokeObjectURL(url);
  }
}
