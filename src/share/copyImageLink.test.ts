import { describe, expect, it } from "vitest";
import { buildClipboardPayload, buildLinkedImageHtml, buildPlainImageHtml, blobToDataUrl } from "./copyImageLink";

const PNG = () => new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], { type: "image/png" });
const SHARE_URL = "https://example.test/app/#d=H4sIAAAA_payload&v=2";

describe("buildClipboardPayload", () => {
  // The acceptance criterion from docs/archive/portable-diagrams-spec.md item 2 (D56): one write, two flavours.
  // Two separate writes would not add a flavour, it would replace the first one.
  it("carries both image/png and text/html", async () => {
    const payload = await buildClipboardPayload(PNG(), SHARE_URL, "My diagram");
    expect(Object.keys(payload).sort()).toEqual(["image/png", "text/html"]);
    expect(payload["image/png"].type).toBe("image/png");
    expect(payload["text/html"].type).toBe("text/html");
  });

  it("wraps the image in an anchor pointing at the share link", async () => {
    const payload = await buildClipboardPayload(PNG(), SHARE_URL, "My diagram");
    const html = await payload["text/html"].text();

    expect(html).toMatch(/^<a href="[^"]+"><img src="data:image\/png;base64,[^"]*" alt="My diagram"><\/a>$/);
    // The href must survive HTML parsing intact, ampersand and all.
    expect(html).toContain("d=H4sIAAAA_payload&amp;v=2");
  });

  it("still copies the picture when there is no link to attach", async () => {
    const payload = await buildClipboardPayload(PNG(), null, "My diagram");
    const html = await payload["text/html"].text();

    expect(Object.keys(payload)).toContain("image/png");
    expect(html).toContain("<img");
    expect(html).not.toContain("<a ");
  });
});

describe("buildLinkedImageHtml", () => {
  // A bare "&" in an href is at best fragile and at worst silently mangled by whichever HTML
  // parser the receiving application uses — and every share link has one, between #d= and &v=.
  it("escapes the ampersands every share link contains", () => {
    const html = buildLinkedImageHtml("data:image/png;base64,AAA", "https://x.test/#d=abc&v=2", "t");
    expect(html).toContain('href="https://x.test/#d=abc&amp;v=2"');
    expect(html).not.toContain("abc&v=2");
  });

  it("escapes a title that would otherwise break out of the alt attribute", () => {
    const html = buildLinkedImageHtml("data:image/png;base64,AAA", "https://x.test/#d=a", 'Q3 "review" <draft>');
    expect(html).toContain("alt=\"Q3 &quot;review&quot; &lt;draft&gt;\"");
    // Nothing unescaped escaped the attribute.
    expect(html.match(/alt="/g)).toHaveLength(1);
  });

  it("produces a plain image with no anchor when asked", () => {
    const html = buildPlainImageHtml("data:image/png;base64,AAA", "t");
    expect(html.startsWith("<img")).toBe(true);
    expect(html).not.toContain("</a>");
  });
});

describe("blobToDataUrl", () => {
  it("returns a data: URL the clipboard HTML can embed directly", async () => {
    const dataUrl = await blobToDataUrl(PNG());
    expect(dataUrl.startsWith("data:image/png;base64,")).toBe(true);
  });
});
