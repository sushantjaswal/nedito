// The Nedito icon and mark (D101), in a real browser: the icons are served, and the mark is
// visible — in the surface's text colour — in the app bar, in dark mode, and in the viewer.
import { expect, test } from "@playwright/test";
import { gotoFresh } from "./helpers";

test("the favicon, touch icon and every manifest icon are served", async ({ page }) => {
  await gotoFresh(page);
  const hrefs = await page.locator('link[rel="icon"], link[rel="apple-touch-icon"]').evaluateAll((ls) => ls.map((l) => l.getAttribute("href")!));
  expect(hrefs).toContain("/icons/favicon-16.svg");
  const manifest = await (await page.request.get("/manifest.webmanifest")).json();
  for (const src of [...hrefs, ...manifest.icons.map((i: { src: string }) => i.src)]) {
    const res = await page.request.get(src);
    expect(res.status(), src).toBe(200);
  }
});

test("the mark sits in the app bar in its text colour, in light and dark mode", async ({ page }) => {
  await gotoFresh(page);
  const mark = page.getByTestId("nd-app-menu-trigger").getByTestId("nd-brand-mark");
  await expect(mark).toBeVisible();
  const colours = async () =>
    mark.evaluate((el) => ({ mark: getComputedStyle(el).color, bar: getComputedStyle(el.closest("header")!).backgroundColor }));
  const light = await colours();
  expect(light.mark).toBe("rgb(255, 255, 255)");
  await page.evaluate(() => (window.__ddStore!.getState() as unknown as { toggleDarkMode: () => void }).toggleDarkMode());
  const dark = await colours();
  expect(dark.mark).not.toBe(dark.bar);
  expect((await mark.boundingBox())!.width).toBeGreaterThan(15);
});

test("the mark sits in the shared-link viewer's strip, beside the name", async ({ page }) => {
  await gotoFresh(page);
  const url = await page.evaluate(async () => {
    const s = window.__ddStore!.getState() as unknown as { addShapeNode: (r: string, p: { x: number; y: number }, z: { w: number; h: number }) => string };
    s.addShapeNode("general/rect", { x: 0, y: 0 }, { w: 120, h: 60 });
    const m = await import("/src/share/urlCodec.ts" as string);
    return (await m.createShareLink(window.__ddStore!.getState().doc, `${location.origin}/`)).url as string;
  });
  // A fresh load, as the recipient gets: the same page with only a new # would not reload.
  await page.goto("about:blank");
  await page.goto(url);
  const mark = page.getByTestId("nd-viewer-shell").getByTestId("nd-brand-mark");
  await expect(mark).toBeVisible();
  expect(await mark.evaluate((el) => getComputedStyle(el).color)).not.toBe(
    await mark.evaluate((el) => getComputedStyle(el.closest("header")!).backgroundColor),
  );
});

test("the app bar says what the name stands for, and drops it when the bar gets tight (N5)", async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 800 });
  await gotoFresh(page);
  const tagline = page.getByTestId("nd-app-tagline");
  await expect(tagline).toHaveText("– Nested Diagram Tool");
  await expect(tagline).toBeVisible();
  // Clear of the palette button beside it.
  const t = (await tagline.boundingBox())!;
  const cmd = (await page.getByTestId("nd-command-button").boundingBox())!;
  expect(t.x + t.width).toBeLessThan(cmd.x);
  // The menu button's name stays the product's: the tagline is not read out as part of it.
  await expect(page.getByTestId("nd-app-menu-trigger")).toHaveAccessibleName("Nedito menu");
  // An ordinary laptop width keeps it, giving up the palette's "Ctrl K" hint first — and the
  // palette's words are never cut short to make room (D105).
  await page.setViewportSize({ width: 1060, height: 800 });
  await expect(tagline).toBeVisible();
  const words = page.getByTestId("nd-command-button").getByText("Search or run a command");
  expect(await words.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
  // Truly tight: the tagline goes.
  await page.setViewportSize({ width: 1000, height: 800 });
  await expect(tagline).toBeHidden();
});
