import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { ANALYTICS_REPORT, ANALYTICS_SCRIPT, contentSecurityPolicy, headersFile, inlineBlocks } from "./vite.headers";

const page = `<!doctype html><html><head>
<style id="nd-splash-style">body{margin:0}</style>
<script>window.__splash=1</script>
<script type="module" crossorigin src="/assets/index-abc.js"></script>
</head><body></body></html>`;

const hash = (text: string) => `'sha256-${createHash("sha256").update(text, "utf8").digest("base64")}'`;

describe("the site's security headers", () => {
  it("finds the inline blocks, and not scripts loaded from a file", () => {
    expect(inlineBlocks(page)).toEqual({ scripts: ["window.__splash=1"], styles: ["body{margin:0}"] });
  });

  it("allows only this origin, the inline startup screen by its hash, and Cloudflare Web Analytics", () => {
    const csp = contentSecurityPolicy(page);
    expect(csp).toContain(`script-src 'self' ${hash("window.__splash=1")} ${ANALYTICS_SCRIPT}`);
    expect(csp).toContain(`connect-src 'self' data: blob: ${ANALYTICS_REPORT}`);
    expect(csp).toContain(`style-src 'self' ${hash("body{margin:0}")}`);
    expect(csp).toContain("default-src 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).not.toMatch(/unsafe-inline|unsafe-eval/);
    // The analytics hosts are the only outside origins, and only for scripts and reports.
    const outside = [...csp.matchAll(/https?:\/\/[^\s;]+/g)].map((m) => m[0]);
    expect(outside.sort()).toEqual([ANALYTICS_REPORT, ANALYTICS_SCRIPT].sort());
  });

  it("writes one rule for every path, with the policy and the other headers", () => {
    const file = headersFile(page).split("\n");
    expect(file[0]).toBe("/*");
    for (const name of ["Content-Security-Policy", "X-Content-Type-Options", "Referrer-Policy", "X-Frame-Options", "Permissions-Policy", "Strict-Transport-Security"]) {
      expect(file.some((l) => l.startsWith(`  ${name}: `))).toBe(true);
    }
  });
});
