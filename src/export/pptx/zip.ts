// Minimal ZIP writer. A .pptx is a ZIP of XML parts, and this is the smallest correct writer
// that produces one.
//
// Hand-rolled rather than adding a dependency, for the same reason file/pdfWriter.ts is
// (D46): the format's hard parts are a CRC and two record layouts, the platform already
// supplies the compressor via CompressionStream, and a ZIP library would bring a general
// reader/writer we have no use for.
//
// Deliberately limited: no ZIP64, no encryption, no directory entries. A .pptx that needed
// ZIP64 would be a diagram nobody wants to open anyway.

/** Standard CRC-32 (IEEE 802.3), the checksum every ZIP entry carries. */
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c >>> 0;
  }
  return table;
})();

export function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

async function deflateRaw(bytes: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> {
  // Hand-built stream rather than Blob.stream(), matching share/gzip.ts: jsdom's Blob has no
  // .stream(), and routing through one would put these tests behind a real browser.
  const source = new ReadableStream<BufferSource>({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  });
  const out = source.pipeThrough(new CompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(out).arrayBuffer());
}

export interface ZipEntry {
  /** Path inside the archive, forward slashes, no leading slash. */
  path: string;
  data: Uint8Array | string;
  /**
   * Store instead of deflating. Worth it for data that is already compressed — a PNG deflates
   * to within a rounding error of its own size, so the CPU buys nothing.
   */
  store?: boolean;
}

interface PreparedEntry {
  nameBytes: Uint8Array;
  body: Uint8Array;
  crc: number;
  uncompressedSize: number;
  method: number;
  offset: number;
}

function toBytes(data: Uint8Array | string): Uint8Array<ArrayBuffer> {
  return typeof data === "string" ? new TextEncoder().encode(data) : (data as Uint8Array<ArrayBuffer>);
}

function writeU32(view: DataView, offset: number, value: number): void {
  view.setUint32(offset, value >>> 0, true);
}

/**
 * Builds the archive. Every entry is written with a fixed 1980-01-01 timestamp so the same
 * document exports to byte-identical bytes — a diff-friendly habit the `.nedito` format
 * already follows, and one that makes "did this export change?" answerable.
 */
export async function createZip(entries: ZipEntry[]): Promise<Uint8Array<ArrayBuffer>> {
  const prepared: PreparedEntry[] = [];
  const chunks: Uint8Array[] = [];
  let offset = 0;

  for (const entry of entries) {
    const raw = toBytes(entry.data);
    const nameBytes = new TextEncoder().encode(entry.path);
    const store = entry.store ?? false;
    const body = store ? raw : await deflateRaw(raw);
    const crc = crc32(raw);

    const header = new Uint8Array(30 + nameBytes.length);
    const view = new DataView(header.buffer);
    writeU32(view, 0, 0x04034b50); // local file header signature
    view.setUint16(4, 20, true); // version needed to extract (2.0 = deflate)
    view.setUint16(6, 0, true); // flags
    view.setUint16(8, store ? 0 : 8, true); // 0 = stored, 8 = deflated
    view.setUint16(10, 0, true); // mod time
    view.setUint16(12, 33, true); // mod date: 1980-01-01
    writeU32(view, 14, crc);
    writeU32(view, 18, body.length);
    writeU32(view, 22, raw.length);
    view.setUint16(26, nameBytes.length, true);
    view.setUint16(28, 0, true); // extra field length
    header.set(nameBytes, 30);

    chunks.push(header, body);
    prepared.push({
      nameBytes,
      body,
      crc,
      uncompressedSize: raw.length,
      method: store ? 0 : 8,
      offset,
    });
    offset += header.length + body.length;
  }

  const centralStart = offset;
  for (const entry of prepared) {
    const record = new Uint8Array(46 + entry.nameBytes.length);
    const view = new DataView(record.buffer);
    writeU32(view, 0, 0x02014b50); // central directory header signature
    view.setUint16(4, 20, true); // version made by
    view.setUint16(6, 20, true); // version needed
    view.setUint16(8, 0, true); // flags
    view.setUint16(10, entry.method, true);
    view.setUint16(12, 0, true); // mod time
    view.setUint16(14, 33, true); // mod date
    writeU32(view, 16, entry.crc);
    writeU32(view, 20, entry.body.length);
    writeU32(view, 24, entry.uncompressedSize);
    view.setUint16(28, entry.nameBytes.length, true);
    view.setUint16(30, 0, true); // extra
    view.setUint16(32, 0, true); // comment
    view.setUint16(34, 0, true); // disk number
    view.setUint16(36, 0, true); // internal attrs
    writeU32(view, 38, 0); // external attrs
    writeU32(view, 42, entry.offset);
    record.set(entry.nameBytes, 46);
    chunks.push(record);
    offset += record.length;
  }

  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  writeU32(endView, 0, 0x06054b50); // end of central directory signature
  endView.setUint16(4, 0, true); // this disk
  endView.setUint16(6, 0, true); // disk with central directory
  endView.setUint16(8, prepared.length, true);
  endView.setUint16(10, prepared.length, true);
  writeU32(endView, 12, offset - centralStart);
  writeU32(endView, 16, centralStart);
  endView.setUint16(20, 0, true); // comment length
  chunks.push(end);

  const total = chunks.reduce((sum, c) => sum + c.length, 0);
  const result = new Uint8Array(total);
  let at = 0;
  for (const chunk of chunks) {
    result.set(chunk, at);
    at += chunk.length;
  }
  return result;
}
