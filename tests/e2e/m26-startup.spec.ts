// The startup screen (N3, D102), in a real browser: held on a first visit, gone the moment the
// canvas is ready on a later one, never in the share-link viewer, never in the way of the canvas.
import { expect, test, type Page } from "@playwright/test";
import { gotoFirstVisit, gotoFresh } from "./helpers";

interface Sample {
  t: number;
  /** The name and the line, as drawn. */
  text: string;
  /** In the page, displayed, not yet leaving. */
  up: boolean;
  present: boolean;
  pane: boolean;
  /** A diagram node is drawn (React Flow keeps nodes hidden until it has measured them). */
  node: boolean;
  /** The screen's pointer-events, while it is in the page. */
  pointer: string;
  /** The icon at this frame: its running animations, the frame's dash, the block's opacity. */
  icon?: { animations: number; frameDash: string; blockOpacity: string };
}

/** Records, every frame from the very first, whether the screen is up and whether the canvas is. */
async function recordStartup(page: Page) {
  await page.addInitScript(() => {
    const log: Sample[] = [];
    (window as unknown as { __splashLog: Sample[] }).__splashLog = log;
    const sample = () => {
      const el = document.getElementById("nd-splash");
      const style = el && getComputedStyle(el);
      log.push({
        t: performance.now(),
        text: el ? Array.from(el.querySelectorAll(".nd-splash-name, .nd-splash-line")).map((e) => e.textContent).join(" | ") : "",
        present: !!el,
        // Up: drawn and not yet on its way out, by the script or by the page's own cap.
        up: !!style && style.display !== "none" && !el!.classList.contains("nd-splash-out") && Number(style.opacity) > 0.99,
        pane: !!document.querySelector(".react-flow__pane"),
        node: Array.from(document.querySelectorAll(".react-flow__node")).some((n) => getComputedStyle(n).visibility === "visible"),
        pointer: style ? style.pointerEvents : "",
        icon: el
          ? {
              animations: document.getAnimations().filter((a) => (a.effect as KeyframeEffect | null)?.target?.closest?.(".nd-splash-icon")).length,
              frameDash: getComputedStyle(el.querySelector(".nd-splash-frame")!).strokeDasharray,
              blockOpacity: getComputedStyle(el.querySelector(".nd-splash-block")!).opacity,
            }
          : undefined,
      });
      // Long enough for a slow load under parallel test workers to finish starting (D114).
      if (performance.now() < 15000) requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
    document.addEventListener("readystatechange", sample);
  });
}
/**
 * How long after it first appeared the screen stopped being up; undefined if it never was. From
 * its first frame, not navigation start: a loaded dev server can take most of a second just to
 * deliver the page, and nothing can be on screen before it arrives (D107).
 */
const leftAt = (log: Sample[]) => {
  const shown = log.find((s) => s.present)?.t ?? 0;
  const first = log.findIndex((s) => s.up);
  const left = first < 0 ? undefined : log.slice(first).find((s) => !s.up)?.t;
  return left === undefined ? undefined : left - shown;
};
const startupLog = (page: Page) => page.evaluate(() => (window as unknown as { __splashLog: Sample[] }).__splashLog);

async function drawAndAutosave(page: Page) {
  await page.evaluate(() => {
    const s = window.__ddStore!.getState() as unknown as {
      addShapeNode: (ref: string, pos: { x: number; y: number }, size: { w: number; h: number }) => string;
    };
    s.addShapeNode("general/rect", { x: 100, y: 100 }, { w: 140, h: 70 });
  });
  await expect.poll(() => page.evaluate(() => (localStorage.getItem("nedito:autosave") ?? "").includes("general/rect"))).toBe(true);
}

const selectedNodes = (page: Page) =>
  page.evaluate(() => (window.__ddStore!.getState() as unknown as { selection: { nodeIds: string[] } }).selection.nodeIds.length);

/** Clicks the first node the moment the canvas shows it, and says whether the click reached it. */
async function clickFirstNode(page: Page) {
  const node = page.locator(".react-flow__node").first();
  await node.waitFor();
  const box = (await node.boundingBox())!;
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  // Whatever the screen is doing, the point under the pointer is the node, not the screen.
  const hit = await page.evaluate(
    ([x, y]) => {
      const el = document.elementFromPoint(x, y);
      return { node: !!el?.closest(".react-flow__node"), splash: !!el?.closest("#nd-splash"), splashUp: !!document.getElementById("nd-splash") };
    },
    [x, y],
  );
  await page.mouse.click(x, y);
  return hit;
}

test("a share link never shows the screen, not even for a frame", async ({ page }) => {
  // Opens the app, makes a link and opens it fresh: under parallel load, past the 30s default.
  test.slow();
  await gotoFresh(page);
  const url = await page.evaluate(async () => {
    const s = window.__ddStore!.getState() as unknown as { addShapeNode: (r: string, p: { x: number; y: number }, z: { w: number; h: number }) => string };
    s.addShapeNode("general/rect", { x: 0, y: 0 }, { w: 120, h: 60 });
    const m = await import("/src/share/urlCodec.ts" as string);
    return (await m.createShareLink(window.__ddStore!.getState().doc, `${location.origin}/`)).url as string;
  });
  await page.evaluate(() => localStorage.removeItem("nedito:splashSeen"));
  await recordStartup(page);
  await page.goto("about:blank");
  await page.goto(url);
  await expect(page.getByTestId("nd-viewer-shell")).toBeVisible();
  await expect(page.locator(".react-flow__node")).toHaveCount(1);
  expect(await page.evaluate(() => document.documentElement.getAttribute("data-nd-splash"))).toBe("off");
  const log = await startupLog(page);
  expect(log.length).toBeGreaterThan(5);
  expect(log.filter((s) => s.up)).toEqual([]);
  // ...and a share link is not a first visit used up.
  expect(await page.evaluate(() => localStorage.getItem("nedito:splashSeen"))).toBeNull();
});

test("a first visit shows the icon, the name and the line, holds about 1.8s, then never again", async ({ page }) => {
  // Two full loads (the first visit, then a return): under parallel load, past the 30s default.
  test.slow();
  await recordStartup(page);
  await gotoFirstVisit(page);
  const splash = page.locator("#nd-splash");
  await expect(splash).toHaveCount(0, { timeout: 5000 });

  // Read from the frame log, not the live page: by the time the page's load event lets a test
  // look, a slow load can already be past the hold.
  const log = await startupLog(page);
  // Up from the first frame the page has a body, before the canvas exists, with the icon's words.
  const firstPresent = log.find((s) => s.present)!;
  expect(firstPresent.up).toBe(true);
  expect(firstPresent.pane).toBe(false);
  expect(firstPresent.text).toBe("Nedito | Nested Diagram Tool");
  const left = leftAt(log)!;
  expect(left).toBeGreaterThanOrEqual(1750);
  // At the 3s cap at the latest; the margin is for the frame sampler, which runs slow under load
  // (the exact timing is the fake-clock unit tests' job, splash.test.ts).
  expect(left).toBeLessThan(3400);
  expect(await page.evaluate(() => localStorage.getItem("nedito:splashSeen"))).not.toBeNull();

  // The next load is a returning one: gone as soon as the canvas is, never held.
  await page.reload();
  expect(await page.evaluate(() => document.documentElement.getAttribute("data-nd-splash"))).toBe("return");
  await expect(splash).toHaveCount(0, { timeout: 1500 });
  // At the 1s cap at the latest; the margin is for the frame sampler, whose frames run ~100ms
  // apart under load (D114) — the exact timing is splash.test.ts's job.
  expect(leftAt(await startupLog(page)) ?? 0).toBeLessThan(1250);
});

test("the screen stays where it first painted: no layout shift as the text and fonts arrive", async ({ page }) => {
  await page.addInitScript(() => {
    const boxes: string[] = [];
    (window as unknown as { __boxes: string[] }).__boxes = boxes;
    const sample = () => {
      const icon = document.querySelector(".nd-splash-icon");
      const name = document.querySelector(".nd-splash-name");
      if (icon && name) {
        const a = icon.getBoundingClientRect();
        const b = name.getBoundingClientRect();
        boxes.push(`${a.x},${a.y},${a.width},${a.height}|${b.y},${b.height}`);
      }
      if (performance.now() < 1700) requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });
  await gotoFirstVisit(page);
  await page.waitForTimeout(1500);
  const boxes = await page.evaluate(() => (window as unknown as { __boxes: string[] }).__boxes);
  expect(boxes.length).toBeGreaterThan(5);
  expect([...new Set(boxes)]).toHaveLength(1);
});

test("a restored diagram is never held: the screen leaves with the canvas and never blocks a click", async ({ page }) => {
  await gotoFresh(page);
  await drawAndAutosave(page);
  await recordStartup(page);
  await page.reload();
  const hit = await clickFirstNode(page);
  expect(hit.node).toBe(true);
  expect(hit.splash).toBe(false);
  await expect.poll(() => selectedNodes(page)).toBe(1);

  const log = await startupLog(page);
  // Gone within a few frames of the restored diagram being drawn — counted in frames (one sample
  // each), not milliseconds, since frames run long on a loaded machine — and within its 1s cap.
  const drawnFrame = log.findIndex((s) => s.node);
  expect(drawnFrame).toBeGreaterThan(-1);
  const upAfterDrawn = log.slice(drawnFrame).filter((s) => s.up).length;
  expect(upAfterDrawn).toBeLessThanOrEqual(3);
  expect(leftAt(log) ?? 0).toBeLessThan(1250);
});

test("on a first visit the canvas is live under the screen: a click reaches it and ends the hold", async ({ page }) => {
  await recordStartup(page);
  await gotoFirstVisit(page);
  const hit = await clickFirstNode(page);
  expect(hit.node).toBe(true);
  await expect.poll(() => selectedNodes(page)).toBe(1);
  await expect(page.locator("#nd-splash")).toHaveCount(0, { timeout: 1000 });
  // The guarantee itself, on every frame it was in the page: it never takes the pointer. (Whether
  // the click above landed while it was still up depends on how fast the canvas arrived — under
  // load, after the 1.8s hold — so it cannot be the assertion; D114.)
  const present = (await startupLog(page)).filter((s) => s.present);
  expect(present.length).toBeGreaterThan(0);
  expect(new Set(present.map((s) => s.pointer))).toEqual(new Set(["none"]));
  if (hit.splashUp) expect(hit.splash).toBe(false);
});

test("reduced motion keeps the screen and drops the motion", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await recordStartup(page);
  await gotoFirstVisit(page);
  const splash = page.locator("#nd-splash");
  await expect(splash).toHaveCount(0, { timeout: 8000 });
  // Read from the frame log, not the live page, which a slow load reaches after the hold (D114).
  // The icon's motion only: the screen's own cap is not motion, and under reduced motion it is
  // instant. From the very first frame: no animation, the frame whole, the block shown.
  const log = await startupLog(page);
  const first = log.find((s) => s.present)!;
  expect(first.up).toBe(true);
  expect(first.icon).toEqual({ animations: 0, frameDash: "none", blockOpacity: "1" });
  // Still held for the name, then gone without a fade.
  const left = leftAt(log)!;
  expect(left).toBeGreaterThanOrEqual(1750);
});
