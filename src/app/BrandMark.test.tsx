// The Nedito mark and icons (D101).
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { brandHead, MANIFEST_ICONS } from "../../vite.brand";
import { BrandMark } from "./BrandMark";

const publicFile = (src: string) => path.join("public", src.replace(/^\//, ""));

/** A PNG's width and height, from its IHDR chunk. */
function pngSize(file: string): { w: number; h: number } {
  const b = readFileSync(file);
  expect(b.subarray(1, 4).toString("latin1")).toBe("PNG");
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
}

describe("the mark", () => {
  it("is drawn inline in currentColor, so it takes the colour of the surface it sits on", () => {
    render(<BrandMark />);
    const mark = screen.getByTestId("nd-brand-mark");
    expect(mark).toHaveAttribute("aria-hidden", "true");
    const svg = mark.querySelector("svg")!;
    expect(svg).not.toBeNull();
    const shapes = svg.querySelectorAll("rect");
    expect(shapes.length).toBe(2);
    expect([...shapes].every((r) => r.getAttribute("stroke") === "currentColor" || r.getAttribute("fill") === "currentColor")).toBe(true);
    // The shapes keep their size; only the root lost its fixed one.
    expect(shapes[0].getAttribute("width")).toBe("48");
    expect(svg.hasAttribute("width")).toBe(false);
    // The file's provenance metadata stays in the file, not the page.
    expect(svg.querySelector("metadata")).toBeNull();
  });
});

describe("the icons", () => {
  it("every one the manifest lists exists, and each PNG is the size it claims", () => {
    for (const icon of MANIFEST_ICONS) {
      expect(existsSync(publicFile(icon.src)), icon.src).toBe(true);
      if (icon.type === "image/png") {
        const [w, h] = icon.sizes.split("x").map(Number);
        expect(pngSize(publicFile(icon.src)), icon.src).toEqual({ w, h });
      }
    }
    expect(MANIFEST_ICONS.map((i) => i.sizes)).toEqual(expect.arrayContaining(["192x192", "512x512"]));
  });

  it("every icon the page head links to exists: the 16px SVG favicon, its PNG fallback, the touch icon", () => {
    const hrefs = [...brandHead().matchAll(/rel="(?:icon|apple-touch-icon)"[^>]*href="([^"]+)"/g)].map((m) => m[1]);
    expect(hrefs).toEqual(["/icons/favicon-16.svg", "/icons/favicon-32.png", "/icons/apple-touch-icon-180.png"]);
    for (const href of hrefs) expect(existsSync(publicFile(href)), href).toBe(true);
    expect(pngSize(publicFile("/icons/favicon-32.png"))).toEqual({ w: 32, h: 32 });
    expect(pngSize(publicFile("/icons/apple-touch-icon-180.png"))).toEqual({ w: 180, h: 180 });
  });
});

describe("the tagline (N5)", () => {
  it("lives in BRAND once and is what the startup screen and the page description say", async () => {
    const { BRAND } = await import("./brand");
    const { brandSplash } = await import("../../vite.brand");
    expect(BRAND.tagline).toBe("Nested Diagram Tool");
    expect(brandSplash().body).toContain(`<div class="nd-splash-line">${BRAND.tagline}</div>`);
    expect(brandHead()).toContain(`${BRAND.name} — ${BRAND.tagline}.`);
  });
});
