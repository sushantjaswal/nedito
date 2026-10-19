// Animated icons (I1–I5, D124), in a real browser: found by search beside their still twins,
// placed like any other icon, moving on the canvas, still in the library until pointed at, and
// at rest whenever motion is off.
import { expect, test } from "@playwright/test";
import { gotoFresh } from "./helpers";

test.beforeEach(async ({ page }) => gotoFresh(page));

test("search finds an animated icon beside its still twin; placed, it moves until motion is off", async ({ page }) => {
  await page.getByTestId("nd-shape-search").fill("scaling");
  const animated = page.getByTestId("nd-stencil-animated/scaling-out");
  await expect(animated).toBeVisible();
  await expect(page.getByTestId("nd-stencil-misc/scale-out")).toBeVisible();

  // Still in the library until pointed at.
  const part = animated.locator(".nd-anim").first();
  expect(await part.evaluate((el) => getComputedStyle(el).animationPlayState)).toBe("paused");
  await animated.hover();
  await expect.poll(() => part.evaluate((el) => getComputedStyle(el).animationPlayState)).toBe("running");

  await animated.click();
  const placed = page.locator(".react-flow__node .nd-anim").first();
  await expect(placed).toBeVisible();
  expect(await placed.evaluate((el) => getComputedStyle(el).animationName)).toBe("nd-ic-appear");
  expect(await placed.evaluate((el) => getComputedStyle(el).animationPlayState)).toBe("running");

  // The reader's switch: at rest, every box shown.
  await page.evaluate(() => (window.__ddStore!.getState() as unknown as { setMotionEnabled: (on: boolean) => void }).setMotionEnabled(false));
  await expect.poll(() => placed.evaluate((el) => getComputedStyle(el).animationName)).toBe("none");
  expect(await placed.evaluate((el) => getComputedStyle(el).opacity)).toBe("1");
});

test("the Animated section sits under Icons, and each icon takes the theme's ink", async ({ page }) => {
  await page.getByTestId("nd-shape-search").fill("animated");
  for (const id of ["processing", "running", "scaling-out", "retrying"]) await expect(page.getByTestId(`nd-stencil-animated/${id}`)).toBeVisible();
  await page.getByTestId("nd-stencil-animated/retrying").click();
  const glyph = page.locator(".react-flow__node svg g[color]").first();
  const light = await glyph.evaluate((el) => getComputedStyle(el).color);
  await page.evaluate(() => (window.__ddStore!.getState() as unknown as { toggleDarkMode: () => void }).toggleDarkMode());
  await expect.poll(() => glyph.evaluate((el) => getComputedStyle(el).color)).not.toBe(light);
});

test("the AI & Agents section holds its own pairs, each found beside the other", async ({ page }) => {
  // The AI icons were moved out of Animated into a section of their own, and their still twins
  // with them: a reader wanting a plain Retrieval should find it beside the moving one.
  await page.getByTestId("nd-shape-search").fill("retrieval");
  await expect(page.getByTestId("nd-stencil-ai/retrieval")).toBeVisible();
  await expect(page.getByTestId("nd-stencil-ai/context")).toBeVisible();

  // And a diagram saved while they lived in Animated still draws them. Asserted on what reaches
  // the canvas rather than on the lookup: a shapeRef that stops resolving does not fail loudly,
  // it quietly draws a plain box, so the test that matters is that the old id draws the same
  // picture as the new one.
  const ids = await page.evaluate(() => {
    const s = window.__ddStore!.getState() as unknown as {
      addShapeNode: (r: string, p: { x: number; y: number }, z: { w: number; h: number }) => string;
    };
    return [
      s.addShapeNode("animated/inference", { x: 40, y: 40 }, { w: 80, h: 80 }),
      s.addShapeNode("ai/inference", { x: 180, y: 40 }, { w: 80, h: 80 }),
      s.addShapeNode("misc/guardrail", { x: 40, y: 180 }, { w: 80, h: 80 }),
      s.addShapeNode("ai/blocked", { x: 180, y: 180 }, { w: 80, h: 80 }),
    ];
  });
  const drawing = async (id: string) =>
    page.getByTestId(`rf__node-${id}`).locator("svg").first().evaluate((el) => el.innerHTML);
  await expect(page.getByTestId(`rf__node-${ids[3]}`)).toBeVisible();
  expect(await drawing(ids[0]), "the retired animated/inference").toBe(await drawing(ids[1]));
  expect(await drawing(ids[2]), "the retired misc/guardrail").toBe(await drawing(ids[3]));
  // Not a fallback box standing in for both: the drawing really is the chip.
  expect(await drawing(ids[0])).toContain("nd-ic-breathe");
});

test("every animated icon, placed, moves on the canvas and rests with motion off", async ({ page }) => {
  // Both sections that hold icons which move, so the AI ones carry the same guarantee.
  const ids = await page.evaluate(async () => {
    const m = await import("/src/library/stencils/index.ts" as string);
    const out: string[] = [];
    for (const id of ["animated", "ai"]) {
      const section = await m.loadSection(id);
      for (const s of section.shapes as { id: string; animated?: unknown }[]) if (s.animated) out.push(s.id);
    }
    return out;
  });
  expect(ids.length).toBeGreaterThanOrEqual(30);
  await page.getByTestId("nd-shape-search").fill("animated");
  for (const id of ids) await page.getByTestId(`nd-stencil-${id}`).click();
  const parts = page.locator(".react-flow__node .nd-anim");
  await expect.poll(() => page.locator(".react-flow__node").count()).toBe(ids.length);
  const running = await parts.evaluateAll((els) => els.map((el) => getComputedStyle(el).animationName));
  expect(running.length).toBeGreaterThanOrEqual(ids.length);
  expect(running.filter((n) => n === "none")).toEqual([]);
  await page.evaluate(() => (window.__ddStore!.getState() as unknown as { setMotionEnabled: (on: boolean) => void }).setMotionEnabled(false));
  await expect.poll(() => parts.evaluateAll((els) => els.filter((el) => getComputedStyle(el).animationName !== "none").length)).toBe(0);
});
