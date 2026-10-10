// The repository's social preview image (D150): docs/social-preview/social-preview.png, the
// 1280×640 picture GitHub shows when the repository's link is shared.
//
//   npm run dev                (the app the views are captured from)
//   npm run social-preview     (DEV_URL to point elsewhere; HEADED=1 for a visible window)
//
// Opens the Azure landing zone template, captures its top level and the inside of the Retail
// spoke Nested Block (top.png, inside.png), then renders card.html — which lays those two views
// out with the name, tagline and a zoom from the block into its level — to social-preview.png.
// The picture is uploaded by hand: Settings › General › Social preview (GitHub has no API for it).
// Uses the Chromium Playwright already installs for the E2E tests: no new dependency.
import { chromium } from "@playwright/test";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const DEV = process.env.DEV_URL || "http://localhost:5173/";
const OUT = resolve("docs/social-preview");

const browser = await chromium.launch({ headless: !process.env.HEADED });
try {
  // 1. The two views, at twice the card's resolution so they stay sharp once scaled down.
  const page = await browser.newPage({ viewport: { width: 1500, height: 900 }, deviceScaleFactor: 2 });
  await page.addInitScript(() => {
    if (sessionStorage.getItem("nd-social-preview")) return;
    sessionStorage.setItem("nd-social-preview", "1");
    localStorage.clear();
    // A returning visitor with nothing open: no sample diagram, no startup screen.
    localStorage.setItem("nedito:collapsedGroups", '["cloud"]');
    localStorage.setItem("nedito:demoDismissed", "true");
    localStorage.setItem("nedito:splashSeen", "1");
  });
  await page.goto(DEV);
  await page.getByTestId("nd-sidebar-tab-templates").click();
  await page.getByTestId("nd-template-card-azure-landing-zone").first().click();
  await page.waitForTimeout(2500);

  const shoot = async (name) => {
    await page.mouse.move(2, 2);
    await page.evaluate(() => window.__rf?.fitView?.({ padding: 0.06 }));
    await page.waitForTimeout(1500);
    await page.locator(".react-flow").first().screenshot({ path: `${OUT}/${name}.png` });
  };
  await shoot("top");
  const spoke = await page.evaluate(() => {
    const s = window.__ddStore.getState();
    const nodes = s.doc.diagrams[s.currentDiagramId()].nodes;
    return nodes.find((n) => n.type === "nested" && n.label?.text === "Retail spoke")?.id;
  });
  if (!spoke) throw new Error("The template has no Retail spoke Nested Block any more: update card.html and this script.");
  await page.evaluate((id) => window.__ddStore.getState().navigateInto(id), spoke);
  await page.waitForTimeout(2500);
  await shoot("inside");

  // 2. The card, at exactly 1280×640.
  const card = await browser.newPage({ viewport: { width: 1280, height: 640 }, deviceScaleFactor: 1 });
  await card.goto(pathToFileURL(`${OUT}/card.html`).href);
  await card.evaluate(() => document.fonts.ready);
  await card.waitForTimeout(500);
  await card.screenshot({ path: `${OUT}/social-preview.png` });
  console.log("Wrote docs/social-preview/social-preview.png");
} finally {
  await browser.close();
}
