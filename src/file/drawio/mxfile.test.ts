import { describe, expect, it } from "vitest";
import { unwrapMxfile } from "./mxfile";

const MODEL = `<mxGraphModel dx="100" dy="100"><root><mxCell id="0"/><mxCell id="1" parent="0"/>
  <mxCell id="2" value="Compressed" style="rounded=0;" vertex="1" parent="1">
    <mxGeometry x="10" y="10" width="80" height="40" as="geometry"/>
  </mxCell></root></mxGraphModel>`;

/**
 * Builds the payload draw.io writes with the "Compressed" save option: the model XML is
 * URI-encoded, raw-deflated, then base64'd. Recreating it here rather than pasting a fixture
 * blob keeps the test readable and proves the round trip rather than one frozen sample.
 */
async function compress(xml: string): Promise<string> {
  const bytes = new TextEncoder().encode(encodeURIComponent(xml));
  const source = new ReadableStream<BufferSource>({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  });
  const deflated = new Uint8Array(
    await new Response(source.pipeThrough(new CompressionStream("deflate-raw"))).arrayBuffer(),
  );
  let binary = "";
  for (const byte of deflated) binary += String.fromCharCode(byte);
  return btoa(binary);
}

describe("unwrapMxfile", () => {
  it("reads an inline (uncompressed) page", async () => {
    const result = await unwrapMxfile(`<mxfile><diagram name="Inline">${MODEL}</diagram></mxfile>`);
    expect(result.ok).toBe(true);
    expect(result.pages).toHaveLength(1);
    expect(result.pages[0].name).toBe("Inline");
    expect(result.pages[0].model.nodeName).toBe("mxGraphModel");
  });

  // draw.io saved compressed by default for years, so a great many real files are this shape.
  // An importer that only reads the inline form fails on half of what people actually have.
  it("decompresses a deflate-raw page", async () => {
    const payload = await compress(MODEL);
    const result = await unwrapMxfile(`<mxfile><diagram name="Packed">${payload}</diagram></mxfile>`);

    expect(result.ok).toBe(true);
    expect(result.pages[0].name).toBe("Packed");
    expect(result.pages[0].model.querySelector('mxCell[value="Compressed"]')).not.toBeNull();
  });

  it("handles a file mixing compressed and inline pages", async () => {
    const payload = await compress(MODEL);
    const result = await unwrapMxfile(
      `<mxfile><diagram name="A">${payload}</diagram><diagram name="B">${MODEL}</diagram></mxfile>`,
    );
    expect(result.pages.map((p) => p.name)).toEqual(["A", "B"]);
  });

  it("names an unnamed page rather than leaving it blank", async () => {
    const result = await unwrapMxfile(`<mxfile><diagram>${MODEL}</diagram></mxfile>`);
    expect(result.pages[0].name).toBe("Page 1");
  });

  it("accepts a bare mxGraphModel with no mxfile wrapper", async () => {
    const result = await unwrapMxfile(MODEL);
    expect(result.ok).toBe(true);
    expect(result.pages).toHaveLength(1);
  });

  it("reports corrupt compressed content instead of throwing", async () => {
    const result = await unwrapMxfile(`<mxfile><diagram name="Broken">bm90LXJlYWxseS1kZWZsYXRlZA==</diagram></mxfile>`);
    expect(result.ok).toBe(false);
    expect(result.error).toContain("Broken");
  });

  it("rejects XML that is well-formed but not draw.io", async () => {
    const result = await unwrapMxfile(`<svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>`);
    expect(result.ok).toBe(false);
    expect(result.error).toContain("draw.io");
  });

  it("rejects text that isn't XML", async () => {
    const result = await unwrapMxfile("just some words");
    expect(result.ok).toBe(false);
  });
});
