// A newcomer's sidebar: General open with its shapes in view, every other section closed (D87).
// Since R4 (D93) the sections sit in purpose groups: Basics is the open group, General the open
// section inside it.
import { expect, test, type Page } from "@playwright/test";

/** A genuinely first visit for the sidebar: nothing saved about which sections are open. */
async function firstVisit(page: Page) {
  await page.goto("/");
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem("nedito:demoDismissed", "true");
  });
  await page.reload();
}

test("a first visit opens General and keeps every other section collapsed", async ({ page }) => {
  await firstVisit(page);
  await expect(page.getByTestId("nd-stencil-general/rect")).toBeVisible();
  await expect(page.getByTestId("nd-group-toggle-basics")).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByTestId("nd-section-toggle-general")).toHaveAttribute("aria-expanded", "true");
  for (const id of ["basic", "advanced", "scratchpad"]) {
    await expect(page.getByTestId(`nd-section-toggle-${id}`)).toHaveAttribute("aria-expanded", "false");
  }
  for (const id of ["lines", "flow", "data", "software", "cloud", "network", "people", "icons"]) {
    await expect(page.getByTestId(`nd-group-toggle-${id}`)).toHaveAttribute("aria-expanded", "false");
  }
});

test("a group the user closes stays closed after a reload", async ({ page }) => {
  await firstVisit(page);
  await page.getByTestId("nd-group-toggle-basics").click();
  await expect(page.getByTestId("nd-stencil-general/rect")).toHaveCount(0);
  await page.reload();
  await expect(page.getByTestId("nd-group-toggle-basics")).toHaveAttribute("aria-expanded", "false");
  await page.getByTestId("nd-group-toggle-cloud").click();
  await page.reload();
  await expect(page.getByTestId("nd-group-toggle-cloud")).toHaveAttribute("aria-expanded", "true");
});

test("Recently used holds what was placed, newest first, across a reload", async ({ page }) => {
  await firstVisit(page);
  await expect(page.getByTestId("nd-recent-shapes")).toHaveCount(0);
  await page.getByTestId("nd-stencil-general/diamond").click();
  await page.getByTestId("nd-stencil-general/ellipse").click();
  await page.reload();
  const tiles = page.getByTestId("nd-recent-shapes").locator('[data-testid^="nd-recent-stencil-"]');
  await expect(tiles).toHaveCount(2);
  await expect(tiles.first()).toHaveAttribute("data-testid", "nd-recent-stencil-general/ellipse");
});

test("a section the user closes stays closed after a reload, General included", async ({ page }) => {
  await firstVisit(page);
  await page.getByTestId("nd-section-toggle-general").click();
  await expect(page.getByTestId("nd-section-toggle-general")).toHaveAttribute("aria-expanded", "false");
  await page.reload();
  await expect(page.getByTestId("nd-section-toggle-general")).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByTestId("nd-stencil-general/rect")).toHaveCount(0);
});
