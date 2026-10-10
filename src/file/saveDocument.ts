import { BRAND } from "../app/brand";
import { encodeDoc } from "./documentFormat";
import { downloadText } from "./download";
import type { DiagramDocument } from "../model/types";

/** Strips characters Windows and most other filesystems reject in a filename. */
export function toFilename(title: string, ext: string): string {
  const safe = title.trim().replace(/[\\/:*?"<>|]+/g, "-") || "diagram";
  return `${safe}${ext}`;
}

// Extracted from the old File menu so anything offering "save a copy" runs the identical path rather
// than re-deriving the filename and mime type — the onboarding disclosure's download button is
// the first such caller, and the export reminder toast (onboarding item 4) will be the next.
export function saveDocument(doc: DiagramDocument): void {
  downloadText(encodeDoc(doc), toFilename(doc.meta.title, BRAND.fileExt), "application/json");
}
