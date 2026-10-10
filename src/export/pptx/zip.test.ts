import { describe, expect, it } from "vitest";
import { createZip, crc32 } from "./zip";
import { readZip } from "./readZip.testutil";

describe("crc32", () => {
  // The canonical CRC-32 check value. If this is wrong every entry in every archive is wrong,
  // and the only symptom is an unzip tool calling the file corrupt.
  it("matches the standard test vector", () => {
    expect(crc32(new TextEncoder().encode("123456789"))).toBe(0xcbf43926);
  });

  it("is zero for empty input", () => {
    expect(crc32(new Uint8Array(0))).toBe(0);
  });
});

describe("createZip", () => {
  it("writes the local header, central directory and end record signatures", async () => {
    const zip = await createZip([{ path: "a.txt", data: "hello" }]);
    const view = new DataView(zip.buffer);
    expect(view.getUint32(0, true)).toBe(0x04034b50); // local file header
    expect(zip.length).toBeGreaterThan(22);
    // The end-of-central-directory record is the last 22 bytes when there is no comment.
    expect(new DataView(zip.buffer, zip.length - 22).getUint32(0, true)).toBe(0x06054b50);
  });

  it("round-trips deflated and stored entries", async () => {
    const text = "the quick brown fox ".repeat(40);
    const binary = new Uint8Array([0, 1, 2, 250, 255]);
    const zip = await createZip([
      { path: "deflated.txt", data: text },
      { path: "stored.bin", data: binary, store: true },
    ]);

    const parts = await readZip(zip);
    expect(new TextDecoder().decode(parts.get("deflated.txt"))).toBe(text);
    expect(Array.from(parts.get("stored.bin")!)).toEqual(Array.from(binary));
  });

  it("deflates by default and actually makes repetitive data smaller", async () => {
    const text = "x".repeat(5000);
    const zip = await createZip([{ path: "big.txt", data: text }]);
    expect(zip.length).toBeLessThan(1000);
  });

  it("keeps paths with directories intact", async () => {
    const zip = await createZip([{ path: "ppt/slides/slide1.xml", data: "<x/>" }]);
    const parts = await readZip(zip);
    expect([...parts.keys()]).toEqual(["ppt/slides/slide1.xml"]);
  });

  // Byte-stability is what makes "did this export change?" answerable, and it is why the
  // writer stamps a fixed 1980 date rather than the current time.
  it("produces identical bytes for identical input", async () => {
    const entries = [{ path: "a.xml", data: "<a/>" }, { path: "b.xml", data: "<b/>" }];
    const first = await createZip(entries);
    const second = await createZip(entries);
    expect(Array.from(first)).toEqual(Array.from(second));
  });

  it("handles an empty archive without producing something unreadable", async () => {
    const zip = await createZip([]);
    expect(zip.length).toBe(22);
    expect(await readZip(zip)).toEqual(new Map());
  });
});
