// Copy image with live link: copy the diagram as an image that is still a way
// back to the real thing.
//
// The trick is one clipboard write carrying two flavours. Word, PowerPoint, Excel and Outlook
// prefer `text/html` and will paste a *hyperlinked* image from it; everything else takes the
// `image/png` and pastes a plain picture, which is still a good outcome. Both go into a single
// ClipboardItem, because a second write would replace the first rather than add to it.
import { createShareLink, type ShareSizeLevel } from "./urlCodec";
import { diagramToPngBlob } from "../file/pngExport";
import type { DiagramDocument, Diagram } from "../model/types";

/** Spec: 2x scale, white background, tight bounds plus 24px padding. */
export const COPY_IMAGE_OPTIONS = { background: "#ffffff", padding: 24, scale: 2 } as const;

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("Could not read the rendered image."));
    reader.readAsDataURL(blob);
  });
}

/**
 * Attribute-escapes a URL for embedding in HTML. The share link carries `&v=` between its
 * fragment parameters, and a bare `&` in an href is at best fragile and at worst silently
 * mangled by whichever HTML parser the receiving application uses.
 */
function escapeAttribute(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function buildLinkedImageHtml(dataUrl: string, shareUrl: string, altText: string): string {
  const href = escapeAttribute(shareUrl);
  const alt = escapeAttribute(altText);
  return `<a href="${href}"><img src="${escapeAttribute(dataUrl)}" alt="${alt}"></a>`;
}

/** The same image with no link, for when the diagram is too big to fit in a URL. */
export function buildPlainImageHtml(dataUrl: string, altText: string): string {
  return `<img src="${escapeAttribute(dataUrl)}" alt="${escapeAttribute(altText)}">`;
}

/**
 * The clipboard flavours, as a plain MIME-to-Blob map. Deliberately separate from the write
 * itself: this is the part worth asserting on, and building a real ClipboardItem needs a
 * browser, so keeping them apart is what lets the interesting half be unit-tested.
 */
export async function buildClipboardPayload(
  png: Blob,
  shareUrl: string | null,
  altText: string,
): Promise<Record<string, Blob>> {
  const dataUrl = await blobToDataUrl(png);
  const html = shareUrl ? buildLinkedImageHtml(dataUrl, shareUrl, altText) : buildPlainImageHtml(dataUrl, altText);
  return {
    "image/png": png,
    "text/html": new Blob([html], { type: "text/html" }),
  };
}

export interface CopyImageOutcome {
  ok: boolean;
  /** "too-large" means the image was copied but carries no link. */
  level: ShareSizeLevel;
  /** Absent when the document was too large to encode into a URL. */
  url?: string;
  /** Present only when nothing could be copied at all. */
  error?: string;
}

/**
 * Renders the current diagram, builds its share link and puts both on the clipboard.
 *
 * A document too large for a URL still gets its image copied — losing the picture as well as
 * the link would punish the user twice for the same problem — and the outcome says so, so the
 * caller can offer the file download instead.
 */
export async function copyImageWithLiveLink(doc: DiagramDocument, diagram: Diagram): Promise<CopyImageOutcome> {
  let png: Blob;
  try {
    png = await diagramToPngBlob(diagram, { ...COPY_IMAGE_OPTIONS, diagrams: doc.diagrams, assets: doc.assets });
  } catch {
    return { ok: false, level: "too-large", error: "Couldn't render this diagram to an image." };
  }

  const link = await createShareLink(doc);
  const tooLarge = link.level === "too-large";
  const payload = await buildClipboardPayload(png, tooLarge ? null : link.url, diagram.title);

  try {
    await navigator.clipboard.write([new ClipboardItem(payload)]);
  } catch {
    return {
      ok: false,
      level: link.level,
      url: tooLarge ? undefined : link.url,
      error: "Your browser wouldn't let the app write to the clipboard.",
    };
  }

  return { ok: true, level: link.level, url: tooLarge ? undefined : link.url };
}
