// Writes the app's identity into the page head and the web manifest from src/app/brand.ts, so the
// name and the host live in one place (D100) rather than as literals in index.html.
import { readFileSync } from "node:fs";
import path from "node:path";
import type { Plugin } from "vite";
import { APP_ORIGIN, BRAND } from "./src/app/brand";
import { splashCss, splashMarkup, splashScript, splashTokens } from "./src/app/splashPage";

/** The web manifest's icons. Every PNG here is generated from its SVG by scripts/generate-icons.mjs. */
export const MANIFEST_ICONS = [
  { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
  { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
  { src: "/icons/app-icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
];

const DESCRIPTION = `${BRAND.name} — ${BRAND.tagline}. Diagrams inside diagrams, in your browser; nothing uploaded.`;

const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

export function brandHead(): string {
  const title = escapeHtml(BRAND.name);
  const description = escapeHtml(DESCRIPTION);
  return [
    `<title>${title}</title>`,
    `<meta name="description" content="${description}" />`,
    `<meta name="theme-color" content="#141A22" />`,
    `<link rel="canonical" href="${APP_ORIGIN}/" />`,
    // The 16px drawing has thicker strokes so the mark survives at tab size (D101); the PNG is
    // for browsers that take no SVG favicon, the touch icon for iOS, which ignores the manifest.
    `<link rel="icon" type="image/svg+xml" href="/icons/favicon-16.svg" />`,
    `<link rel="icon" type="image/png" sizes="32x32" href="/icons/favicon-32.png" />`,
    `<link rel="apple-touch-icon" sizes="180x180" href="/icons/apple-touch-icon-180.png" />`,
    `<link rel="manifest" href="/manifest.webmanifest" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="${title}" />`,
    `<meta property="og:title" content="${title}" />`,
    `<meta property="og:description" content="${description}" />`,
    `<meta property="og:url" content="${APP_ORIGIN}/" />`,
  ].join("\n    ");
}

/**
 * The web manifest. `start_url` and `scope` are relative — "/" on whichever host serves the
 * manifest — and every host but the canonical one redirects there (app/originGuard.ts), so an
 * installed app always ends up on BRAND.host. The icons are the violet tile (public/icons/,
 * D101): PNGs rendered from app-icon.svg by `npm run icons`, and the SVG itself for any size.
 */
export function brandManifest(): string {
  return JSON.stringify(
    {
      name: BRAND.name,
      short_name: BRAND.name,
      description: DESCRIPTION,
      id: "/",
      start_url: "/",
      scope: "/",
      display: "standalone",
      background_color: "#F6F7F9",
      theme_color: "#141A22",
      icons: MANIFEST_ICONS,
    },
    null,
    2,
  );
}

/**
 * The startup screen (N3, D102): its CSS and deciding script for the head, its markup for the
 * body. The icon is the app icon file itself and the colours and font are the tokens', read from
 * disk on every page build so neither can drift.
 */
export function brandSplash(root = process.cwd()): { head: string; body: string } {
  const icon = readFileSync(path.join(root, "public", "icons", "app-icon.svg"), "utf8");
  const tokens = splashTokens(readFileSync(path.join(root, "src", "styles", "tokens.css"), "utf8"));
  return {
    head: `<style id="nd-splash-style">${splashCss(tokens)}</style>
    <script>${splashScript()}</script>`,
    body: splashMarkup(icon),
  };
}

export function brandPlugin(): Plugin {
  let root = process.cwd();
  return {
    name: "nd-brand",
    configResolved(config) {
      root = config.root;
    },
    transformIndexHtml(html) {
      const splash = brandSplash(root);
      return html
        .replace("<!-- %BRAND_HEAD% -->", `${brandHead()}
    ${splash.head}`)
        .replace("<!-- %BRAND_SPLASH% -->", splash.body);
    },
    configureServer(server) {
      server.middlewares.use("/manifest.webmanifest", (_req, res) => {
        res.setHeader("Content-Type", "application/manifest+json");
        res.end(brandManifest());
      });
    },
    generateBundle() {
      this.emitFile({ type: "asset", fileName: "manifest.webmanifest", source: brandManifest() });
    },
  };
}
