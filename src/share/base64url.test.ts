import { describe, expect, it } from "vitest";
import { base64UrlToBytes, bytesToBase64Url } from "./base64url";

describe("base64url", () => {
  it("round-trips arbitrary bytes", () => {
    const bytes = new Uint8Array(256);
    for (let i = 0; i < 256; i += 1) bytes[i] = i;
    expect(Array.from(base64UrlToBytes(bytesToBase64Url(bytes)))).toEqual(Array.from(bytes));
  });

  it("emits only URL-safe characters, with no padding", () => {
    // Every remainder-mod-3 case, so the padding-producing lengths are all covered.
    for (const length of [1, 2, 3, 4, 5, 6, 100]) {
      const encoded = bytesToBase64Url(new Uint8Array(length).fill(0xfb));
      expect(encoded).toMatch(/^[A-Za-z0-9_-]*$/);
    }
  });

  it("round-trips a payload larger than the charcode chunk size", () => {
    // Guards the chunking in bytesToBase64Url: String.fromCharCode(...bytes) on an array this
    // size overflows the call stack, which is exactly the size a real diagram reaches.
    const bytes = new Uint8Array(200_000);
    for (let i = 0; i < bytes.length; i += 1) bytes[i] = i % 251;
    const back = base64UrlToBytes(bytesToBase64Url(bytes));
    expect(back.length).toBe(bytes.length);
    expect(back[0]).toBe(bytes[0]);
    expect(back[199_999]).toBe(bytes[199_999]);
  });

  it("round-trips UTF-8 text outside the ASCII range", () => {
    const text = "Zahlungsdienst › 支払い › ✅ émoji 🎉";
    const back = new TextDecoder().decode(base64UrlToBytes(bytesToBase64Url(new TextEncoder().encode(text))));
    expect(back).toBe(text);
  });
});
