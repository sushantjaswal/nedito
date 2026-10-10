// Lines the way draw.io does them (CLAUDE_HISTORY D86): a line from the Lines section is a real
// line, not a box with a line drawn in it. Its ends drag onto shapes and off them again, it bends
// where it is pulled, it moves as a whole while free, and a small bar over it changes its pattern,
// its arrowheads and its route — each driven here as a person would drive it.
import { expect, test, type Page } from "@playwright/test";
import { gotoFresh } from "./helpers";

type End = { nodeId?: string; point?: { x: number; y: number } };
type E = { id: string; source: End; target: End; waypoints?: { x: number; y: number }[]; style: Record<string, unknown> };
type Store = {
  addShapeNode: (r: string, p: { x: number; y: number }, s: { w: number; h: number }) => string;
  setSelection: (n: string[], e?: string[]) => void;
};

const edges = (page: Page): Promise<E[]> =>
  page.evaluate(() => {
    const s = window.__ddStore!.getState();
    return s.doc.diagrams[s.currentDiagramId()].edges as never;
  });
const nodeCount = (page: Page) =>
  page.evaluate(() => {
    const s = window.__ddStore!.getState();
    return s.doc.diagrams[s.currentDiagramId()].nodes.length;
  });
const add = (page: Page, ref: string, x: number, y: number, w: number, h: number) =>
  page.evaluate(({ ref, x, y, w, h }) => (window.__ddStore!.getState() as unknown as Store).addShapeNode(ref, { x, y }, { w, h }), { ref, x, y, w, h });
const centre = async (page: Page, testId: string) => {
  const b = (await page.getByTestId(testId).boundingBox())!;
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
};
/** A diagram point on screen. */
const toScreen = (page: Page, p: { x: number; y: number }) =>
  page.evaluate((p) => {
    const v = window.__rf!.getViewport!();
    const r = document.querySelector('[data-testid="nd-canvas"]')!.getBoundingClientRect();
    return { x: r.left + v.x + p.x * v.zoom, y: r.top + v.y + p.y * v.zoom };
  }, p);
async function drag(page: Page, from: { x: number; y: number }, to: { x: number; y: number }) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2, { steps: 4 });
  await page.mouse.move(to.x, to.y, { steps: 6 });
  await page.mouse.up();
}

test.describe("Lines", () => {
  test.beforeEach(async ({ page }) => {
    await gotoFresh(page);
    // Let the canvas finish mounting first: its opening "nothing selected" report would otherwise
    // land after a line added by script within milliseconds of load, and deselect it.
    await page.locator(".react-flow__pane").waitFor();
    await page.waitForTimeout(150);
  });

  test("a line from the sidebar is a line with free ends, selected, with its bar", async ({ page }) => {
    await page.getByTestId("nd-stencil-lines/realization").click();
    expect(await nodeCount(page)).toBe(0);
    const [line] = await edges(page);
    expect(line.source.point).toBeDefined();
    expect(line.target.point).toBeDefined();
    expect(line.style).toMatchObject({ dash: "dashed", endArrow: "triangle" });
    await expect(page.getByTestId("nd-edge-toolbar")).toBeVisible();
    await expect(page.getByTestId(`nd-edge-end-${line.id}-source`)).toBeVisible();
    await expect(page.getByTestId(`nd-edge-end-${line.id}-target`)).toBeVisible();
  });

  test("an end dragged onto a shape attaches there, and dragged off it is free again", async ({ page }) => {
    const box = await add(page, "general/rect", 600, 150, 140, 80);
    const id = await add(page, "lines/arrow", 200, 170, 160, 40);
    const shape = (await page.locator(`.react-flow__node[data-id="${box}"]`).boundingBox())!;

    // Anywhere on the shape attaches, not only its connection points — the side nearest wins.
    await drag(page, await centre(page, `nd-edge-end-${id}-target`), { x: shape.x + 15, y: shape.y + shape.height / 2 });
    let line = (await edges(page))[0];
    expect(line.target).toMatchObject({ nodeId: box });
    expect(line.style.targetHandle).toBe("left");

    const end = await centre(page, `nd-edge-end-${id}-target`);
    await drag(page, end, { x: end.x - 40, y: end.y + 200 });
    line = (await edges(page))[0];
    expect(line.target.nodeId).toBeUndefined();
    expect(line.target.point).toBeDefined();
  });

  test("pulling the faint midpoint dot bends the line; dragging a free line moves it whole", async ({ page }) => {
    const id = await add(page, "lines/line", 200, 300, 200, 40);
    const mid = await centre(page, `nd-edge-bend-${id}-0`);
    await drag(page, mid, { x: mid.x, y: mid.y - 100 });
    let line = (await edges(page))[0];
    expect(line.waypoints).toHaveLength(1);

    const start = line.source.point!;
    // Grab the line itself, a third of the way to its bend.
    const bend = line.waypoints![0];
    const grab = await toScreen(page, { x: start.x + (bend.x - start.x) / 3, y: start.y + (bend.y - start.y) / 3 });
    await drag(page, grab, { x: grab.x + 120, y: grab.y + 60 });
    line = (await edges(page))[0];
    expect(line.source.point!.x - start.x).toBeGreaterThan(80);
    expect(line.waypoints).toHaveLength(1);
  });

  test("the bar's Line ends popup picks each arrowhead by sight; Connection picks route and shape", async ({ page }) => {
    await page.getByTestId("nd-stencil-lines/line").click();
    await page.getByRole("button", { name: "Line ends" }).click();
    await page.getByRole("radiogroup", { name: "End arrow" }).getByRole("radio", { name: "Triangle (hollow)" }).click();
    await page.getByRole("radiogroup", { name: "Start arrow" }).getByRole("radio", { name: "Diamond (filled)" }).click();
    // Polled rather than read once straight after the click (D111).
    const lineStyle = async () => (await edges(page))[0]?.style ?? {};
    await expect.poll(lineStyle).toMatchObject({ endArrow: "triangle", startArrow: "diamond" });

    await page.getByRole("button", { name: "Connection" }).click();
    await page.getByRole("radio", { name: "Elbow" }).click();
    await page.getByRole("radio", { name: "Block arrow" }).click();
    await expect.poll(lineStyle).toMatchObject({ edgeStyle: "orthogonal", edgeShape: "arrow" });

    await page.getByRole("button", { name: "Line style" }).click();
    await page.getByTestId("nd-edge-toolbar-style").getByLabel("Line pattern").selectOption("dotted");
    await expect.poll(async () => (await lineStyle()).dash).toBe("dotted");
  });

  test("a connection let go on open canvas stays, as a line from the shape", async ({ page }) => {
    const box = await add(page, "general/rect", 300, 300, 140, 80);
    await page.evaluate(() => (window.__ddStore!.getState() as unknown as Store).setSelection([], []));
    const node = page.locator(`.react-flow__node[data-id="${box}"]`);
    await node.hover();
    const handle = (await node.locator('.react-flow__handle[data-handleid="right"]').boundingBox())!;
    await drag(page, { x: handle.x + handle.width / 2, y: handle.y + handle.height / 2 }, { x: handle.x + 250, y: handle.y + 80 });
    const [line] = await edges(page);
    expect(line.source.nodeId).toBe(box);
    expect(line.target.point).toBeDefined();
  });

  test("search finds a line by its notation's other names", async ({ page }) => {
    await page.getByPlaceholder("Search shapes").fill("generalization");
    await expect(page.getByTestId("nd-stencil-lines/inheritance")).toBeVisible();
    await page.getByPlaceholder("Search shapes").fill("1:n");
    await expect(page.getByTestId("nd-stencil-lines/one-to-many")).toBeVisible();
    await page.getByPlaceholder("Search shapes").fill("flex arrow");
    await expect(page.getByTestId("nd-stencil-lines/arrow-block")).toBeVisible();
  });
});
