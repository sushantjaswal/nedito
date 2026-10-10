// Pan and zoom frame times with a large diagram, on the production build (D114).
//
//   npm run build
//   npm run dev                      (builds the test diagram with the app's own model)
//   npm run preview -- --port 4173   (the build being measured)
//   npm run perf                     (N=500 by default; HEADED=1 for a visible window)
//
// The diagram — labelled shapes, cloud icons, Nested Blocks whose levels hold shapes (so their
// live miniatures have work to do) and a chain of edges — is built on the dev server and seeded
// as the autosave, so silent restore loads it into the production page. Frame times come from
// requestAnimationFrame while the script space-drags (pan) and Ctrl-scrolls (zoom), first with
// every node on screen (fit, the worst case), then at 150% with only part of it on screen.
// Headless Chromium can render differently from a real window; HEADED=1 is the number to quote.
// Uses the Chromium Playwright already installs for the E2E tests: no new dependency.
import { chromium } from "@playwright/test";

const N = Number(process.env.N || 500);
const DEV = process.env.DEV_URL || "http://localhost:5173/";
const PROD = process.env.PROD_URL || "http://localhost:4173/";

const browser = await chromium.launch({ headless: !process.env.HEADED });
try {
  const dev = await browser.newPage();
  await dev.goto(DEV);
  await dev.waitForSelector(".react-flow__pane");
  const built = await dev.evaluate(async (count) => {
    const store = window.__ddStore;
    const s = store.getState();
    const refs = ["general/rect", "general/rounded-rect", "general/ellipse", "general/diamond", "general/cylinder", "aws/compute/aws-lambda", "azure/compute/virtual-machine"];
    const cols = Math.ceil(Math.sqrt(count));
    const ids = [];
    for (let i = 0; i < count; i++) {
      const at = { x: (i % cols) * 220, y: Math.floor(i / cols) * 140 };
      if (i % 25 === 0) ids.push(s.addNestedNode(at, { w: 180, h: 110 }, `Service ${i}`).nestedNodeId);
      else {
        const id = s.addShapeNode(refs[i % refs.length], at, { w: 160, h: 80 });
        s.setNodeLabel(id, { text: `Node ${i}` });
        ids.push(id);
      }
    }
    const root = store.getState().doc.diagrams[store.getState().currentDiagramId()];
    for (const n of root.nodes.filter((x) => x.type === "nested")) {
      store.getState().navigateInto(n.id);
      for (let k = 0; k < 6; k++) store.getState().addShapeNode("general/rect", { x: (k % 3) * 200, y: Math.floor(k / 3) * 120 }, { w: 140, h: 70 });
      store.getState().navigateBack();
    }
    for (let i = 0; i < count - 1; i++) {
      if ((i + 1) % cols === 0) continue;
      store.getState().connect({ sourceNodeId: ids[i], sourceHandleId: "right", targetNodeId: ids[i + 1], targetHandleId: "left" });
    }
    const format = await import("/src/file/documentFormat.ts");
    const doc = store.getState().doc;
    const page = doc.diagrams[doc.rootDiagramIds[0]];
    return { text: format.encodeDoc(doc), nodes: page.nodes.length, edges: page.edges.length };
  }, N);
  await dev.close();
  console.log(`diagram: ${built.nodes} nodes, ${built.edges} edges, ${(built.text.length / 1024).toFixed(0)} KB`);

  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.addInitScript((text) => {
    if (sessionStorage.getItem("nd-perf-seeded")) return;
    sessionStorage.setItem("nd-perf-seeded", "1");
    localStorage.clear();
    for (const [k, v] of Object.entries({ "nedito:autosave": text, "nedito:splashSeen": "1", "nedito:demoDismissed": "true" })) localStorage.setItem(k, v);
  }, built.text);
  const t0 = Date.now();
  await page.goto(PROD);
  await page.waitForSelector(".react-flow__node");
  console.log(`first node on screen after ${Date.now() - t0} ms`);
  await page.waitForTimeout(1500);

  const record = () =>
    page.evaluate(() => {
      window.__ndFrames = [];
      window.__ndRecording = true;
      let last = performance.now();
      const tick = (t) => {
        window.__ndFrames.push(t - last);
        last = t;
        if (window.__ndRecording) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
  const stop = () =>
    page.evaluate(() => {
      window.__ndRecording = false;
      const f = window.__ndFrames.slice(2);
      const sorted = [...f].sort((a, b) => a - b);
      const q = (x) => sorted[Math.min(sorted.length - 1, Math.floor(x * sorted.length))];
      const total = f.reduce((a, b) => a + b, 0);
      return { fps: Math.round((f.length / total) * 1000), median: +q(0.5).toFixed(1), p95: +q(0.95).toFixed(1), worst: +sorted[sorted.length - 1].toFixed(1), over20ms: f.filter((x) => x > 20).length, frames: f.length };
    });

  const box = await page.locator(".react-flow__pane").boundingBox();
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const rows = [];
  const measure = async (label) => {
    const mounted = await page.locator(".react-flow__node").count();
    await record();
    await page.keyboard.down("Space");
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    for (let i = 0; i < 90; i++) await page.mouse.move(cx + Math.sin(i / 8) * 300, cy + Math.cos(i / 10) * 200);
    await page.mouse.up();
    await page.keyboard.up("Space");
    rows.push({ case: label, gesture: "pan", mounted, ...(await stop()) });
    await record();
    await page.mouse.move(cx, cy);
    await page.keyboard.down("Control");
    for (let i = 0; i < 40; i++) {
      await page.mouse.wheel(0, i < 20 ? -60 : 60);
      await page.waitForTimeout(16);
    }
    await page.keyboard.up("Control");
    rows.push({ case: label, gesture: "zoom", mounted, ...(await stop()) });
  };

  await page.locator(".react-flow__controls-fitview").click();
  await page.waitForTimeout(800);
  await measure("everything on screen (fit)");
  for (let i = 0; i < 7; i++) await page.getByTestId("nd-zoom-in").click();
  await page.waitForTimeout(600);
  await measure("part on screen (150%)");
  console.table(rows);
} finally {
  await browser.close();
}
