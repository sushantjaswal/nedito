// base64url (RFC 4648 §5) for the share-link payload: the standard alphabet's "+" and "/" are
// not safe in a URL, and "=" padding is routinely mangled by tools that re-encode links, so we
// use the URL-safe alphabet and drop the padding (its length is recoverable).

// btoa/atob work on binary strings, so bytes have to be widened to charcodes and back. Done in
// chunks because String.fromCharCode(...bytes) spreads every byte as an argument and overflows
// the call stack somewhere around 100k on V8 — well within reach for a large diagram.
const CHUNK = 0x8000;

export function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function base64UrlToBytes(text: string): Uint8Array<ArrayBuffer> {
  const standard = text.replace(/-/g, "+").replace(/_/g, "/");
  // atob rejects an unpadded string, so restore the padding we stripped when encoding.
  const padded = standard + "=".repeat((4 - (standard.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
