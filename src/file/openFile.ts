// One place that decides what an opened file *is*. Both ways into the app — File > Open and
// dropping a file on the window — go through here, so a newly supported format never works in
// one and silently not the other (which is exactly what a second copy of this branching would
// eventually produce).
import { OPENABLE_DOC_EXTS } from "../app/brand";
import { decodeDoc } from "./documentFormat";
import { decodeEditablePng } from "./editablePngFormat";
import { decodeDrawio } from "./drawio/drawioImport";
import { decodeDocx } from "../export/docx/docxImport";
import type { DiagramDocument } from "../model/types";
import type { ImportNotice } from "./importNotices";

export type OpenOutcome =
  | { ok: true; doc: DiagramDocument; notices: ImportNotice[] }
  | { ok: false; error: string };

/**
 * Extensions the file picker offers and the drop handler accepts: the current document
 * extension and every earlier one (".deepdraw" until D100), then the formats imported. An editable
 * image of any name ends in ".png", so one entry covers .nedito.png and .deepdraw.png alike.
 */
export const OPENABLE_EXTENSIONS: readonly string[] = [...OPENABLE_DOC_EXTS, ".png", ".drawio", ".xml", ".docx"];

export function isOpenableFileName(name: string): boolean {
  const lower = name.toLowerCase();
  return OPENABLE_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

export async function openFile(file: File): Promise<OpenOutcome> {
  const name = file.name.toLowerCase();

  if (name.endsWith(".png")) {
    const result = await decodeEditablePng(file);
    return result.ok ? { ok: true, doc: result.doc, notices: [] } : result;
  }

  if (name.endsWith(".drawio") || name.endsWith(".xml")) {
    return decodeDrawio(await file.text(), file.name);
  }

  // A .docx this app wrote carries the original document in a custom XML part, so exporting to
  // Word is not a one-way trip (CLAUDE_HISTORY.md D59).
  if (name.endsWith(".docx")) {
    const result = await decodeDocx(await file.arrayBuffer());
    return result.ok ? { ok: true, doc: result.doc, notices: [] } : result;
  }

  const result = decodeDoc(await file.text());
  return result.ok ? { ok: true, doc: result.doc, notices: [] } : result;
}
