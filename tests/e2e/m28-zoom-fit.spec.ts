// Fit view moved from the canvas chip into the zoom bar (D108), in a real browser: same control,
// new seat, nothing left behind in the chip, no collisions at narrow widths, legible in dark mode.
import { expect, test, type Page } from "@playwright/test";
import { gotoFresh } from "./helpers";

const fit = (page: Page) => page.locator(".react-flow__controls-fitview");

test.beforeEach(async ({ page }) => gotoFresh(page));

test("fit view sits in the zoom bar, right of +, after a thin divider — the same control as before", async ({ page }) => {
  const zoomBar = page.getByTestId("nd-zoom-controls");
  await expect(fit(page)).toHaveCount(1);
  await expect(zoomBar.locator(".react-flow__controls-fitview")).toBeVisible();
  // Same tooltip and accessible name as React Flow gives it.
  await expect(fit(page)).toHaveAttribute("title", "Fit View");
  await expect(fit(page)).toHaveAccessibleName("Fit View");

  // Order, left to right: + · divider · fit.
  const order = await zoomBar.evaluate((bar) => {
    const plus = bar.querySelector('[data-testid="nd-zoom-in"]')!.getBoundingClientRect();
    const rule = bar.querySelector('[aria-hidden="true"]:not(svg)')!.getBoundingClientRect();
    const button = bar.querySelector(".react-flow__controls-fitview")!.getBoundingClientRect();
    return { plusRight: plus.right, ruleLeft: rule.left, ruleRight: rule.right, ruleWidth: rule.width, fitLeft: button.left };
  });
  expect(order.ruleLeft).toBeGreaterThanOrEqual(order.plusRight);
  expect(order.fitLeft).toBeGreaterThanOrEqual(order.ruleRight);
  expect(order.ruleWidth).toBeLessThanOrEqual(1.5);

  // Same behaviour: it fits the content.
  await page.evaluate(() => {
    const s = window.__ddStore!.getState() as unknown as { addShapeNode: (r: string, p: { x: number; y: number }, z: { w: number; h: number }) => string };
    s.addShapeNode("general/rect", { x: 2000, y: 1600 }, { w: 120, h: 60 });
  });
  await fit(page).click();
  await expect(page.locator(".react-flow__node").first()).toBeInViewport();
});

test("the canvas chip starts with Grid, flush, with nothing left where fit view was", async ({ page }) => {
  const chip = page.getByTestId("nd-canvas-chip");
  await expect(chip.locator(".react-flow__controls-fitview")).toHaveCount(0);
  const first = await chip.evaluate((c) => (c.firstElementChild as HTMLElement).dataset.testid);
  expect(first).toBe("nd-grid-toggle");
  const pad = await chip.evaluate((c) => c.firstElementChild!.getBoundingClientRect().left - c.getBoundingClientRect().left);
  expect(pad).toBeLessThanOrEqual(5); // the chip's own 3px padding and 1px border, nothing more
  // And the chip itself sits at the canvas's edge, no longer 52px in.
  const offset = await chip.evaluate((c) => c.getBoundingClientRect().left - document.querySelector(".react-flow")!.getBoundingClientRect().left);
  expect(offset).toBeLessThanOrEqual(13);
});

test("at every window width the zoom bar and the chip stay inside the canvas and never touch", async ({ page }) => {
  for (const width of [1400, 1024, 900, 800, 700, 600, 500, 375]) {
    await page.setViewportSize({ width, height: 800 });
    const r = await page.evaluate(() => {
      const box = (sel: string) => document.querySelector(sel)!.getBoundingClientRect();
      const z = box('[data-testid="nd-zoom-controls"]');
      const c = box('[data-testid="nd-canvas-chip"]');
      const pane = box(".react-flow");
      const apart = z.left >= c.right || z.bottom <= c.top;
      return { apart, zoomInside: z.left >= pane.left - 0.5 && z.right <= pane.right + 0.5, chipInside: c.right <= pane.right + 0.5 };
    });
    expect(r, `${width}px`).toEqual({ apart: true, zoomInside: true, chipInside: true });
    // −, + and fit view are always there.
    for (const id of ["nd-zoom-out", "nd-zoom-in"]) await expect(page.getByTestId(id), `${width}px`).toBeVisible();
    await expect(fit(page), `${width}px`).toBeVisible();
  }
});

test("in dark mode the fit button is drawn in the bar's ink, not on a white tile", async ({ page }) => {
  await page.evaluate(() => (window.__ddStore!.getState() as unknown as { toggleDarkMode: () => void }).toggleDarkMode());
  const colours = await fit(page).evaluate((b) => {
    const s = getComputedStyle(b);
    const bar = getComputedStyle(b.closest('[data-testid="nd-zoom-controls"]')!);
    return { fg: s.color, bg: s.backgroundColor, bar: bar.backgroundColor, icon: getComputedStyle(b.querySelector("svg")!).fill };
  });
  expect(colours.bg).toBe("rgba(0, 0, 0, 0)");
  expect(colours.fg).not.toBe(colours.bar);
  expect(colours.icon).toBe(colours.fg);
});

test("the status bar names the level without a zoom readout", async ({ page }) => {
  const context = page.getByTestId("nd-status-context");
  await expect(context).not.toContainText("Zoom");
  await expect(context).not.toContainText("%");
  await expect(context).toHaveText(/\S/);
});

test("the context bar never covers fit view, even clamped to a selection that is off screen", async ({ page }) => {
  await page.evaluate(() => {
    const s = window.__ddStore!.getState() as unknown as {
      addShapeNode: (r: string, p: { x: number; y: number }, z: { w: number; h: number }) => string;
    };
    // Placed far off screen, and selected: the bar clamps itself into the canvas.
    s.addShapeNode("general/rect", { x: 4000, y: 3000 }, { w: 120, h: 60 });
  });
  await expect(page.getByTestId("nd-context-bar")).toBeVisible();
  const [bar, button] = await Promise.all([page.getByTestId("nd-context-bar").boundingBox(), fit(page).boundingBox()]);
  const overlaps = bar!.x < button!.x + button!.width && button!.x < bar!.x + bar!.width && bar!.y < button!.y + button!.height && button!.y < bar!.y + bar!.height;
  expect(overlaps).toBe(false);
  await fit(page).click({ timeout: 3000 });
  await expect(page.locator(".react-flow__node").first()).toBeInViewport();
});
