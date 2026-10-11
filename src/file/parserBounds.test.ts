// Every parser that reads bytes from outside is a boundary: it bounds its loops and allocations
// and fails cleanly on malformed input. These feed each one the hostile case — a decompression
// bomb, a document nested past any real depth, a drawio file with thousands of groups, bytes that
// are not what they claim — and require a clean result, never a crash or a hang.
import { deflateRawSync, gzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { decodeDocx } from "../export/docx/docxImport";
import { decodeFragmentToDoc } from "../share/urlCodec";
import { decompress, TooLargeError } from "./decompress";
import { CURRENT_FORMAT_VERSION, decodeDoc } from "./documentFormat";
import { decodeDrawio } from "./drawio/drawioImport";
import { decodeEditablePng } from "./editablePngFormat";
import { extractTextChunk } from "./pngChunks";

const MB = 1024 * 1024;
const zeros = (bytes: number) => Buffer.alloc(bytes);
const base64Url = (b: Uint8Array) => Buffer.from(b).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

describe("decompression stops at its limit", () => {
  it("rejects a stream once its output passes the limit, without reading the rest", async () => {
    await expect(decompress(gzipSync(zeros(4 * MB)), "gzip", MB)).rejects.toBeInstanceOf(TooLargeError);
    const fine = await decompress(gzipSync(zeros(MB / 2)), "gzip", MB);
    expect(fine.byteLength).toBe(MB / 2);
  });

  it("a share link that expands past 50 MB is refused as too large", async () => {
    const payload = base64Url(gzipSync(zeros(51 * MB), { level: 9 }));
    const r = await decodeFragmentToDoc(`d=${payload}&v=1`);
    expect(r).toEqual({ ok: false, error: "This link's diagram is too large to open." });
  });

  it("a Word export whose document part expands past 200 MB is refused as too large", async () => {
    const name = Buffer.from("customXml/item1.xml");
    const data = deflateRawSync(zeros(201 * MB), { level: 9 });
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50, 0);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(0, 6); // no data descriptor: sizes are in the header
    header.writeUInt16LE(8, 8); // deflate
    header.writeUInt32LE(data.length, 18);
    header.writeUInt32LE(201 * MB, 22);
    header.writeUInt16LE(name.length, 26);
    const zip = Buffer.concat([header, name, data]);
    const r = await decodeDocx(zip.buffer.slice(zip.byteOffset, zip.byteOffset + zip.byteLength));
    expect(r).toEqual({ ok: false, error: "This Word file's diagram is too large to open." });
  });

  it("a compressed drawio page that expands past 200 MB is refused as too large", async () => {
    const payload = deflateRawSync(zeros(201 * MB), { level: 9 }).toString("base64");
    const r = await decodeDrawio(`<mxfile><diagram id="p" name="Big">${payload}</diagram></mxfile>`, "big.drawio");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("too large");
  });
});

describe("nesting depth", () => {
  const chain = (depth: number) => {
    const id = (i: number) => `level${String(i).padStart(6, "0")}`;
    const diagrams: Record<string, unknown> = {};
    for (let i = 0; i < depth; i++) {
      const nodes =
        i + 1 < depth
          ? [{ id: `block${String(i).padStart(6, "0")}`, type: "nested", childDiagramId: id(i + 1), position: { x: 0, y: 0 }, size: { w: 10, h: 10 }, z: 1, style: {}, collapsed: { icons: [] }, ports: [] }]
          : [];
      diagrams[id(i)] = { id: id(i), title: `L${i}`, nodes, edges: [] };
    }
    return JSON.stringify({ format: "nedito", formatVersion: CURRENT_FORMAT_VERSION, meta: { title: "deep", created: "x", modified: "x", appVersion: "0.1.0" }, rootDiagramIds: [id(0)], diagrams });
  };

  it("opens a document nested 999 levels deep", () => {
    expect(decodeDoc(chain(999)).ok).toBe(true);
  });

  it("refuses one nested 20,000 levels deep with a message, instead of overflowing the stack", () => {
    const r = decodeDoc(chain(20000));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("more than 1000 levels deep");
  });
});

describe("the drawio importer with thousands of groups", () => {
  it("gives each of 2,000 groups its own member", async () => {
    let cells = "";
    for (let i = 0; i < 2000; i++) {
      cells += `<mxCell id="g${i}" value="" style="group" vertex="1" parent="1"><mxGeometry x="0" y="0" width="10" height="10" as="geometry"/></mxCell>`;
      cells += `<mxCell id="s${i}" value="" style="rounded=0" vertex="1" parent="g${i}"><mxGeometry x="1" y="1" width="5" height="5" as="geometry"/></mxCell>`;
    }
    const xml = `<mxfile><diagram id="d" name="P"><mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/>${cells}</root></mxGraphModel></diagram></mxfile>`;
    const r = await decodeDrawio(xml, "groups.drawio");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const diagram = Object.values(r.doc.diagrams)[0];
    const groups = diagram.nodes.filter((n) => n.type === "group");
    expect(groups).toHaveLength(2000);
    expect(groups.every((g) => g.type === "group" && g.childIds.length === 1)).toBe(true);
    // Members are indexed once rather than found by scanning every cell for every group. Timed in
    // Chromium, not here: jsdom's own DOM walk is quadratic and would swamp the measurement.
  }, 60000);
});

describe("malformed files fail cleanly", () => {
  it("a Word file that is truncated, or just bytes after its signature, gives a message", async () => {
    for (const bytes of [Buffer.from("PK"), Buffer.concat([Buffer.from("PK\x03\x04"), Buffer.alloc(20, 0xff)]), Buffer.from("PK\x03\x04garbage that is not a zip at all")]) {
      const r = await decodeDocx(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
      expect(r.ok).toBe(false);
    }
  });

  it("a PNG chunk walk survives a huge length, a truncated chunk and a keyword with no end", () => {
    const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    const chunk = (type: string, data: Uint8Array, length = data.length) => {
      const out = new Uint8Array(12 + data.length);
      new DataView(out.buffer).setUint32(0, length);
      out.set([...type].map((c) => c.charCodeAt(0)), 4);
      out.set(data, 8);
      return out;
    };
    const png = (...parts: Uint8Array[]) => Uint8Array.from([...sig, ...parts.flatMap((p) => [...p])]);
    expect(extractTextChunk(png(chunk("iTXt", new Uint8Array(10), 0xffffffff)))).toBeNull();
    expect(extractTextChunk(png(chunk("iTXt", new Uint8Array(4)).subarray(0, 9)))).toBeNull();
    expect(extractTextChunk(png(chunk("iTXt", new Uint8Array(300000).fill(0x41))))).toBeNull();
    // A keyword far past PNG's 79-byte limit, then its terminator: too many characters to spread.
    const longKeyword = new Uint8Array(300001).fill(0x41);
    longKeyword[300000] = 0;
    expect(extractTextChunk(png(chunk("iTXt", longKeyword)))).toBeNull();
    expect(extractTextChunk(Uint8Array.from([1, 2, 3]))).toBeNull();
  });

  it("an editable PNG that is not one says so", async () => {
    const r = await decodeEditablePng(new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3])]));
    expect(r.ok).toBe(false);
  });
});
