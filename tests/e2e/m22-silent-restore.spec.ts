// R5: autosaved work comes back by itself with a note, Start new never
// loses it, and an autosave that cannot be read is surfaced rather than dropped.
import { expect, test, type Page } from "@playwright/test";
import { getDoc, gotoFresh } from "./helpers";

async function drawAndAutosave(page: Page, label: string) {
  await page.evaluate((text) => {
    const s = window.__ddStore!.getState() as unknown as {
      addShapeNode: (ref: string, pos: { x: number; y: number }, size: { w: number; h: number }) => string;
      setNodeLabel: (id: string, label: { text: string }) => void;
    };
    s.setNodeLabel(s.addShapeNode("general/rect", { x: 100, y: 100 }, { w: 140, h: 70 }), { text });
  }, label);
  // useAutosave debounces at 800ms.
  await page.waitForTimeout(1000);
}

const labels = async (page: Page) =>
  Object.values((await getDoc(page)).diagrams).flatMap((d) => d.nodes.map((n) => n.label?.text));

test.describe("Silent restore (R5)", () => {
  test.beforeEach(async ({ page }) => gotoFresh(page));

  test("reloading brings the work back with a note and no prompt; the note fades", async ({ page }) => {
    await drawAndAutosave(page, "Checkout");
    await page.reload();
    await expect(page.getByTestId("nd-restored-note")).toContainText("Restored your last diagram");
    await expect(page.getByText(/restore\?/)).toHaveCount(0);
    expect(await labels(page)).toEqual(["Checkout"]);
    await expect(page.getByTestId("nd-restored-note")).toHaveCount(0, { timeout: 10_000 });
  });

  test("Start new clears the canvas and the restored diagram is still under Recent", async ({ page }) => {
    await drawAndAutosave(page, "Checkout");
    await page.reload();
    await page.getByTestId("nd-restored-start-new").click();
    await expect.poll(() => labels(page)).toEqual([]);
    await expect(page.getByTestId("nd-notice")).toContainText("under Recent");

    await page.getByTestId("nd-app-menu-trigger").click();
    await page.getByTestId("nd-recent-0").click();
    await expect.poll(() => labels(page)).toEqual(["Checkout"]);
  });

  test("an autosave that can't be read is set aside and shown, never silently dropped", async ({ page }) => {
    // Let the page's own first autosave (debounced 800ms after load) land before planting the
    // broken one: otherwise it can fire between the plant and the reload and overwrite it, and the
    // test checks nothing (found flaky under load, 2026-10-05).
    await expect.poll(() => page.evaluate(() => localStorage.getItem("nedito:autosave") !== null)).toBe(true);
    await page.evaluate(() => localStorage.setItem("nedito:autosave", "{ not a diagram"));
    await page.reload();
    await expect(page.getByTestId("nd-restore-problem")).toContainText("couldn't be restored");
    const [download] = await Promise.all([page.waitForEvent("download"), page.getByTestId("nd-restore-problem-download").click()]);
    expect(download.suggestedFilename()).toMatch(/\.nedito$/);
    // Still there after the next autosave and a reload, until dismissed.
    await page.waitForTimeout(1000);
    await page.reload();
    await expect(page.getByTestId("nd-restore-problem")).toBeVisible();
    await page.getByTestId("nd-restore-problem-dismiss").click();
    await page.reload();
    await expect(page.getByTestId("nd-restore-problem")).toHaveCount(0);
  });
});
