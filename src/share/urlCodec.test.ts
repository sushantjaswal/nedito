import { describe, expect, it } from "vitest";
import { addNode } from "../model/actions";
import { CURRENT_FORMAT_VERSION } from "../file/documentFormat";
import { SHARE_URL_MAX_CHARS, SHARE_URL_WARN_CHARS } from "./constants";
import { slimDocForShare } from "./slimDoc";
import { docAtDepth0, docAtDepth1, docAtDepth3, shape, withBlankPage } from "./testDocs";
import {
  buildShareUrl,
  classifyShareUrl,
  decodeFragmentToDoc,
  encodeDocToFragment,
  isShareFragment,
} from "./urlCodec";

async function roundTrip(doc: Parameters<typeof encodeDocToFragment>[0]) {
  return decodeFragmentToDoc(await encodeDocToFragment(doc));
}

describe("encodeDocToFragment / decodeFragmentToDoc", () => {
  // docs/archive/portable-diagrams-spec.md's acceptance criterion (D51): round-trip at depth 0, 1 and 3.
  it.each([
    ["depth 0", docAtDepth0],
    ["depth 1", docAtDepth1],
    ["depth 3", docAtDepth3],
  ])("round-trips a document at %s", async (_name, build) => {
    const doc = build();
    const result = await roundTrip(doc);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.doc).toEqual(slimDocForShare(doc));
  });

  it("round-trips the SLIMMED document, not the original, when there is slack to drop", async () => {
    const { doc, blankPageId } = withBlankPage(docAtDepth1());
    const result = await roundTrip(doc);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.doc.diagrams[blankPageId]).toBeUndefined();
      expect(result.doc).toEqual(slimDocForShare(doc));
    }
  });

  it("preserves labels outside the ASCII range", async () => {
    let doc = docAtDepth0();
    doc = addNode(doc, "root", { ...shape("intl"), label: { text: "支払い · Zahlungsdienst ✅" } });
    const result = await roundTrip(doc);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const node = result.doc.diagrams.root.nodes.find((n) => n.id === "intl");
      expect(node?.label?.text).toBe("支払い · Zahlungsdienst ✅");
    }
  });

  it("produces a fragment that is safe to put in a URL verbatim", async () => {
    const fragment = await encodeDocToFragment(docAtDepth1());
    expect(fragment).toMatch(/^d=[A-Za-z0-9_-]+&v=\d+$/);
    // The payload itself carries nothing that would need escaping, be eaten by a mail client,
    // or split the fragment — only the "d="/"&v=" separators use reserved characters.
    const payload = new URLSearchParams(fragment).get("d")!;
    expect(payload).not.toMatch(/[#?%+/=\s]/);
  });

  it("compresses — a real diagram is smaller as a link than as raw JSON", async () => {
    const doc = docAtDepth3();
    const fragment = await encodeDocToFragment(doc);
    expect(fragment.length).toBeLessThan(JSON.stringify(doc).length);
  });

  it("accepts a fragment with or without its leading #", async () => {
    const fragment = await encodeDocToFragment(docAtDepth0());
    const withHash = await decodeFragmentToDoc(`#${fragment}`);
    const without = await decodeFragmentToDoc(fragment);
    expect(withHash.ok).toBe(true);
    expect(without.ok).toBe(true);
  });

  it("tolerates extra parameters it does not know about", async () => {
    // Item 3 adds &p= for "open at this level"; an older build must not choke on a newer link.
    const fragment = await encodeDocToFragment(docAtDepth1());
    const result = await decodeFragmentToDoc(`${fragment}&p=somechild&future=1`);
    expect(result.ok).toBe(true);
  });
});

describe("decodeFragmentToDoc — bad input never throws", () => {
  it("reports a damaged link when the payload is corrupted", async () => {
    const fragment = await encodeDocToFragment(docAtDepth1());
    // Cut it short, exactly as a mail client wrapping a long URL would.
    const truncated = fragment.slice(0, Math.floor(fragment.indexOf("&v=") / 2));
    const result = await decodeFragmentToDoc(truncated);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/damaged/i);
  });

  it("reports a damaged link for payload that is not base64 at all", async () => {
    const result = await decodeFragmentToDoc("d=not-a-real-payload&v=2");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/damaged/i);
  });

  it("names the version problem when the link came from a newer app", async () => {
    const fragment = await encodeDocToFragment(docAtDepth0());
    const bumped = fragment.replace(/&v=\d+$/, `&v=${CURRENT_FORMAT_VERSION + 1}`);
    const result = await decodeFragmentToDoc(bumped);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/newer version/i);
      expect(result.error).not.toMatch(/damaged/i);
    }
  });

  it("rejects a fragment with no diagram in it", async () => {
    const result = await decodeFragmentToDoc("v=2&something=else");
    expect(result.ok).toBe(false);
  });

  it("passes through the format layer's own validation message", async () => {
    // A well-formed link whose document breaks a model invariant: the port points at a node
    // that does not exist in the child diagram.
    const doc = docAtDepth1();
    const broken = JSON.parse(JSON.stringify(doc));
    const nested = broken.diagrams.root.nodes.find((n: { type: string }) => n.type === "nested");
    nested.ports = [{ id: "p1", side: "left", offset: 0.5, innerNodeId: "does-not-exist" }];
    const result = await decodeFragmentToDoc(await encodeDocToFragment(broken));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/validation/i);
  });
});

describe("isShareFragment", () => {
  it("recognises a share link", async () => {
    expect(isShareFragment(`#${await encodeDocToFragment(docAtDepth0())}`)).toBe(true);
  });

  it("ignores an empty or unrelated fragment", () => {
    expect(isShareFragment("")).toBe(false);
    expect(isShareFragment("#")).toBe(false);
    expect(isShareFragment("#section-two")).toBe(false);
    expect(isShareFragment("#v=2")).toBe(false);
  });
});

describe("classifyShareUrl", () => {
  it("classifies by length against the documented thresholds", () => {
    expect(classifyShareUrl("x".repeat(SHARE_URL_WARN_CHARS)).level).toBe("ok");
    expect(classifyShareUrl("x".repeat(SHARE_URL_WARN_CHARS + 1)).level).toBe("warn");
    expect(classifyShareUrl("x".repeat(SHARE_URL_MAX_CHARS)).level).toBe("warn");
    expect(classifyShareUrl("x".repeat(SHARE_URL_MAX_CHARS + 1)).level).toBe("too-large");
  });

  it("reports the character count it measured", () => {
    expect(classifyShareUrl("abc").chars).toBe(3);
  });
});

describe("buildShareUrl", () => {
  it("puts the payload after the # — never in the query string", () => {
    const url = buildShareUrl("d=abc&v=2", "https://example.test/app");
    expect(url).toBe("https://example.test/app#d=abc&v=2");
    // The privacy claim rests on this: everything after # is stripped before the request is
    // sent, so the diagram never reaches a server. A "?" here would silently undo that.
    expect(new URL(url).search).toBe("");
    expect(new URL(url).hash).toBe("#d=abc&v=2");
  });
});
