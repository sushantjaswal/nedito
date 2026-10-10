// Trace (A2, D117), in a real browser: a click in the viewer traces what a shape touches, the
// trace follows connections into and out of a Nested Block, Esc and Stop end it, and in the editor
// it is the context bar's and the palette's. The viewer selects nothing.
import { expect, test, type Page } from "@playwright/test";
import { gotoFresh, openPalette } from "./helpers";

interface Store {
  addShapeNode: (r: string, p: { x: number; y: number }, z: { w: number; h: number }) => string;
  setNodeLabel: (id: string, l: { text: string }) => void;
  connect: (a: { sourceNodeId: string; sourceHandleId: string; targetNodeId: string; targetHandleId: string }) => string;
  setSelection: (n: string[], e?: string[]) => void;
  clearSelection: () => void;
  convertSelectionToNested: (t?: string) => { nestedNodeId: string } | null;
  setMotionEnabled: (on: boolean) => void;
}

/** Gateway → [Payment Service: Cards → Fraud] → Orders DB; Gateway → Audit log; Billing → Cards. */
async function build(page: Page) {
  return page.evaluate(() => {
    const s = window.__ddStore!.getState() as unknown as Store;
    const mk = (x: number, y: number, t: string) => {
      const id = s.addShapeNode("general/rect", { x, y }, { w: 150, h: 64 });
      s.setNodeLabel(id, { text: t });
      return id;
    };
    const gw = mk(60, 200, "API Gateway");
    const cards = mk(400, 120, "Cards");
    const fraud = mk(400, 300, "Fraud");
    const db = mk(760, 300, "Orders DB");
    const audit = mk(60, 420, "Audit log");
    const billing = mk(760, 60, "Billing");
    s.connect({ sourceNodeId: gw, sourceHandleId: "right", targetNodeId: cards, targetHandleId: "left" });
    s.connect({ sourceNodeId: cards, sourceHandleId: "bottom", targetNodeId: fraud, targetHandleId: "top" });
    s.connect({ sourceNodeId: fraud, sourceHandleId: "right", targetNodeId: db, targetHandleId: "left" });
    s.connect({ sourceNodeId: gw, sourceHandleId: "bottom", targetNodeId: audit, targetHandleId: "top" });
    s.connect({ sourceNodeId: billing, sourceHandleId: "left", targetNodeId: cards, targetHandleId: "right" });
    s.setSelection([cards, fraud]);
    const block = s.convertSelectionToNested("Payment Service")!.nestedNodeId;
    s.clearSelection();
    return { gw, cards, fraud, db, audit, billing, block };
  });
}

const node = (page: Page, text: string) => page.locator(".react-flow__node", { hasText: text }).first();
const traceClass = (page: Page, text: string) => node(page, text).evaluate((n) => Array.from(n.classList).find((c) => c.startsWith("nd-trace")) ?? "");

async function openViewer(page: Page) {
  const url = await page.evaluate(async () => {
    const m = await import("/src/share/urlCodec.ts" as string);
    return (await m.createShareLink(window.__ddStore!.getState().doc, `${location.origin}/`)).url as string;
  });
  await page.goto("about:blank");
  await page.goto(url);
  await expect(page.getByTestId("nd-viewer-shell")).toBeVisible();
}

test.beforeEach(async ({ page }) => gotoFresh(page));

test("in the viewer a click traces what a shape touches, and selects nothing", async ({ page }) => {
  await build(page);
  await openViewer(page);
  await node(page, "API Gateway").click();
  await expect(page.getByTestId("nd-trace-hint")).toContainText("API Gateway");
  expect(await traceClass(page, "API Gateway")).toBe("nd-trace-focus");
  expect(await traceClass(page, "Audit log")).toBe("nd-trace-near");
  expect(await traceClass(page, "Payment Service")).toBe("nd-trace-near");
  expect(await traceClass(page, "Orders DB")).toBe("nd-trace-dim");
  expect(await traceClass(page, "Billing")).toBe("nd-trace-dim");
  // The traced lines march; the others are dimmed.
  await expect(page.locator(".react-flow__edge.nd-trace-on")).toHaveCount(2);
  expect(await page.locator(".react-flow__edge.nd-trace-on .nd-flow").first().evaluate((el) => getComputedStyle(el).animationName)).toBe("nd-flow");
  // The port where the line lands lights on the block.
  await expect(node(page, "Payment Service").locator('[class*="lit"]')).toHaveCount(1);
  // No selection, no handles, in a read-only view.
  expect(await page.evaluate(() => (window.__ddStore!.getState() as unknown as { selection: { nodeIds: string[] } }).selection.nodeIds)).toEqual([]);
  await expect(page.locator(".react-flow__node.selected")).toHaveCount(0);
  // Empty canvas ends it.
  await page.mouse.click(1000, 600);
  await expect(page.getByTestId("nd-trace-hint")).toHaveCount(0);
  expect(await traceClass(page, "Orders DB")).toBe("");
});

test("the trace follows the connection into a Nested Block and back out; Esc ends it first", async ({ page }) => {
  await build(page);
  await openViewer(page);
  await node(page, "API Gateway").click();
  await page.locator('[data-testid^="nd-nested-open-"]').first().click();
  await expect(page.getByTestId("nd-breadcrumb-1")).toHaveText("Payment Service");
  // Inside: the shape the lit port maps to is traced, and its ghost pills are lit and readable.
  await expect(page.getByTestId("nd-trace-hint")).toContainText("Cards");
  expect(await traceClass(page, "Cards")).toBe("nd-trace-focus");
  expect(await traceClass(page, "Fraud")).toBe("nd-trace-near");
  await expect(page.locator("[data-lit]")).toHaveCount(2);
  const pills = await page.locator("[data-lit]").evaluateAll((els) => els.map((e) => e.getBoundingClientRect()));
  expect(Math.abs(pills[0].top - pills[1].top)).toBeGreaterThan(pills[0].height - 1); // stacked, not on top of each other

  // Out by the breadcrumb: back at the block.
  await page.getByTestId("nd-breadcrumb-0").click();
  await expect(page.getByTestId("nd-trace-hint")).toContainText("Payment Service");
  expect(await traceClass(page, "Payment Service")).toBe("nd-trace-focus");

  // Esc ends the trace before anything else.
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("nd-trace-hint")).toHaveCount(0);
});

test("in the editor, Trace is the context bar's and the palette's; Stop and Esc end it", async ({ page }) => {
  const ids = await build(page);
  await page.evaluate((id) => (window.__ddStore!.getState() as unknown as Store).setSelection([id]), ids.gw);
  await page.getByTestId("nd-bar-trace").click();
  await expect(page.getByTestId("nd-trace-hint")).toContainText("API Gateway");
  await page.getByTestId("nd-trace-stop").click();
  await expect(page.getByTestId("nd-trace-hint")).toHaveCount(0);

  await openPalette(page, "trace");
  await page.getByTestId("nd-command-trace").click();
  await expect(page.getByTestId("nd-trace-hint")).toContainText("API Gateway");
  // Esc: the selection first, then the trace.
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("nd-trace-hint")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("nd-trace-hint")).toHaveCount(0);
});

test("with motion off, a traced line rests as its dashes", async ({ page }) => {
  const ids = await build(page);
  await page.evaluate((id) => {
    const s = window.__ddStore!.getState() as unknown as Store & { setTrace: (f: string[]) => void };
    s.setMotionEnabled(false);
    s.setTrace([id]);
  }, ids.gw);
  const path = page.locator(".react-flow__edge.nd-trace-on .react-flow__edge-path").first();
  expect(await path.evaluate((el) => getComputedStyle(el).animationName)).toBe("none");
  expect(await path.evaluate((el) => getComputedStyle(el).strokeDasharray)).toBe("8px, 6px");
});
