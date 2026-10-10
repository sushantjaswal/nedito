// Renders the app's PNG icons from their SVG sources (D101) — the sizes the web manifest and the
// browsers need, generated rather than drawn by hand so they can never drift from the SVG.
//
//   npm run icons
//
// Uses the Chromium that Playwright already installs for the E2E tests: no new dependency. Each
// SVG is drawn at exactly the target size on a transparent background and saved as PNG under
// public/icons/, next to the sources. Commit the results; the build only copies them.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const icons = path.join(root, "public", "icons");

/** Every PNG the app ships, and the SVG it comes from. */
export const PNG_ICONS = [
  // The web manifest's tiles (installed app, Android home screen, splash).
  { file: "icon-192.png", size: 192, source: "app-icon.svg" },
  { file: "icon-512.png", size: 512, source: "app-icon.svg" },
  // iOS home screen, which ignores the manifest.
  { file: "apple-touch-icon-180.png", size: 180, source: "app-icon.svg" },
  // A raster favicon for browsers that do not take an SVG one; from the thick-stroked 16px drawing.
  { file: "favicon-32.png", size: 32, source: "favicon-16.svg" },
];

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ deviceScaleFactor: 1 });
  for (const { file, size, source } of PNG_ICONS) {
    const svg = readFileSync(path.join(icons, source), "utf8");
    const dataUrl = `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(
      `<html><body style="margin:0;background:transparent"><img src="${dataUrl}" width="${size}" height="${size}" style="display:block"></body></html>`,
    );
    await page.locator("img").evaluate((img) => img.decode());
    await page.screenshot({ path: path.join(icons, file), omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
    console.log(`wrote public/icons/${file} (${size}×${size}) from ${source}`);
  }
} finally {
  await browser.close();
}
