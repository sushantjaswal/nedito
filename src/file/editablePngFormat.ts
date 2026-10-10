// .nedito.png: the same PNG "Export as PNG" produces, plus the full document embedded as a
// PNG iTXt chunk (see pngChunks.ts), so a shared .nedito.png image is also the editable document.
// Opening one re-parses the embedded JSON through the exact same decodeDoc()
// a plain .nedito file goes through, so it gets identical validation/migration guarantees.
// Needs a real Blob/ArrayBuffer pipeline shared with pngExport.ts's rasterization, so this is
// browser-only and verified live rather than under jsdom (pngChunks.ts's pure chunk logic is
// what's unit-tested).
import { decodeDoc, encodeDoc, type DecodeResult } from "./documentFormat";
import { diagramToPngBlob, type PngExportOptions } from "./pngExport";
import { embedTextChunk, extractTextChunk } from "./pngChunks";
import type { DiagramDocument, Diagram } from "../model/types";

export async function encodeEditablePng(
  doc: DiagramDocument,
  diagram: Diagram,
  options: PngExportOptions = {},
): Promise<Blob> {
  const pngBlob = await diagramToPngBlob(diagram, options);
  const bytes = new Uint8Array(await pngBlob.arrayBuffer());
  const withDoc = embedTextChunk(bytes, encodeDoc(doc));
  // TS 5.7's DOM lib types BlobPart against Uint8Array<ArrayBuffer> specifically; embedTextChunk
  // returns the broader Uint8Array<ArrayBufferLike> — same runtime bytes, stricter compile-time
  // generic, safe to widen here.
  return new Blob([withDoc as BlobPart], { type: "image/png" });
}

export async function decodeEditablePng(file: Blob): Promise<DecodeResult> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const text = extractTextChunk(bytes);
  if (text === null) {
    return { ok: false, error: "This PNG doesn't have an embedded document — it's just a plain image." };
  }
  return decodeDoc(text);
}
