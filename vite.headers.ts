// The site's security headers, written into the build as dist/_headers, which Cloudflare's static
// asset hosting applies to every response.
//
// Everything the app loads is its own: no CDN, no fonts or scripts from anywhere else, no network
// calls but for its own files. So the Content-Security-Policy allows only this origin, plus data:
// and blob: URLs for the pictures and downloads the app makes itself. The startup screen's one
// inline <script> and one inline <style> (vite.brand.ts) are allowed by their SHA-256 hashes, which
// this plugin computes from the finished index.html on every build, so they can never fall out of
// step with what is served.
//
// Inline style *attributes* in markup the app inserts are blocked by this policy. Two vendor icons
// carry `style="isolation:isolate"`, which changes nothing visible; React's style props are set
// through the CSS object model, which a policy does not block.
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { Plugin } from "vite";

const sha256 = (text: string) => `'sha256-${createHash("sha256").update(text, "utf8").digest("base64")}'`;

/** The contents of each inline <script> (without src) and <style> element in a page. */
export function inlineBlocks(html: string): { scripts: string[]; styles: string[] } {
  const scripts = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]);
  const styles = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1]);
  return { scripts, styles };
}

/** The Content-Security-Policy for a built index.html. */
export function contentSecurityPolicy(indexHtml: string): string {
  const { scripts, styles } = inlineBlocks(indexHtml);
  return [
    "default-src 'none'",
    ["script-src 'self'", ...scripts.map(sha256)].join(" "),
    ["style-src 'self'", ...styles.map(sha256)].join(" "),
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "connect-src 'self' data: blob:",
    "manifest-src 'self'",
    "worker-src 'self' blob:",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'",
    "object-src 'none'",
  ].join("; ");
}

/** The whole dist/_headers file. */
export function headersFile(indexHtml: string): string {
  const headers = [
    `Content-Security-Policy: ${contentSecurityPolicy(indexHtml)}`,
    "X-Content-Type-Options: nosniff",
    // A share link carries the diagram after `#`, which is never sent as a referrer; this keeps
    // even the page address to ourselves when someone follows a link out.
    "Referrer-Policy: no-referrer",
    "X-Frame-Options: DENY",
    "Cross-Origin-Opener-Policy: same-origin",
    "Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=(), serial=(), bluetooth=(), hid=(), midi=()",
    "Strict-Transport-Security: max-age=31536000",
  ];
  return `/*\n${headers.map((h) => `  ${h}`).join("\n")}\n`;
}

export function headersPlugin(): Plugin {
  let outDir = "dist";
  return {
    name: "nd-headers",
    apply: "build",
    configResolved(config) {
      outDir = path.resolve(config.root, config.build.outDir);
    },
    closeBundle() {
      const html = readFileSync(path.join(outDir, "index.html"), "utf8");
      writeFileSync(path.join(outDir, "_headers"), headersFile(html));
    },
  };
}
