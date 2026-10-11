// Every document is untrusted. A share link anyone can craft, and whatever an earlier visit saved
// from one into the autosave or Favorites, must open without running anything. The payload breaks
// out of an attribute and out of SVG into HTML, where an <img> handler would run; it only sets a
// flag on window, which must stay unset.
import { expect, test, type Page } from "@playwright/test";

const PAYLOAD = `x"/><img src="data:," onerror="window.__pwned=(window.__pwned||0)+1"><svg x="`;
const meta = { title: "Hostile", created: "2026-10-11T00:00:00Z", modified: "2026-10-11T00:00:00Z", appVersion: "0.1.0" };

/** A line stencil drawn as a shape (its arrowhead takes the stroke), and a Nested Block whose miniature draws a hostile inner shape. */
const hostileDoc = {
  format: "nedito",
  formatVersion: 1,
  meta,
  rootDiagramIds: ["main"],
  diagrams: {
    main: {
      id: "main",
      title: "Main",
      edges: [],
      nodes: [
        { id: "arrow", type: "shape", shapeRef: "lines/arrow", position: { x: 0, y: 0 }, size: { w: 160, h: 40 }, z: 1, style: { stroke: PAYLOAD }, label: { text: "Arrow" } },
        { id: "block", type: "nested", childDiagramId: "inside", position: { x: 0, y: 120 }, size: { w: 240, h: 160 }, z: 2, style: {}, label: { text: "Block" }, collapsed: { icons: [] }, ports: [] },
      ],
    },
    inside: {
      id: "inside",
      title: "Block",
      edges: [],
      nodes: [{ id: "inner", type: "shape", shapeRef: "general/rect", position: { x: PAYLOAD, y: 0 }, size: { w: 120, h: 60 }, z: 1, style: { fill: PAYLOAD } }],
    },
  },
};

async function pwned(page: Page): Promise<number> {
  return page.evaluate(() => (window as unknown as { __pwned?: number }).__pwned ?? 0);
}

/** A fresh browser with nothing saved, plus whatever `items` an earlier visit left behind. */
async function fresh(page: Page, items: Record<string, string> = {}) {
  await page.addInitScript(
    ({ items }) => {
      if (sessionStorage.getItem("nd-hostile")) return;
      sessionStorage.setItem("nd-hostile", "1");
      localStorage.clear();
      localStorage.setItem("nedito:demoDismissed", "true");
      localStorage.setItem("nedito:splashSeen", "1");
      localStorage.setItem("nedito:collapsedSections", "[]");
      for (const [k, v] of Object.entries(items)) localStorage.setItem(k, v);
    },
    { items },
  );
}

test("a crafted share link opens in the viewer without running anything", async ({ page }) => {
  await fresh(page);
  await page.goto("/");
  const fragment = await page.evaluate(async (doc) => {
    const m = await import("/src/share/urlCodec.ts" as string);
    return m.encodeDocToFragment(doc);
  }, hostileDoc);
  // A hash change alone does not reload the page; a link is opened by loading it.
  await page.goto(`/#${fragment}`);
  await page.reload();
  await expect(page.getByText("Viewing a shared diagram")).toBeVisible();
  // Both hostile shapes are drawn: the arrow on the canvas and the Nested Block's miniature.
  await expect(page.locator(".react-flow__node")).toHaveCount(2);
  await page.waitForTimeout(1500);
  expect(await pwned(page)).toBe(0);
});

test("an autosave written before the fix opens cleaned, and stays clean on later visits", async ({ page }) => {
  await fresh(page, { "nedito:autosave": JSON.stringify(hostileDoc) });
  await page.goto("/");
  await expect(page.getByTestId("nd-restored-note")).toBeVisible();
  await expect(page.locator(".react-flow__node")).toHaveCount(2);
  await page.waitForTimeout(1500);
  expect(await pwned(page)).toBe(0);
  await page.reload();
  await expect(page.locator(".react-flow__node")).toHaveCount(2);
  await page.waitForTimeout(1500);
  expect(await pwned(page)).toBe(0);
});

test("a Favorite saved from a hostile shape before the fix draws without running anything", async ({ page }) => {
  await fresh(page, {
    "nedito:scratchpad": JSON.stringify([{ id: "fav", shapeRef: "lines/arrow", size: { w: 160, h: 40 }, style: { stroke: PAYLOAD } }]),
  });
  await page.goto("/");
  const favorite = page.getByTestId("nd-scratchpad-fav");
  if (!(await favorite.isVisible())) await page.getByTestId("nd-section-toggle-scratchpad").click();
  await expect(favorite).toBeVisible();
  await page.waitForTimeout(1500);
  expect(await pwned(page)).toBe(0);
});
