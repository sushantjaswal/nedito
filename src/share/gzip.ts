// gzip via the platform's own CompressionStream — no library.
//
// docs/archive/portable-diagrams-spec.md proposed adding `pako` here, calling it "the only mature
// browser-side deflate". That was true for years but no longer is: CompressionStream is
// supported in every browser this app already requires, and `file/pdfExport.ts` has depended on
// it since D46, so the baseline is already set and a 45KB dependency would buy nothing.
//
// Streams are built by hand rather than via `new Blob([...]).stream()` (pdfExport's approach)
// because jsdom's Blob has no .stream(), which would make every test here need a browser.

// Typed as BufferSource, not Uint8Array: that is what CompressionStream's writable side
// accepts, and pipeThrough requires the two to line up exactly.
function toStream(bytes: Uint8Array<ArrayBuffer>): ReadableStream<BufferSource> {
  return new ReadableStream<BufferSource>({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  });
}

async function collect(stream: ReadableStream): Promise<Uint8Array<ArrayBuffer>> {
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export async function gzip(bytes: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> {
  return collect(toStream(bytes).pipeThrough(new CompressionStream("gzip")));
}

/** Rejects on malformed input — a truncated or corrupted link lands here first. */
export async function gunzip(bytes: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> {
  return collect(toStream(bytes).pipeThrough(new DecompressionStream("gzip")));
}
