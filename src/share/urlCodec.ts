// Diagram-in-URL codec.
//
// PRIVACY — the reason this is a fragment and not a query string:
// everything after "#" is stripped by the browser before the request goes out. It is never in
// the request line, never in the Referer header, and never in a server access log. A shared
// diagram therefore travels inside the link itself and reaches no server, including ours, which
// is what keeps the local-only badge (app/LocalOnlyBadge.tsx) literally true. Moving this
// payload to a query parameter would silently break that promise, so: never do that.
import { appBaseUrl } from "../app/appOrigin";
import { CURRENT_FORMAT_VERSION, decodeDoc, encodeDoc, writtenVersion } from "../file/documentFormat";
import type { DiagramDocument } from "../model/types";
import { base64UrlToBytes, bytesToBase64Url } from "./base64url";
import { gunzip, gzip } from "./gzip";
import { TooLargeError } from "../file/decompress";
import {
  SHARE_CHARS_PER_KB,
  SHARE_PARAM_DOC,
  SHARE_PARAM_PATH,
  SHARE_PARAM_VERSION,
  SHARE_URL_MAX_CHARS,
  SHARE_URL_WARN_CHARS,
} from "./constants";
import { slimDocForShare } from "./slimDoc";

/**
 * Encodes a document into the fragment part of a share URL (the text after "#", without it).
 *
 * Pipeline: slim → the existing `.nedito` JSON writer → UTF-8 → gzip → base64url. Reusing
 * `encodeDoc` rather than serialising separately means a share link and a saved file always
 * carry byte-identical documents, and the decoder gets the format's validation and version
 * migration for free.
 *
 * Async because the platform's gzip is a stream. Callers are menu handlers and app boot, so
 * awaiting costs nothing.
 */
export interface ShareOptions {
  /**
   * Land the recipient on this diagram rather than on page one ("Open at this level"). Only
   * meaningful for a nested child; passing a root page id is harmless and simply no-ops.
   */
  openAtDiagramId?: string;
}

export async function encodeDocToFragment(doc: DiagramDocument, options: ShareOptions = {}): Promise<string> {
  const slim = slimDocForShare(doc);
  const json = encodeDoc(slim);
  const payload = bytesToBase64Url(await gzip(new TextEncoder().encode(json)));
  // The version the payload was written as, not the newest this app knows (D79).
  let fragment = `${SHARE_PARAM_DOC}=${payload}&${SHARE_PARAM_VERSION}=${writtenVersion(slim)}`;
  if (options.openAtDiagramId) {
    fragment += `&${SHARE_PARAM_PATH}=${encodeURIComponent(options.openAtDiagramId)}`;
  }
  return fragment;
}

/**
 * The diagram a share link asks to open at, or null. Returned unvalidated on purpose: whether
 * the id exists in the delivered document is the caller's business (the answer is "navigate
 * there, or stay on page one"), not something to fail the whole link over.
 */
export function readSharePath(fragment: string): string | null {
  return new URLSearchParams(stripHash(fragment)).get(SHARE_PARAM_PATH);
}

export type ShareDecodeResult = { ok: true; doc: DiagramDocument } | { ok: false; error: string };

/** True when this fragment is a share link at all — cheap enough to run on every app boot. */
export function isShareFragment(fragment: string): boolean {
  return new URLSearchParams(stripHash(fragment)).has(SHARE_PARAM_DOC);
}

function stripHash(fragment: string): string {
  return fragment.startsWith("#") ? fragment.slice(1) : fragment;
}

/**
 * Decodes a share fragment back into a validated document. Never throws: a link that has been
 * truncated by a mail client, re-wrapped by a wiki, or hand-edited is an entirely ordinary
 * thing to receive, and it has to produce a readable message rather than a stack trace.
 */
export async function decodeFragmentToDoc(fragment: string): Promise<ShareDecodeResult> {
  const params = new URLSearchParams(stripHash(fragment));
  const payload = params.get(SHARE_PARAM_DOC);
  if (!payload) return { ok: false, error: "This link doesn't contain a diagram." };

  // Checked before decompressing: if the link was written by a newer app there is no point
  // spending the work, and "damaged" would be the wrong thing to tell the reader.
  const declared = Number(params.get(SHARE_PARAM_VERSION));
  if (Number.isFinite(declared) && declared > CURRENT_FORMAT_VERSION) {
    return {
      ok: false,
      error: `This link was created with a newer version of the app (format v${declared}, this app supports up to v${CURRENT_FORMAT_VERSION}).`,
    };
  }

  let json: string;
  try {
    json = new TextDecoder().decode(await gunzip(base64UrlToBytes(payload)));
  } catch (e) {
    if (e instanceof TooLargeError) return { ok: false, error: "This link's diagram is too large to open." };
    return {
      ok: false,
      error: "This link is damaged — it may have been cut short when it was copied or sent.",
    };
  }

  return decodeDoc(json);
}

export type ShareSizeLevel = "ok" | "warn" | "too-large";

export interface ShareSize {
  chars: number;
  level: ShareSizeLevel;
}

/**
 * Classifies a finished URL by length. Callers must respect "too-large" by refusing to hand
 * out the link and offering the file download instead — a link that will be truncated in
 * transit is worse than no link, because the damage surfaces at the far end with nothing the
 * recipient can do about it.
 */
export function classifyShareUrl(url: string): ShareSize {
  const chars = url.length;
  if (chars > SHARE_URL_MAX_CHARS) return { chars, level: "too-large" };
  if (chars > SHARE_URL_WARN_CHARS) return { chars, level: "warn" };
  return { chars, level: "ok" };
}

/** Composes the absolute link. `base` defaults to the app's canonical address (appOrigin.ts). */
export function buildShareUrl(fragment: string, base?: string): string {
  const origin = base ?? appBaseUrl();
  return `${origin}#${fragment}`;
}

/** One call for the common case: document in, finished link and its size classification out. */
export async function createShareLink(
  doc: DiagramDocument,
  base?: string,
  options: ShareOptions = {},
): Promise<ShareSize & { url: string }> {
  const url = buildShareUrl(await encodeDocToFragment(doc, options), base);
  return { url, ...classifyShareUrl(url) };
}

/** "Link size: 4.2 KB of 16 KB", the indicator the share dialog shows. */
export function formatShareSize(chars: number): string {
  const kb = (chars / SHARE_CHARS_PER_KB).toFixed(1);
  const limit = Math.round(SHARE_URL_MAX_CHARS / SHARE_CHARS_PER_KB);
  return `Link size: ${kb} KB of ${limit} KB`;
}
