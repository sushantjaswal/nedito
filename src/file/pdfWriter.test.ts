import { describe, expect, it } from "vitest";
import { buildSingleImagePdf } from "./pdfWriter";

const decoder = new TextDecoder("latin1");

function build(overrides: Partial<Parameters<typeof buildSingleImagePdf>[0]> = {}) {
  return buildSingleImagePdf({
    imageData: new Uint8Array([1, 2, 3, 4, 5]),
    imageWidth: 20,
    imageHeight: 10,
    pageWidthPt: 595.28,
    pageHeightPt: 841.89,
    ...overrides,
  });
}

describe("buildSingleImagePdf", () => {
  it("produces a file that self-identifies as PDF and terminates properly", () => {
    const text = decoder.decode(build());
    expect(text.startsWith("%PDF-1.4\n")).toBe(true);
    expect(text.trimEnd().endsWith("%%EOF")).toBe(true);
  });

  it("writes the page box in points", () => {
    expect(decoder.decode(build())).toContain("/MediaBox [0 0 595.28 841.89]");
  });

  it("declares the image as 8-bit DeviceRGB with FlateDecode and the right byte length", () => {
    const text = decoder.decode(build());
    expect(text).toContain("/Subtype /Image /Width 20 /Height 10");
    expect(text).toContain("/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode /Length 5");
  });

  it("embeds the image bytes verbatim", () => {
    const imageData = new Uint8Array([0xde, 0xad, 0xbe, 0xef]);
    const bytes = build({ imageData });
    // Search for the raw sequence rather than decoding — these bytes aren't text.
    const found = bytes.some((_, i) => imageData.every((b, j) => bytes[i + j] === b));
    expect(found).toBe(true);
  });

  it("writes xref offsets that actually point at their objects", () => {
    const bytes = build();
    const text = decoder.decode(bytes);
    const xrefAt = Number(text.slice(text.lastIndexOf("startxref") + "startxref".length).trim().split("\n")[0]);
    expect(text.slice(xrefAt, xrefAt + 4)).toBe("xref");

    // Every entry must land exactly on its "<n> 0 obj" header, which is what makes the file
    // readable at all — a drifted offset yields a PDF that opens as blank or corrupt.
    const entries = [...text.matchAll(/^(\d{10}) 00000 n $/gm)].map((m) => Number(m[1]));
    expect(entries).toHaveLength(6);
    entries.forEach((at, i) => {
      expect(text.slice(at, at + `${i + 1} 0 obj`.length)).toBe(`${i + 1} 0 obj`);
    });
  });

  it("escapes parentheses in the title so the string object stays balanced", () => {
    expect(decoder.decode(build({ title: "Plan (v2)" }))).toContain("/Title (Plan \\(v2\\))");
  });
});
