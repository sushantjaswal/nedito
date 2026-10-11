// Decompression with a limit on what comes out. Every compressed input Nedito reads comes from
// outside — a share link, a Word export, a drawio file — and a few hundred kilobytes of gzip can
// expand to gigabytes: read whole, that crashes the tab before anything has looked at it. This
// reads the output a chunk at a time and stops as soon as it passes `maxBytes`.
//
// Streams are hand-built rather than via Blob.stream(): jsdom's Blob has no .stream(), and that
// would put the tests behind a real browser.

/** The output passed the limit; nothing more was read. */
export class TooLargeError extends Error {
  constructor(public readonly maxBytes: number) {
    super(`The content expands to more than ${Math.round(maxBytes / 1024 / 1024)} MB.`);
    this.name = "TooLargeError";
  }
}

/** What a share link may expand to. A link that fits in a URL holds far less. */
export const MAX_LINK_BYTES = 50 * 1024 * 1024;
/** What a part of a file (a drawio diagram, the document inside a Word export) may expand to. */
export const MAX_FILE_PART_BYTES = 200 * 1024 * 1024;

/**
 * Decompresses `bytes`. Rejects with TooLargeError once the output passes `maxBytes`, and with the
 * stream's own error on malformed input.
 */
export async function decompress(
  bytes: Uint8Array,
  format: "gzip" | "deflate-raw",
  maxBytes: number,
): Promise<Uint8Array<ArrayBuffer>> {
  const source = new ReadableStream<BufferSource>({
    start(controller) {
      controller.enqueue(bytes as unknown as BufferSource);
      controller.close();
    },
  });
  const reader = source.pipeThrough(new DecompressionStream(format)).getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => {});
      throw new TooLargeError(maxBytes);
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let at = 0;
  for (const chunk of chunks) {
    out.set(chunk, at);
    at += chunk.byteLength;
  }
  return out;
}
