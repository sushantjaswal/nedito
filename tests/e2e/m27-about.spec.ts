// About (N4), in a real browser: reached from the app menu and by typing "about" in the palette,
// the Nested Block opens and climbs back out, everything works from the keyboard, Esc closes.
import { expect, test } from "@playwright/test";
import { gotoFresh, openPalette } from "./helpers";

test.beforeEach(async ({ page }) => gotoFresh(page));

test("typing 'about' in the palette opens it; the version line is read from code", async ({ page }) => {
  await openPalette(page, "about");
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", { name: "About Nedito" });
  await expect(dialog).toBeVisible();
  await expect(page.getByTestId("nd-about-version")).toHaveText(/^Version \d+\.\d+\.\d+ · File format v\d+$/);
  await expect(dialog.getByText("Yet another diagram tool. Except this one has a basement.")).toBeVisible();
  // No links at all: the contact address is plain text (user, 2026-10-08).
  await expect(dialog.locator("a")).toHaveCount(0);
});

test("from the app menu, and the whole thing by keyboard: open the block, climb out, close with Esc", async ({ page }) => {
  await page.getByTestId("nd-app-menu-trigger").click();
  await page.getByTestId("nd-help-about").click();
  const dialog = page.getByTestId("nd-about-dialog");
  await expect(page.getByTestId("nd-about-close")).toBeFocused();

  // Tab to ⤢ and open it: focus lands on the breadcrumb, the three boxes are there.
  await page.keyboard.press("Tab");
  await expect(page.getByTestId("nd-about-demo-open")).toBeFocused();
  await page.keyboard.press("Enter");
  const inside = page.getByTestId("nd-about-demo-inside");
  await expect(inside.locator("li")).toHaveText(["Too much detail", "Box holds a diagram", "Open to explore"]);
  await expect(page.getByTestId("nd-about-demo-back")).toBeFocused();

  // Tab never leaves the dialog.
  for (let i = 0; i < 4; i++) {
    await page.keyboard.press("Tab");
    expect(await dialog.evaluate((d) => d.contains(document.activeElement))).toBe(true);
  }

  // Esc climbs out first, back onto ⤢; a second Esc closes, and focus returns to the page.
  await page.keyboard.press("Escape");
  await expect(inside).toHaveCount(0);
  await expect(page.getByTestId("nd-about-demo-open")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
});

test("the breadcrumb climbs back out with the pointer too, and a click outside closes it", async ({ page }) => {
  await page.getByTestId("nd-app-menu-trigger").click();
  await page.getByTestId("nd-help-about").click();
  await page.getByTestId("nd-about-demo-open").click();
  await page.getByTestId("nd-about-demo-back").click();
  await expect(page.getByTestId("nd-about-demo-inside")).toHaveCount(0);
  await page.mouse.click(10, 300);
  await expect(page.getByTestId("nd-about-dialog")).toHaveCount(0);
});

test("fits a phone: no sideways scroll, the three boxes side by side", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 760 });
  await page.getByTestId("nd-app-menu-trigger").click();
  await page.getByTestId("nd-help-about").click();
  await page.getByTestId("nd-about-demo-open").click();
  const body = page.getByTestId("nd-about-dialog");
  const box = (await body.boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(375);
  const tops = await page.getByTestId("nd-about-demo-inside").locator("li").evaluateAll((ls) => ls.map((l) => Math.round(l.getBoundingClientRect().top)));
  expect(new Set(tops).size).toBe(1);
  const flow = page.getByTestId("nd-about-demo-inside").locator("ol");
  expect(await flow.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
});

test("Tell us what's missing: the address is plain text, selected whole with one click (N8)", async ({ page }) => {
  await page.getByTestId("nd-app-menu-trigger").click();
  await page.getByTestId("nd-help-about").click();
  const dialog = page.getByTestId("nd-about-dialog");
  await expect(dialog.getByRole("heading", { name: "Tell us what's missing" })).toBeVisible();
  const address = page.getByTestId("nd-about-contact");
  await expect(address).toHaveText("hello@nedito.app");
  await address.click();
  expect(await page.evaluate(() => window.getSelection()?.toString())).toBe("hello@nedito.app");
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
});
