// Draggable edge labels: drag a line's label along or off it;
// it keeps its place relative to the line as the shapes move.
import { expect, test, type Page } from "@playwright/test";
import { getDoc, gotoFresh } from "./helpers";

interface Store {
  addShapeNode: (ref: string, pos: { x: number; y: number }, size: { w: number; h: number }) => string;
  connect: (a: { sourceNodeId: string; sourceHandleId: string; targetNodeId: string; targetHandleId: string }) => string;
  setEdgeLabel: (id: string, label: { text: string }) => void;
  setSelection: (n: string[], e?: string[]) => void;
  moveOrResizeNodes: (u: { id: string; patch: { position: { x: number; y: number } } }[]) => void;
}

async function setup(page: Page) {
  const ids = await page.evaluate(() => {
    const s = () => window.__ddStore!.getState() as unknown as Store;
    const a = s().addShapeNode("general/rect", { x: 0, y: 0 }, { w: 140, h: 64 });
    const b = s().addShapeNode("general/rect", { x: 360, y: 0 }, { w: 140, h: 64 });
    const edge = s().connect({ sourceNodeId: a, sourceHandleId: "right", targetNodeId: b, targetHandleId: "left" });
    s().setEdgeLabel(edge, { text: "sends order" });
    s().setSelection([], []);
    (window.__rf as unknown as { setViewport: (v: { x: number; y: number; zoom: number }) => void }).setViewport({ x: 200, y: 250, zoom: 1 });
    return { a, b, edge };
  });
  await page.waitForTimeout(200);
  return ids;
}

const edge = async (page: Page, id: string) => {
  const doc = await getDoc(page);
  return Object.values(doc.diagrams).flatMap((d) => d.edges).find((e) => e.id === id)!;
};

async function drag(page: Page, from: { x: number; y: number }, by: { x: number; y: number }) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + by.x / 2, from.y + by.y / 2, { steps: 4 });
  await page.mouse.move(from.x + by.x, from.y + by.y, { steps: 4 });
  await page.mouse.up();
}

test.describe("Draggable edge labels", () => {
  test.beforeEach(async ({ page }) => {
    await gotoFresh(page);
    await page.locator(".react-flow__pane").waitFor();
  });

  test("dragging a label moves it off the line, as one undo step, and it follows the shapes", async ({ page }) => {
    const { b, edge: id } = await setup(page);
    const label = page.getByTestId(`nd-edge-label-${id}`);
    const before = (await label.boundingBox())!;
    await drag(page, { x: before.x + before.width / 2, y: before.y + before.height / 2 }, { x: 60, y: 70 });

    const moved = (await label.boundingBox())!;
    expect(moved.x - before.x).toBeGreaterThan(50);
    expect(moved.y - before.y).toBeGreaterThan(60);
    const pos = (await edge(page, id)).labelPosition!;
    expect(pos.t).toBeGreaterThan(0.6);
    expect(pos.dy).toBeGreaterThan(60);

    // Move the target shape further right: the label keeps its place relative to the line.
    await page.evaluate((nodeId) => (window.__ddStore!.getState() as unknown as Store).moveOrResizeNodes([{ id: nodeId, patch: { position: { x: 560, y: 0 } } }]), b);
    await page.waitForTimeout(150);
    expect((await label.boundingBox())!.x).toBeGreaterThan(moved.x + 50);

    // Undo the shape move, then the label move: one step each.
    await page.keyboard.press("ControlOrMeta+z");
    await page.keyboard.press("ControlOrMeta+z");
    await expect.poll(async () => (await edge(page, id)).labelPosition).toBeUndefined();
  });

  test("a click on the label selects the line, and double-click still edits it", async ({ page }) => {
    const { edge: id } = await setup(page);
    const label = page.getByTestId(`nd-edge-label-${id}`);
    await label.click();
    await expect.poll(() => page.evaluate(() => (window.__ddStore!.getState() as unknown as { selection: { edgeIds: string[] } }).selection.edgeIds)).toEqual([id]);
    expect((await edge(page, id)).labelPosition).toBeUndefined();
    await label.dblclick();
    await page.keyboard.press("ControlOrMeta+a");
    await page.keyboard.type("ships");
    await page.keyboard.press("Enter");
    await expect.poll(async () => (await edge(page, id)).label?.text).toBe("ships");
  });

  test("Reset label position, from the line's menu, puts it back in the middle", async ({ page }) => {
    const { edge: id } = await setup(page);
    const label = page.getByTestId(`nd-edge-label-${id}`);
    const before = (await label.boundingBox())!;
    await drag(page, { x: before.x + before.width / 2, y: before.y + before.height / 2 }, { x: 0, y: 80 });
    await expect.poll(async () => (await edge(page, id)).labelPosition).toBeDefined();

    const now = (await label.boundingBox())!;
    await page.mouse.click(before.x + before.width / 2 - 60, before.y + before.height / 2);
    await page.locator(`.react-flow__edge[data-id="${id}"]`).click({ button: "right", position: undefined, force: true });
    await page.getByRole("button", { name: "Reset label position" }).click();
    await expect.poll(async () => (await edge(page, id)).labelPosition).toBeUndefined();
    expect((await label.boundingBox())!.y).toBeLessThan(now.y - 60);
  });
});
