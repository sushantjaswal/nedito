// draw.io's pictures, read into Nedito's own.
//
// draw.io draws a picture as a vertex styled `shape=image` (or with the bare name `image`) whose
// `image=` key holds the picture itself. Before Nedito had images these arrived as plain
// rectangles with an import notice; now an embedded picture becomes a real image node.
//
// Three forms turn up in real files:
//   image=data:image/png,iVBORw0…        draw.io's own: base64, with the ";base64" left out,
//                                          because ";" separates style keys
//   image=data:image/png;base64,iVBOR…   other tools' — the style parser splits it at the ";"
//   image=https://… or img/lib/…         a link; never fetched, because nothing here goes online
import { sniffImageType } from "../imageImport";
import type { MxStyle } from "./mxStyle";

export function isImageCell(style: MxStyle): boolean {
  return (style.keys.shape ?? "").toLowerCase() === "image" || style.names.includes("image");
}

/**
 * The `image=` value from a raw style string, read directly rather than from the parsed style: a
 * `data:…;base64,…` value contains the very ";" the parser splits on.
 */
export function imageRefFromStyle(rawStyle: string | null | undefined): string | null {
  const raw = rawStyle ?? "";
  const m = /(?:^|;)\s*image=([^;]*)(;base64,[^;]*)?/.exec(raw);
  if (!m || !m[1]) return null;
  return m[1] + (m[2] ?? "");
}

export type DrawioPicture =
  | { kind: "embedded"; bytes: Uint8Array }
  | { kind: "linked" }
  | { kind: "unreadable" };

function base64Bytes(text: string): Uint8Array | null {
  const clean = text.replace(/\s+/g, "");
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(clean) || clean.length % 4 === 1) return null;
  try {
    return Uint8Array.from(atob(clean), (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
}

/** What a picture reference holds: bytes we can use, a link we will not follow, or nothing usable. */
export function readDrawioPicture(ref: string): DrawioPicture {
  if (!/^data:/i.test(ref)) return { kind: "linked" };
  const comma = ref.indexOf(",");
  if (comma < 0) return { kind: "unreadable" };
  const header = ref.slice(5, comma).toLowerCase();
  const payload = ref.slice(comma + 1);

  // An SVG may be written as URL-encoded text instead of base64.
  let bytes: Uint8Array | null = null;
  if (!header.includes("base64") && /^(%3c|<)/i.test(payload)) {
    try {
      bytes = new TextEncoder().encode(decodeURIComponent(payload));
    } catch {
      return { kind: "unreadable" };
    }
  } else {
    bytes = base64Bytes(payload);
  }
  // The bytes decide what it is — the header is only a claim.
  if (!bytes || !sniffImageType(bytes)) return { kind: "unreadable" };
  return { kind: "embedded", bytes };
}
