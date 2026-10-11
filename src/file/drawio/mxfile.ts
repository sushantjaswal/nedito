// Unwrapping a .drawio file down to one mxGraphModel per page.
//
// A .drawio file is an <mxfile> holding one <diagram> per page. The <diagram>'s content is
// either the <mxGraphModel> XML inline (draw.io's current default) or, with the "Compressed"
// save option, a base64 string that has to be deflate-decompressed and then URI-decoded. Both
// are common in the wild — the compressed form was the default for years — so an importer that
// only reads one of them fails on half the files people actually have.

import { decompress, MAX_FILE_PART_BYTES, TooLargeError } from "../decompress";

/** Raw deflate, no zlib header: what draw.io's compressed payloads are wrapped in. Inflated with a limit (file/decompress.ts). */
function inflateRaw(bytes: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> {
  return decompress(bytes, "deflate-raw", MAX_FILE_PART_BYTES);
}

function base64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export interface DrawioPage {
  name: string;
  /** The <mxGraphModel> element for this page. */
  model: Element;
}

export interface UnwrapResult {
  ok: boolean;
  pages: DrawioPage[];
  error?: string;
}

function parseXml(text: string): Document | null {
  const doc = new DOMParser().parseFromString(text, "text/xml");
  // DOMParser reports failure by *returning a document describing the failure* rather than
  // throwing, so the parsererror element is the only reliable signal.
  return doc.querySelector("parsererror") ? null : doc;
}

/**
 * Turns .drawio text into one mxGraphModel element per page. Never throws: a file that is not
 * draw.io XML at all, or whose compressed payload is corrupt, comes back as `ok: false` with a
 * sentence the File menu can show.
 */
export async function unwrapMxfile(text: string): Promise<UnwrapResult> {
  const doc = parseXml(text);
  if (!doc) return { ok: false, pages: [], error: "This file isn't valid XML." };

  const root = doc.documentElement;
  // A bare <mxGraphModel> (what "Edit Diagram…" shows, and what people paste) is a legitimate
  // input with no <mxfile> wrapper and therefore exactly one unnamed page.
  if (root.nodeName === "mxGraphModel") {
    return { ok: true, pages: [{ name: "Page 1", model: root }] };
  }
  if (root.nodeName !== "mxfile") {
    return { ok: false, pages: [], error: "This isn't a draw.io file — expected an <mxfile> or <mxGraphModel> root." };
  }

  const diagrams = Array.from(root.getElementsByTagName("diagram"));
  if (diagrams.length === 0) return { ok: false, pages: [], error: "This draw.io file has no pages in it." };

  const pages: DrawioPage[] = [];
  for (const [index, diagram] of diagrams.entries()) {
    const name = diagram.getAttribute("name")?.trim() || `Page ${index + 1}`;
    const inline = diagram.getElementsByTagName("mxGraphModel")[0];
    if (inline) {
      pages.push({ name, model: inline });
      continue;
    }

    const payload = (diagram.textContent ?? "").trim();
    if (!payload) continue; // a genuinely empty page; not an error
    let xml: string;
    try {
      const inflated = await inflateRaw(base64ToBytes(payload));
      xml = decodeURIComponent(new TextDecoder().decode(inflated));
    } catch (e) {
      if (e instanceof TooLargeError) return { ok: false, pages: [], error: `Page "${name}" is too large to open.` };
      return {
        ok: false,
        pages: [],
        error: `Couldn't read the compressed contents of page "${name}". The file may be damaged.`,
      };
    }
    const inner = parseXml(xml);
    const model = inner?.documentElement;
    if (!model || model.nodeName !== "mxGraphModel") {
      return { ok: false, pages: [], error: `Page "${name}" didn't contain a diagram once decompressed.` };
    }
    pages.push({ name, model });
  }

  if (pages.length === 0) return { ok: false, pages: [], error: "This draw.io file has no pages in it." };
  return { ok: true, pages };
}
