// The context bar and canvas chip, driven as a person drives them (R1, CLAUDE_HISTORY.md D90): it
// sits over the selection and follows it, keeps inside the canvas, hides while a shape is dragged,
// is reachable from the keyboard, and the diagram's settings live on the chip.
import { expect, test, type Page } from "@playwright/test";
import { gotoFresh, runCommand } from "./helpers";

type Store = {
  addShapeNode: (r: string, p: { x: number; y: number }, s: { w: number; h: number }) => string;
  addLine: (a: { source: { x: number; y: number }; target: { x: number; y: number }; style: Record<string, unknown> }) => string;
  setSelection: (n: string[], e?: string[]) => void;
  setNodeLabel: (id: string, l: { text: string }) => void;
  setEdgeLabel: (id: string, l: { text: string }) => void;
  selection: { nodeIds: string[]; edgeIds: string[] };
  ui: { gridEnabled: boolean };
};
const store = (page: Page) => page.evaluate(() => window.__ddStore!.getState() as unknown as Store);
const addShape = (page: Page, x: number, y: number) =>
  page.evaluate(({ x, y }) => (window.__ddStore!.getState() as unknown as Store).addShapeNode("general/rect", { x, y }, { w: 120, h: 60 }), { x, y });
const select = (page: Page, ids: string[], edges: string[] = []) =>
  page.evaluate(({ ids, edges }) => (window.__ddStore!.getState() as unknown as Store).setSelection(ids, edges), { ids, edges });
const box = async (page: Page, testId: string) => (await page.getByTestId(testId).boundingBox())!;
const nodeBox = async (page: Page, id: string) => (await page.locator(`.react-flow__node[data-id="${id}"]`).boundingBox())!;

test.describe("Context bar", () => {
  test.beforeEach(async ({ page }) => {
    await gotoFresh(page);
    // Let the canvas finish mounting: its opening "nothing selected" report would otherwise land
    // after a selection made by script within milliseconds of load (see m17-lines).
    await page.locator(".react-flow__pane").waitFor();
    await page.waitForTimeout(150);
  });

  test("sits just above the selection, centred on it, and follows it when the canvas pans", async ({ page }) => {
    const a = await addShape(page, 300, 300);
    await select(page, [a]);
    const shape = await nodeBox(page, a);
    let bar = await box(page, "nd-context-bar");
    expect(bar.y + bar.height).toBeLessThan(shape.y);
    expect(Math.abs(bar.x + bar.width / 2 - (shape.x + shape.width / 2))).toBeLessThan(2);

    // Pan the canvas with the scroll wheel (panOnScroll): the bar moves with the shape.
    await page.mouse.move(shape.x + 300, shape.y + 200);
    await page.mouse.wheel(0, 120);
    await page.waitForTimeout(150);
    const moved = await nodeBox(page, a);
    bar = await box(page, "nd-context-bar");
    expect(moved.y).not.toBe(shape.y);
    expect(Math.abs(bar.x + bar.width / 2 - (moved.x + moved.width / 2))).toBeLessThan(2);
    expect(bar.y + bar.height).toBeLessThan(moved.y);
  });

  test("drops below a shape with no room above it, and never leaves the canvas", async ({ page }) => {
    const a = await addShape(page, 300, 2);
    await select(page, [a]);
    const shape = await nodeBox(page, a);
    const bar = await box(page, "nd-context-bar");
    const canvas = await box(page, "nd-canvas");
    expect(bar.y).toBeGreaterThan(shape.y + shape.height);
    expect(bar.y).toBeGreaterThanOrEqual(canvas.y);
    expect(bar.x).toBeGreaterThanOrEqual(canvas.x);
  });

  test("hides while the shape is dragged and comes back where it lands", async ({ page }) => {
    const a = await addShape(page, 300, 300);
    await select(page, [a]);
    await expect(page.getByTestId("nd-context-bar")).toBeVisible();
    const shape = await nodeBox(page, a);
    await page.mouse.move(shape.x + 60, shape.y + 30);
    await page.mouse.down();
    await page.mouse.move(shape.x + 120, shape.y + 80, { steps: 6 });
    await expect(page.getByTestId("nd-context-bar")).toHaveCount(0);
    await page.mouse.move(shape.x + 200, shape.y + 120, { steps: 6 });
    await page.mouse.up();
    await expect(page.getByTestId("nd-context-bar")).toBeVisible();
    const landed = await nodeBox(page, a);
    const bar = await box(page, "nd-context-bar");
    expect(Math.abs(bar.x + bar.width / 2 - (landed.x + landed.width / 2))).toBeLessThan(2);
  });

  test("Alt+F10 moves focus into the bar; Esc closes a popover, then clears the selection", async ({ page }) => {
    const a = await addShape(page, 300, 300);
    await select(page, [a]);
    await page.keyboard.press("Alt+F10");
    await expect(page.getByTestId("nd-bar-fill")).toBeFocused();
    await page.keyboard.press("ArrowRight");
    await expect(page.getByTestId("nd-bar-line")).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("nd-popover-line")).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(page.getByTestId("nd-popover-line")).toHaveCount(0);
    expect((await store(page)).selection.nodeIds).toEqual([a]);
    await page.keyboard.press("Escape");
    expect((await store(page)).selection.nodeIds).toEqual([]);
    await expect(page.getByTestId("nd-context-bar")).toHaveCount(0);
  });

  test("a single line keeps its own bar, now with Text for its label", async ({ page }) => {
    const id = await page.evaluate(() =>
      (window.__ddStore!.getState() as unknown as Store).addLine({ source: { x: 200, y: 300 }, target: { x: 500, y: 300 }, style: {} }),
    );
    await page.evaluate((id) => (window.__ddStore!.getState() as unknown as Store).setEdgeLabel(id, { text: "flows" }), id);
    await select(page, [], [id]);
    await expect(page.getByTestId("nd-context-bar")).toHaveCount(0);
    await page.getByTestId("nd-edge-toolbar").getByRole("button", { name: "Text" }).click();
    await page.getByTestId("nd-edge-toolbar-text").getByRole("button", { name: "Bold" }).click();
    const bold = await page.evaluate((id) => {
      const s = window.__ddStore!.getState();
      return s.doc.diagrams[s.currentDiagramId()].edges.find((e) => e.id === id)!.label?.bold;
    }, id);
    expect(bold).toBe(true);
  });

  test("a Nested Block's bar opens its child", async ({ page }) => {
    await page.getByTestId("nd-stencil-general/nested").click();
    const depth = () => page.evaluate(() => (window.__ddStore!.getState() as unknown as { navStack: string[] }).navStack.length);
    expect(await depth()).toBe(1);
    await page.getByTestId("nd-bar-open").click();
    await expect.poll(depth).toBe(2);
    await expect(page.getByTestId("nd-breadcrumb-1")).toBeVisible();
  });
});

test.describe("Canvas chip", () => {
  test.beforeEach(async ({ page }) => gotoFresh(page));

  // D99: draw.io's style presets — fill and outline in one click, the label still readable.
  test("Fill's style presets restyle a shape in one click, and Default puts it back", async ({ page }) => {
    const id = await addShape(page, 200, 200);
    await select(page, [id]);
    await page.getByTestId("nd-bar-fill").click();
    await page.getByRole("button", { name: "Style: Dark" }).click();
    const styleOf = () =>
      page.evaluate((nodeId) => {
        const s = window.__ddStore!.getState();
        return s.doc.diagrams[s.currentDiagramId()].nodes.find((n) => n.id === nodeId)!.style;
      }, id);
    expect(await styleOf()).toMatchObject({ fill: "#1e2733", stroke: "#1e2733" });
    await expect(page.getByRole("button", { name: "Style: Dark" })).toHaveAttribute("aria-pressed", "true");
    await page.getByRole("button", { name: "Style: Default" }).click();
    expect(await styleOf()).not.toHaveProperty("fill");
  });

  test("turns the grid and snap off and on in one click each", async ({ page }) => {
    const grid = page.getByTestId("nd-grid-toggle");
    await expect(grid).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator(".react-flow__background")).toHaveCount(1);
    await grid.click();
    await expect(grid).toHaveAttribute("aria-pressed", "false");
    await expect(page.locator(".react-flow__background")).toHaveCount(0);
    await page.getByTestId("nd-snap-toggle").click();
    await expect(page.getByTestId("nd-snap-toggle")).toHaveAttribute("aria-pressed", "false");
  });

  test("sets the page size and background from its Page popover, which the palette's Diagram Settings opens", async ({ page }) => {
    await runCommand(page, "diagram-settings", "diagram settings");
    await expect(page.getByTestId("nd-page-popover")).toBeVisible();
    await page.getByTestId("nd-page-size").selectOption("a4");
    await expect(page.getByTestId("nd-page-button")).toContainText("A4");
    await page.getByTestId("nd-page-orientation-landscape").click();
    await expect(page.getByTestId("nd-page-button")).toContainText("landscape");
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("nd-page-popover")).toHaveCount(0);
    await expect(page.getByTestId("nd-page-button")).toBeFocused();
  });
});
