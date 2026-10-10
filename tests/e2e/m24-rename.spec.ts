// The rename from DeepDraw to Nedito (D100), in a real browser: an existing user's storage comes
// across whole, old files still open, and new files are written only under the new name.
import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { getDoc, gotoFresh, gotoWithStorage } from "./helpers";

const OLD_DOC = JSON.stringify({
  format: "deepdraw",
  formatVersion: 2,
  meta: { title: "Old work", created: "2026-09-01T00:00:00.000Z", modified: "2026-09-01T00:00:00.000Z", appVersion: "0.0.1" },
  rootDiagramIds: ["root"],
  diagrams: {
    root: {
      id: "root",
      title: "Page 1",
      nodes: [{ id: "n1", type: "shape", shapeRef: "general/rect", position: { x: 0, y: 0 }, size: { w: 120, h: 60 }, z: 0, style: {}, label: { text: "Made before the rename" } }],
      edges: [],
    },
  },
});

test("a profile with only old-prefix storage loads with everything carried over", async ({ page }) => {
  await gotoWithStorage(page, {
    "deepdraw:autosave": OLD_DOC,
    "deepdraw:theme": "dark",
    "deepdraw:recentShapes": JSON.stringify(["general/ellipse"]),
    "deepdraw:demoDismissed": "true",
    "deepdraw:tourDone": "1",
    "deepdraw:collapsedSections": "[]",
  });
  // The autosave came back by itself (R5), now from the new prefix.
  await expect(page.getByTestId("nd-restored-note")).toBeVisible();
  const doc = await getDoc(page);
  expect(doc.meta.title).toBe("Old work");
  expect(Object.values(doc.diagrams)[0].nodes[0].label?.text).toBe("Made before the rename");
  // Preferences and the sidebar's history too.
  expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe("dark");
  await expect(page.getByTestId("nd-recent-stencil-general/ellipse")).toBeVisible();
  // No sample and no tour: both flags came across.
  await expect(page.getByTestId("nd-coach-step-1")).toHaveCount(0);
  const stored = await page.evaluate(() => ({ autosave: !!localStorage.getItem("nedito:autosave"), theme: localStorage.getItem("nedito:theme") }));
  expect(stored).toEqual({ autosave: true, theme: "dark" });
});

test.describe("files", () => {
  test.beforeEach(async ({ page }) => gotoFresh(page));

  test("an old .deepdraw file opens; saving writes only .nedito with the new format id", async ({ page }) => {
    await page.getByTestId("nd-file-open-input").setInputFiles({ name: "old-plan.deepdraw", mimeType: "application/json", buffer: Buffer.from(OLD_DOC) });
    await expect.poll(async () => (await getDoc(page)).meta.title).toBe("Old work");

    await page.getByTestId("nd-app-menu-trigger").click();
    const [download] = await Promise.all([page.waitForEvent("download"), page.getByTestId("nd-app-save").click()]);
    expect(download.suggestedFilename()).toMatch(/\.nedito$/);
    const saved = JSON.parse(readFileSync((await download.path())!, "utf8"));
    expect(saved.format).toBe("nedito");
  });

  test("the editable image is written as .nedito.png", async ({ page }) => {
    await page.getByTestId("nd-stencil-general/rect").click();
    await page.getByTestId("nd-export-menu-trigger").click();
    const [download] = await Promise.all([page.waitForEvent("download"), page.getByTestId("nd-export-editable-png").click()]);
    expect(download.suggestedFilename()).toMatch(/\.nedito\.png$/);
  });
});

test("the page and its manifest carry the new name, and point at nedito.app", async ({ page }) => {
  await gotoFresh(page);
  await expect(page).toHaveTitle("Nedito");
  expect(await page.locator('link[rel="canonical"]').getAttribute("href")).toBe("https://nedito.app/");
  expect(await page.locator('meta[property="og:url"]').getAttribute("content")).toBe("https://nedito.app/");
  const manifest = await (await page.request.get("/manifest.webmanifest")).json();
  expect(manifest).toMatchObject({ name: "Nedito", start_url: "/", scope: "/" });
});
