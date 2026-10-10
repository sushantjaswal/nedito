// The README's pictures (D152), made from the running app so they show what it really does.
//
//   npm run dev                (the app the pictures are taken from)
//   npm run readme-images      (DEV_URL to point elsewhere; HEADED=1 for a visible window)
//
// Writes docs/readme/:
//   nesting.gif   opening a Nested Block and climbing back out by the breadcrumb, recorded from the
//                 screen and encoded with the app's own GIF encoder (src/file/gifEncoder.ts)
//   motion.gif    a diagram whose lines and shapes move, made with the app's own Animated image
//                 (.gif) export
//   editor.png    the editor, light, with a Nested Block selected and its context bar showing
//   dark.png      the editor in dark mode
// Uses the Chromium Playwright already installs for the E2E tests: no new dependency.
import { chromium } from "@playwright/test";
import { copyFileSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const DEV = process.env.DEV_URL || "http://localhost:5173/";
const OUT = resolve("docs/readme");

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ headless: !process.env.HEADED });

/** A fresh editor, as a returning visitor with nothing open, optionally in dark mode. */
async function editor(viewport, theme = "light") {
  const page = await browser.newPage({ viewport, deviceScaleFactor: 1, acceptDownloads: true });
  await page.addInitScript((theme) => {
    if (sessionStorage.getItem("nd-readme")) return;
    sessionStorage.setItem("nd-readme", "1");
    localStorage.clear();
    localStorage.setItem("nedito:collapsedGroups", '["cloud"]');
    localStorage.setItem("nedito:demoDismissed", "true");
    localStorage.setItem("nedito:splashSeen", "1");
    localStorage.setItem("nedito:theme", theme);
  }, theme);
  await page.goto(DEV);
  return page;
}

async function openTemplate(page, id) {
  await page.getByTestId("nd-sidebar-tab-templates").click();
  await page.getByTestId(`nd-template-card-${id}`).first().click();
  await page.waitForTimeout(2000);
  // Back to the Shapes tab, its groups folded: the template thumbnails would crowd the picture,
  // and a GIF's 256 colours with them.
  await page.getByTestId("nd-sidebar-tab-shapes").click();
  await page.evaluate(() => window.__rf?.fitView?.({ padding: 0.08 }));
  await page.waitForTimeout(800);
}

const nestedId = (page, label) =>
  page.evaluate((label) => {
    const s = window.__ddStore.getState();
    return s.doc.diagrams[s.currentDiagramId()].nodes.find((n) => n.type === "nested" && n.label?.text === label)?.id;
  }, label);

try {
  // 1. Opening a Nested Block, and back out.
  {
    const page = await editor({ width: 1200, height: 720 });
    await openTemplate(page, "azure-landing-zone");
    // A pointer the recording can see: headless screenshots draw no cursor.
    await page.evaluate(() => {
      const c = document.createElement("div");
      c.innerHTML = '<svg width="22" height="22" viewBox="0 0 24 24"><path d="M4 2l15 11-6.5 1.2L16 21l-3 1.4-3.4-6.7L4 20z" fill="#1E2733" stroke="#fff" stroke-width="1.5"/></svg>';
      Object.assign(c.style, { position: "fixed", left: "0", top: "0", zIndex: "99999", pointerEvents: "none" });
      document.body.append(c);
      addEventListener("mousemove", (e) => (c.style.transform = `translate(${e.clientX - 3}px, ${e.clientY - 2}px)`), true);
    });
    const frames = [];
    let last = Date.now();
    const snap = async (holdMs = 0) => {
      const png = await page.screenshot();
      const now = Date.now();
      // A frame lasts until the next one was taken, except a pause, which keeps its own length.
      const prev = frames[frames.length - 1];
      if (prev && !prev.held) prev.delayMs = Math.max(40, now - last);
      frames.push({ png: png.toString("base64"), delayMs: holdMs || 80, held: holdMs > 0 });
      last = now;
      if (holdMs) {
        await page.waitForTimeout(holdMs);
        last = Date.now();
      }
    };
    const glide = async (to, steps = 10) => {
      const from = await page.evaluate(() => window.__ndPointer ?? { x: 600, y: 600 });
      for (let i = 1; i <= steps; i++) {
        const x = from.x + ((to.x - from.x) * i) / steps;
        const y = from.y + ((to.y - from.y) * i) / steps;
        await page.mouse.move(x, y);
        await page.evaluate((p) => (window.__ndPointer = p), { x, y });
        await snap();
      }
    };
    const center = async (locator) => {
      const b = await locator.boundingBox();
      return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
    };
    await page.mouse.move(600, 600);
    await snap(2200);
    const spoke = await nestedId(page, "Retail spoke");
    const open = page.getByTestId(`nd-nested-open-${spoke}`);
    await glide(await center(page.locator(`.react-flow__node[data-id="${spoke}"]`)), 8);
    await glide(await center(open), 6);
    await snap(500);
    await open.click();
    for (let i = 0; i < 12; i++) await snap();
    await page.waitForTimeout(600);
    await snap(2800);
    await glide(await center(page.getByTestId("nd-breadcrumb-0")), 10);
    await snap(500);
    await page.getByTestId("nd-breadcrumb-0").click();
    for (let i = 0; i < 10; i++) await snap();
    await page.waitForTimeout(600);
    await snap(2400);

    // Encode in the page, with the app's own encoder: decode each screenshot to pixels there.
    const gif = await page.evaluate(async (frames) => {
      const { GifStreamEncoder, gifPalette } = await import("/src/file/gifEncoder.ts");
      const pixels = async (b64) => {
        const bmp = await createImageBitmap(await (await fetch(`data:image/png;base64,${b64}`)).blob());
        const c = new OffscreenCanvas(bmp.width, bmp.height);
        const g = c.getContext("2d");
        g.drawImage(bmp, 0, 0);
        return g.getImageData(0, 0, bmp.width, bmp.height);
      };
      const first = await pixels(frames[0].png);
      const { width: w, height: h } = first;
      const sample = [];
      for (const i of [0, Math.floor(frames.length / 3), Math.floor((frames.length * 2) / 3), frames.length - 1]) {
        sample.push({ rgba: (await pixels(frames[i].png)).data, delayMs: 0 });
      }
      const enc = new GifStreamEncoder(w, h, gifPalette(sample, w, h), true);
      for (const f of frames) enc.addFrame({ rgba: (await pixels(f.png)).data, delayMs: f.delayMs });
      return Array.from(enc.finish());
    }, frames);
    writeFileSync(`${OUT}/nesting.gif`, Buffer.from(gif));
    console.log(`nesting.gif: ${frames.length} frames, ${Math.round(gif.length / 1024)} KB`);
    await page.close();
  }

  // 2. Motion, through the app's own GIF export.
  {
    const page = await editor({ width: 1400, height: 860 });
    await openTemplate(page, "aws-three-tier");
    await page.evaluate(() => {
      const s = window.__ddStore.getState();
      const d = s.doc.diagrams[s.currentDiagramId()];
      s.setEdgeMotion(d.edges.map((e) => e.id), { kind: "packets" });
      s.clearSelection?.();
    });
    await page.getByTestId("nd-export-menu-trigger").click();
    await page.getByTestId("nd-export-gif").click();
    await page.getByTestId("nd-gif-size-medium").check();
    await page.getByTestId("nd-gif-rate-light").check();
    const [download] = await Promise.all([page.waitForEvent("download"), page.getByTestId("nd-gif-export").click()]);
    copyFileSync(await download.path(), `${OUT}/motion.gif`);
    console.log("motion.gif: exported by the app");
    await page.close();
  }

  // 3. The editor, light, with a Nested Block selected; 4. and dark.
  {
    const page = await editor({ width: 1440, height: 900 });
    await openTemplate(page, "azure-landing-zone");
    const spoke = await nestedId(page, "Data platform spoke");
    await page.locator(`.react-flow__node[data-id="${spoke}"]`).click({ position: { x: 60, y: 60 } });
    await page.mouse.move(5, 5);
    await page.waitForTimeout(800);
    await page.screenshot({ path: `${OUT}/editor.png` });
    await page.close();

    const dark = await editor({ width: 1440, height: 900 }, "dark");
    await openTemplate(dark, "c4-model");
    await dark.mouse.move(5, 5);
    await dark.screenshot({ path: `${OUT}/dark.png` });
    await dark.close();
  }
  console.log("Wrote docs/readme/");
} finally {
  await browser.close();
}
