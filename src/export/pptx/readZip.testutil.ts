// A minimal ZIP *reader*, for tests only.
//
// The app never reads a ZIP, so this deliberately does not live in zip.ts. Its whole purpose
// is to stop the package tests marking their own homework: without an independent reader, a
// test can only assert that the writer agrees with itself.
//
// Walks local file headers in order, which is valid for archives this writer produces (no
// data descriptors, no ZIP64, no encryption).

async function inflateRaw(bytes: Uint8Array): Promise<Uint8Array> {
  const source = new ReadableStream<BufferSource>({
    start(controller) {
      controller.enqueue(bytes as unknown as BufferSource);
      controller.close();
    },
  });
  const out = source.pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(out).arrayBuffer());
}

export async function readZip(zip: Uint8Array): Promise<Map<string, Uint8Array>> {
  const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  const parts = new Map<string, Uint8Array>();
  let offset = 0;

  while (offset + 4 <= zip.length && view.getUint32(offset, true) === 0x04034b50) {
    const method = view.getUint16(offset + 8, true);
    const compressedSize = view.getUint32(offset + 18, true);
    const nameLength = view.getUint16(offset + 26, true);
    const extraLength = view.getUint16(offset + 28, true);

    const nameStart = offset + 30;
    const name = new TextDecoder().decode(zip.subarray(nameStart, nameStart + nameLength));
    const dataStart = nameStart + nameLength + extraLength;
    const body = zip.subarray(dataStart, dataStart + compressedSize);

    parts.set(name, method === 0 ? new Uint8Array(body) : await inflateRaw(body));
    offset = dataStart + compressedSize;
  }

  return parts;
}

export async function readZipText(zip: Uint8Array, path: string): Promise<string> {
  const parts = await readZip(zip);
  const bytes = parts.get(path);
  if (!bytes) throw new Error(`${path} is not in the archive. Present: ${[...parts.keys()].join(", ")}`);
  return new TextDecoder().decode(bytes);
}
