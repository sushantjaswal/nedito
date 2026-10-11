// Reading a Nedito document back out of a .docx this app wrote.
//
// The other half of the spec's round-trip requirement: exporting to Word must not be a one-way
// trip. The docx carries the whole `.nedito` JSON in a custom XML part, so a file that has
// been mailed around, commented on and sent back is still the source document.
//
// Only our own custom part is read. Nothing tries to reconstruct a diagram from Word content —
// a docx written by Word has no diagram in it, and guessing would be worse than saying so.
import { decompress, MAX_FILE_PART_BYTES, TooLargeError } from "../../file/decompress";
import { decodeDoc } from "../../file/documentFormat";
import { BRAND } from "../../app/brand";
import { isDocumentCustomXml, readCustomXmlJson } from "./docxParts";
import type { DiagramDocument } from "../../model/types";

export type DocxDecodeResult = { ok: true; doc: DiagramDocument } | { ok: false; error: string };

/** The document part inside a Word export, inflated with a limit (file/decompress.ts). */
function inflateRaw(bytes: Uint8Array): Promise<Uint8Array> {
  return decompress(bytes, "deflate-raw", MAX_FILE_PART_BYTES);
}

/**
 * Yields the entries whose names pass `wanted`, by walking local file headers. Deliberately
 * minimal: the only thing ever read from a docx is our custom XML part, so a general reader
 * would be more code and more ways to be wrong.
 */
async function* readZipEntries(zip: Uint8Array, wanted: (name: string) => boolean): AsyncGenerator<Uint8Array> {
  const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  let offset = 0;

  while (offset + 30 <= zip.length && view.getUint32(offset, true) === 0x04034b50) {
    const flags = view.getUint16(offset + 6, true);
    const method = view.getUint16(offset + 8, true);
    const compressedSize = view.getUint32(offset + 18, true);
    const nameLength = view.getUint16(offset + 26, true);
    const extraLength = view.getUint16(offset + 28, true);
    const name = new TextDecoder().decode(zip.subarray(offset + 30, offset + 30 + nameLength));
    const dataStart = offset + 30 + nameLength + extraLength;

    // Bit 3 means the sizes live in a trailing data descriptor rather than the header, so the
    // entry cannot be located by walking forward. Word does not write these, but a file
    // rewritten by some other tool might — stop rather than read garbage.
    if (flags & 0x08) return;

    if (wanted(name)) {
      const body = zip.subarray(dataStart, dataStart + compressedSize);
      yield method === 0 ? new Uint8Array(body) : await inflateRaw(body);
    }
    offset = dataStart + compressedSize;
  }
}

/**
 * Our part, wherever it now lives. We write customXml/item1.xml, but a file saved in Word is
 * renumbered by Word — its own parts can take item1 — so the part is found by its namespace,
 * not its name.
 */
async function findDocumentPart(zip: Uint8Array): Promise<string | null> {
  for await (const bytes of readZipEntries(zip, (name) => /^customXml\/item\d+\.xml$/.test(name))) {
    const xml = new TextDecoder().decode(bytes);
    if (isDocumentCustomXml(xml)) return xml;
  }
  return null;
}

export async function decodeDocx(buffer: ArrayBuffer): Promise<DocxDecodeResult> {
  const zip = new Uint8Array(buffer);
  if (zip.length < 4 || zip[0] !== 0x50 || zip[1] !== 0x4b) {
    return { ok: false, error: "This doesn't look like a Word file." };
  }

  let part: string | null;
  try {
    part = await findDocumentPart(zip);
  } catch (e) {
    if (e instanceof TooLargeError) return { ok: false, error: "This Word file's diagram is too large to open." };
    return { ok: false, error: "This Word file couldn't be read — it may be damaged." };
  }

  if (!part) {
    return {
      ok: false,
      error: `This Word file doesn't carry a ${BRAND.name} diagram. Only documents exported from ${BRAND.name} can be opened again.`,
    };
  }

  const json = readCustomXmlJson(part);
  if (!json) {
    return { ok: false, error: `The ${BRAND.name} data inside this Word file couldn't be read.` };
  }

  // Straight into the ordinary format decoder, so the embedded copy gets the same validation
  // and version migration as any opened file.
  return decodeDoc(json);
}
