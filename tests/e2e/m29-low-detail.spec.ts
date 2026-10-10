// Low detail when zoomed far out (P1, D115), in a real browser: below 35% shapes keep their
// outline and fill but drop labels, handles, shadows and miniatures, lines drop arrowheads and
// labels; a selected shape keeps full detail; above the threshold nothing changes.
import { expect, test, type Page } from "@playwright/test";
import { gotoFresh } from "./helpers";

async function build(page: Page) {
  return page.evaluate(() => {
    const s = window.__ddStore!.getState() as unknown as {
      addShapeNode: (r: string, p: { x: number; y: number }, z: { w: number; h: number }) => string;
      addNestedNode: (p: { x: number; y: number }, z: { w: number; h: number }, t?: string) => { nestedNodeId: string };
      setNodeLabel: (id: string, l: { text: string }) => void;
      setEdgeLabel?: (id: string, l: { text: string }) => void;
      connect: (a: { sourceNodeId: string; sourceHandleId: string; targetNodeId: string; targetHandleId: string }) => string;
      setSelection: (n: string[], e: string[]) => void;
    };
    const a = s.addShapeNode("general/rect", { x: 0, y: 0 }, { w: 160, h: 80 });
    const b = s.addShapeNode("general/rect", { x: 300, y: 0 }, { w: 160, h: 80 });
    s.setNodeLabel(a, { text: "Alpha" });
    s.setNodeLabel(b, { text: "Beta" });
    s.connect({ sourceNodeId: a, sourceHandleId: "right", targetNodeId: b, targetHandleId: "left" });
    const nested = s.addNestedNode({ x: 0, y: 200 }, { w: 180, h: 110 }, "Inside").nestedNodeId;
    s.setSelection([b], []);
    return { a, b, nested };
  });
}

const setZoom = (page: Page, zoom: number) =>
  page.evaluate((z) => (window.__rf as unknown as { setViewport: (v: { x: number; y: number; zoom: number }) => void }).setViewport({ x: 40, y: 40, zoom: z }), zoom);

const look = (page: Page, ids: { a: string; b: string; nested: string }) =>
  page.evaluate(({ a, b, nested }) => {
    const node = (id: string) => document.querySelector(`.react-flow__node[data-id="${id}"]`)!;
    const labelShown = (id: string) => {
      const el = Array.from(node(id).querySelectorAll("*")).find((e) => e.childElementCount === 0 && e.textContent?.trim() === (id === a ? "Alpha" : "Beta"));
      return !!el && getComputedStyle(el).display !== "none" && (el as HTMLElement).offsetParent !== null;
    };
    const handle = node(a).querySelector(".react-flow__handle");
    const path = document.querySelector(".react-flow__edge-path")!;
    const preview = node(nested).querySelector('[class*="preview"]');
    const glyph = node(a).querySelector('svg[class*="glyph"]');
    return {
      lowDetail: document.querySelector(".react-flow")!.classList.contains("nd-lod"),
      unselectedLabel: labelShown(a),
      selectedLabel: labelShown(b),
      handles: handle ? getComputedStyle(handle).display !== "none" : false,
      arrowhead: getComputedStyle(path).markerEnd !== "none",
      miniature: preview ? getComputedStyle(preview).visibility !== "hidden" : false,
      shadow: glyph ? getComputedStyle(glyph).filter !== "none" : false,
    };
  }, ids);

test.beforeEach(async ({ page }) => gotoFresh(page));

test("below 35% the canvas draws outlines only; a selected shape keeps its detail", async ({ page }) => {
  const ids = await build(page);
  await setZoom(page, 0.3);
  await expect.poll(async () => (await look(page, ids)).lowDetail).toBe(true);
  expect(await look(page, ids)).toEqual({
    lowDetail: true,
    unselectedLabel: false,
    selectedLabel: true,
    handles: false,
    arrowhead: false,
    miniature: false,
    shadow: false,
  });
});

test("at and above 35% nothing changes", async ({ page }) => {
  const ids = await build(page);
  await setZoom(page, 0.3);
  await expect.poll(async () => (await look(page, ids)).lowDetail).toBe(true);
  await setZoom(page, 0.5);
  await expect.poll(async () => (await look(page, ids)).lowDetail).toBe(false);
  const full = await look(page, ids);
  expect(full).toEqual({ lowDetail: false, unselectedLabel: true, selectedLabel: true, handles: true, arrowhead: true, miniature: true, shadow: true });
});
