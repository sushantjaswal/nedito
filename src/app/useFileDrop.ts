// Drag-and-drop onto the app window: a document opens, a picture is placed.
//
// A .nedito, .drawio/.xml or .docx file opens as the document (CLAUDE.md: "open via file picker
// and drag-and-drop onto the app window"). An image is inserted where it was dropped — several at
// once, staggered (CLAUDE_HISTORY.md D79). The one overlap is a PNG: a .nedito.png carries a
// whole diagram, and by the user's decision it still opens as that diagram, while any other PNG is
// a picture to insert. Before D79 every dropped .png was tried as a document, so an ordinary photo
// failed with an error.
//
// Window-level so it works everywhere, not just over the canvas — the canvas's own onDrop only
// handles the stencil-drag MIME type and no-ops for anything else, so there's no conflict
// between the two.
import { useEffect } from "react";
import { getCanvasInstance } from "../canvas/canvasApi";
import { isOpenableFileName, openFile } from "../file/openFile";
import { extractTextChunk } from "../file/pngChunks";
import { useDocStore } from "../model/store";
import { imageFilesIn, insertImageFiles } from "./insertImage";

/** Whether a PNG carries a whole Nedito diagram (a `.nedito.png` export). */
export async function carriesDiagram(file: File): Promise<boolean> {
  if (!/\.png$/i.test(file.name) && file.type !== "image/png") return false;
  return extractTextChunk(new Uint8Array(await file.arrayBuffer())) !== null;
}

function openDocument(file: File): void {
  openFile(file).then((result) => {
    if (!result.ok) {
      window.alert(result.error);
      return;
    }
    useDocStore.getState().loadDoc(result.doc);
    useDocStore.getState().showImportNotices(result.notices);
  });
}

export function useFileDrop(): void {
  useEffect(() => {
    const onDragOver = (e: DragEvent) => {
      if (e.dataTransfer?.types.includes("Files")) e.preventDefault();
    };
    const onDrop = (e: DragEvent) => {
      const files = Array.from(e.dataTransfer?.files ?? []);
      if (files.length === 0) return;
      const images = imageFilesIn(e.dataTransfer?.files);
      const first = files[0];
      const isDocument = isOpenableFileName(first.name) && !images.includes(first);
      if (!isDocument && images.length === 0) return;
      e.preventDefault();

      if (isDocument) {
        openDocument(first);
        return;
      }
      // Where it was dropped, in diagram coordinates; the view's centre if the canvas isn't up.
      const at = getCanvasInstance()?.screenToFlowPosition({ x: e.clientX, y: e.clientY });
      void (async () => {
        if (images.length === 1 && (await carriesDiagram(images[0]))) openDocument(images[0]);
        else await insertImageFiles(images, at);
      })();
    };
    window.addEventListener("dragover", onDragOver);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("dragover", onDragOver);
      window.removeEventListener("drop", onDrop);
    };
  }, []);
}
