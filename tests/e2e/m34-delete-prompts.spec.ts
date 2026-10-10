// The deletion prompts (N7, D138), in a real browser: deleting a Nested Block that holds shapes
// asks first; Esc keeps everything; keeping the contents brings them onto this level.
import { expect, test, type Page } from "@playwright/test";
import { gotoFresh } from "./helpers";

interface Store {
  addShapeNode: (r: string, p: { x: number; y: number }, z: { w: number; h: number }) => string;
  setNodeLabel: (id: string, l: { text: string }) => void;
  addNestedNode: (p: { x: number; y: number }, z: { w: number; h: number }, t: string) => { nestedNodeId: string };
  navigateInto: (id: string) => void;
  navigateBack: () => void;
  setSelection: (n: string[], e: string[]) => void;
}

async function blockWithTwoShapes(page: Page): Promise<string> {
  return page.evaluate(() => {
    const store = window.__ddStore!;
    const s = store.getState() as unknown as Store;
    const { nestedNodeId } = s.addNestedNode({ x: 300, y: 200 }, { w: 180, h: 110 }, "Payments");
    s.navigateInto(nestedNodeId);
    const inner = store.getState() as unknown as Store;
    inner.setNodeLabel(inner.addShapeNode("general/rect", { x: 0, y: 0 }, { w: 120, h: 60 }), { text: "Cards" });
    inner.setNodeLabel(inner.addShapeNode("general/rect", { x: 200, y: 0 }, { w: 120, h: 60 }), { text: "Fraud" });
    inner.navigateBack();
    (store.getState() as unknown as Store).setSelection([nestedNodeId], []);
    return nestedNodeId;
  });
}

test.beforeEach(async ({ page }) => gotoFresh(page));

test("deleting a block that holds shapes asks first, and Esc keeps everything", async ({ page }) => {
  const id = await blockWithTwoShapes(page);
  await page.locator(".react-flow__pane").focus().catch(() => {});
  await page.keyboard.press("Delete");
  const prompt = page.getByTestId("nd-delete-prompt");
  await expect(prompt).toBeVisible();
  await expect(prompt).toContainText("Delete “Payments”?");
  await expect(prompt).toContainText("It holds 2 shapes");
  // The safe choice has the focus.
  await expect(page.getByTestId("nd-delete-keep-contents")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(prompt).toHaveCount(0);
  await expect(page.locator(`.react-flow__node[data-id="${id}"]`)).toBeVisible();
});

test("Keep the contents here brings the shapes onto this level, where the block was", async ({ page }) => {
  const id = await blockWithTwoShapes(page);
  await page.keyboard.press("Delete");
  await page.getByTestId("nd-delete-keep-contents").click();
  await expect(page.locator(`.react-flow__node[data-id="${id}"]`)).toHaveCount(0);
  await expect(page.locator(".react-flow__node", { hasText: "Cards" })).toBeVisible();
  await expect(page.locator(".react-flow__node", { hasText: "Fraud" })).toBeVisible();
  // One undo puts the block back, contents inside.
  await page.keyboard.press("Control+z");
  await expect(page.locator(`.react-flow__node[data-id="${id}"]`)).toBeVisible();
  await expect(page.locator(".react-flow__node", { hasText: "Cards" })).toHaveCount(0);
});

test("Delete everything removes the block and what it held", async ({ page }) => {
  const id = await blockWithTwoShapes(page);
  await page.keyboard.press("Delete");
  await page.getByTestId("nd-delete-delete-all").click();
  await expect(page.locator(`.react-flow__node[data-id="${id}"]`)).toHaveCount(0);
  await expect(page.locator(".react-flow__node", { hasText: "Cards" })).toHaveCount(0);
});
