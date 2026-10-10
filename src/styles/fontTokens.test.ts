import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = join(process.cwd(), "src");

// file/exportFonts.ts declares the one stack that legitimately lives outside tokens.css: the
// one an *exported* SVG carries. It is a different thing from the app's CSS token — it names
// the face embedded in that file plus a fallback for a viewer that strips @font-face — and it
// can't read a custom property, because an export is read outside the app.
//
// This replaces an older exemption on svgExport.ts, which kept "Segoe UI, system-ui,
// sans-serif" on the reasoning that naming IBM Plex would make exports fall back to the
// viewer's default. The outcome was worse than the problem it avoided: node labels came out in
// whatever face the reader had, and edge labels, which named no family at all, came out serif.
// Embedding the font removes the reason for the exemption.
//
// This file is exempt from its own scan: the patterns it searches for are written out below,
// so it would always report itself.
const EXEMPT = ["file/exportFonts.ts", "styles/fontTokens.test.ts"];

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

function relative(file: string): string {
  return file.slice(SRC.length + 1).replace(/\\/g, "/");
}

describe("font tokens", () => {
  const files = walk(SRC).filter((f) => /\.(css|ts|tsx)$/.test(f));

  it("declares the two font stacks exactly once, in tokens.css", () => {
    const tokens = readFileSync(join(SRC, "styles/tokens.css"), "utf8");
    expect(tokens).toContain('--font-sans: "IBM Plex Sans"');
    expect(tokens).toContain('--font-mono: "IBM Plex Mono"');
  });

  // The point of a token is that it's the only place the value lives. A stray stack elsewhere
  // silently drifts the moment the typeface changes again, and is invisible until someone
  // notices one panel rendering in a different face.
  it("has no hardcoded font stack anywhere outside tokens.css", () => {
    const offenders: string[] = [];
    for (const file of files) {
      const rel = relative(file);
      if (rel === "styles/tokens.css" || EXEMPT.includes(rel)) continue;
      const source = readFileSync(file, "utf8");
      for (const pattern of ["Segoe UI", "system-ui", "sans-serif", "ui-monospace", "monospace"]) {
        if (source.includes(pattern)) offenders.push(`${rel} contains "${pattern}"`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("keeps every font-family declaration pointing at a token", () => {
    const offenders: string[] = [];
    for (const file of files) {
      const rel = relative(file);
      if (rel === "styles/tokens.css" || EXEMPT.includes(rel)) continue;
      for (const match of readFileSync(file, "utf8").matchAll(/font-family:\s*([^;]+);/g)) {
        const value = match[1].trim();
        // `inherit` is fine — it defers to an ancestor that already reads the token.
        if (value === "inherit" || value.startsWith("var(--font-")) continue;
        offenders.push(`${rel}: font-family: ${value}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  // The export path is the one place a stack is allowed outside tokens.css, so assert it still
  // leads with the same family rather than trusting the exemption.
  it("has the exported SVG ask for the same family the app uses", () => {
    const exportFonts = readFileSync(join(SRC, "file/exportFonts.ts"), "utf8");
    expect(exportFonts).toContain('EXPORT_FONT_FAMILY = "IBM Plex Sans"');
    const svgExport = readFileSync(join(SRC, "file/svgExport.ts"), "utf8");
    expect(svgExport).toContain("EXPORT_FONT_STACK");
    expect(svgExport).not.toContain("Segoe UI");
  });
});
