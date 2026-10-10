// Every control in the format panel and the top bar, driven as a user drives it, checked against
// what it says it does. The unit tests cover each decision; what a browser
// adds is the real focus, keystrokes, clicks and native inputs between the user and the model.
import { expect, test, type Page } from "@playwright/test";
import { gotoFresh, openPalette, runCommand } from "./helpers";

type N = { id: string; type: string; position: { x: number; y: number }; size: { w: number; h: number }; z: number; rotation?: number; style: Record<string, unknown>; label?: Record<string, unknown> };

const nodes = (page: Page): Promise<N[]> =>
  page.evaluate(() => {
    const s = window.__ddStore!.getState();
    return s.doc.diagrams[s.currentDiagramId()].nodes as never;
  });
const node = async (page: Page, id: string) => (await nodes(page)).find((n) => n.id === id)!;
const undoSteps = (page: Page) =>
  page.evaluate(() => (window.__ddStore as unknown as { temporal: { getState: () => { pastStates: unknown[] } } }).temporal.getState().pastStates.length);
const selectedCount = (page: Page) =>
  page.evaluate(() => (window.__ddStore!.getState() as unknown as { selection: { nodeIds: string[] } }).selection.nodeIds.length);

async function addShape(page: Page, x: number, y: number, text: string): Promise<string> {
  return page.evaluate(
    ({ x, y, text }) => {
      const s = window.__ddStore!.getState() as unknown as {
        addShapeNode: (r: string, p: { x: number; y: number }, z: { w: number; h: number }) => string;
        setNodeLabel: (id: string, l: { text: string }) => void;
      };
      const id = s.addShapeNode("general/rect", { x, y }, { w: 120, h: 60 });
      s.setNodeLabel(id, { text });
      return id;
    },
    { x, y, text },
  );
}
/** The store's UI slice, which the page's global typing leaves out. */
type UiStore = { ui: Record<string, unknown> & { onboarding: { tourStep: number } }; setTourStep: (n: number) => void };
const ui = (page: Page) => page.evaluate(() => (window.__ddStore!.getState() as unknown as UiStore).ui);

const select = (page: Page, ids: string[]) =>
  page.evaluate((ids) => (window.__ddStore!.getState() as unknown as { setSelection: (i: string[]) => void }).setSelection(ids), ids);

/** Retype a field the way a person does: select all, clear, type, Tab away. */
async function retype(page: Page, label: string, value: string) {
  const f = page.getByLabel(label, { exact: true });
  await f.click();
  await f.press("ControlOrMeta+A");
  await f.press("Backspace");
  await f.pressSequentially(value);
  await f.press("Tab");
}

async function appMenu(page: Page, item: string) {
  await page.getByTestId("nd-app-menu-trigger").click();
  await page.getByTestId(item).click();
}

test.describe("Formatting controls (the context bar's popovers, once the format panel)", () => {
  test.beforeEach(async ({ page }) => gotoFresh(page));

  test("Text: bold, italic, size, colour, alignment and position all reach the label", async ({ page }) => {
    const a = await addShape(page, 100, 100, "Alpha");
    await page.locator(`[data-testid="nd-shape-node-${a}"]`).click();
    await page.getByTestId("nd-bar-text").click();
    const tab = page.getByTestId("nd-text-section");

    await tab.getByRole("button", { name: "Bold" }).click();
    expect((await node(page, a)).label?.bold).toBe(true);
    await expect(page.locator(`[data-testid="nd-shape-node-${a}"]`).getByText("Alpha")).toHaveCSS("font-weight", "700");
    await tab.getByRole("button", { name: "Italic" }).click();
    expect((await node(page, a)).label?.italic).toBe(true);

    // Clearing the size to retype it never writes 0, and the whole edit is one undo step.
    const before = await undoSteps(page);
    await retype(page, "Font size", "18");
    expect((await node(page, a)).label?.fontSize).toBe(18);
    expect((await undoSteps(page)) - before).toBe(1);

    await page.getByLabel("Text color", { exact: true }).fill("#ff0000");
    expect((await node(page, a)).label?.color).toBe("#ff0000");

    for (const al of ["left", "center", "right"]) {
      await tab.getByRole("button", { name: `Align ${al}` }).click();
      expect((await node(page, a)).label?.align).toBe(al);
    }
    for (const v of ["top", "bottom", "middle"]) {
      await tab.getByRole("button", { name: `Vertical align ${v}` }).click();
      expect((await node(page, a)).style.verticalAlign).toBe(v);
    }
  });

  test("Arrange: size, position and rotation commit once, and never collapse the shape", async ({ page }) => {
    const a = await addShape(page, 100, 100, "Alpha");
    await page.locator(`[data-testid="nd-shape-node-${a}"]`).click();
    await page.getByTestId("nd-bar-arrange").click();

    const field = page.getByLabel("Width", { exact: true });
    await field.click();
    await field.press("ControlOrMeta+A");
    await field.press("Backspace");
    expect((await node(page, a)).size.w).toBe(120); // empty is never written
    const before = await undoSteps(page);
    await field.pressSequentially("200");
    await field.press("Tab");
    expect((await node(page, a)).size.w).toBe(200);
    expect((await undoSteps(page)) - before).toBe(1);

    await retype(page, "Height", "90");
    await retype(page, "X position", "40");
    await retype(page, "Y position", "60");
    await retype(page, "Rotation degrees", "30");
    const n = await node(page, a);
    expect([n.size.h, n.position.x, n.position.y, n.rotation]).toEqual([90, 40, 60, 30]);

    await page.keyboard.press("ControlOrMeta+Z");
    expect((await node(page, a)).rotation ?? 0).toBe(0);
  });

  test("Arrange: the order buttons move the shape one step or to the end", async ({ page }) => {
    const a = await addShape(page, 100, 100, "A");
    const b = await addShape(page, 130, 110, "B");
    const c = await addShape(page, 160, 120, "C");
    await select(page, [a]);
    await page.getByTestId("nd-bar-arrange").click();
    const tab = page.getByTestId("nd-arrange-section");
    const order = async () => (await nodes(page)).sort((p, q) => p.z - q.z).map((n) => ({ [a]: "A", [b]: "B", [c]: "C" })[n.id]).join("");

    await tab.getByRole("button", { name: "To front" }).click();
    expect(await order()).toBe("BCA");
    await tab.getByRole("button", { name: "Backward" }).click();
    expect(await order()).toBe("BAC");
    await tab.getByRole("button", { name: "To back" }).click();
    expect(await order()).toBe("ABC");
    await tab.getByRole("button", { name: "Forward" }).click();
    expect(await order()).toBe("BAC");
  });

  test("Arrange: align, distribute, group and ungroup act on the selection", async ({ page }) => {
    const a = await addShape(page, 0, 0, "A");
    const b = await addShape(page, 200, 40, "B");
    const c = await addShape(page, 700, 90, "C");
    await select(page, [a, b, c]);
    await page.getByTestId("nd-bar-arrange").click();
    const tab = page.getByTestId("nd-arrange-section");

    await tab.getByRole("button", { name: "Align top" }).click();
    expect(new Set((await nodes(page)).map((n) => n.position.y)).size).toBe(1);
    await tab.getByRole("button", { name: "Distribute horizontally" }).click();
    const xs = (await nodes(page)).map((n) => n.position.x).sort((p, q) => p - q);
    expect(Math.abs(xs[1] - xs[0] - (xs[2] - xs[1]))).toBeLessThan(1);

    await tab.getByRole("button", { name: "Group", exact: true }).click();
    expect((await nodes(page)).filter((n) => n.type === "group")).toHaveLength(1);
    // Grouping selects the new group, and a new selection opens with its popovers closed.
    await page.getByTestId("nd-bar-arrange").click();
    await tab.getByRole("button", { name: "Ungroup", exact: true }).click();
    expect((await nodes(page)).filter((n) => n.type === "group")).toHaveLength(0);
  });

  test("Fill, Line and More: fill, no fill, line, pattern and shadow all reach the shape and the canvas", async ({ page }) => {
    const a = await addShape(page, 100, 100, "Alpha");
    await page.locator(`[data-testid="nd-shape-node-${a}"]`).click();
    await page.getByTestId("nd-bar-fill").click();
    await page.getByLabel("Fill color", { exact: true }).fill("#ffeeaa");
    expect((await node(page, a)).style.fill).toBe("#ffeeaa");
    await page.getByLabel("No fill").check();
    expect((await node(page, a)).style.fill).toBe("none");
    await page.getByTestId("nd-bar-line").click();
    await retype(page, "Line width", "3");
    expect((await node(page, a)).style.strokeWidth).toBe(3);
    await page.getByLabel("Line pattern").selectOption("dashed");
    expect((await node(page, a)).style.dash).toBe("dashed");
    await expect(page.locator(`[data-testid="nd-shape-node-${a}"] svg g[stroke-dasharray="6 4"]`)).toHaveCount(1);
    await page.getByTestId("nd-bar-more").click();
    await page.getByLabel("Shadow").check();
    await expect(page.locator(`[data-testid="nd-shape-node-${a}"] svg`).first()).toHaveCSS("filter", /drop-shadow/);
  });
});

// The draw.io menu bar's commands, from where they live since R2 (D91): the command palette, the
// app menu and the Export menu.
test.describe("Top bar commands", () => {
  test.beforeEach(async ({ page }) => gotoFresh(page));

  test("Edit: duplicate, undo, redo, select all and select none", async ({ page }) => {
    const a = await addShape(page, 100, 100, "Alpha");
    await select(page, [a]);
    await runCommand(page, "duplicate", "duplicate");
    expect(await nodes(page)).toHaveLength(2);
    await runCommand(page, "undo", "undo");
    expect(await nodes(page)).toHaveLength(1);
    await runCommand(page, "redo", "redo");
    expect(await nodes(page)).toHaveLength(2);
    await runCommand(page, "select-all", "select all");
    expect(await selectedCount(page)).toBe(2);
    await runCommand(page, "select-none", "select none");
    expect(await selectedCount(page)).toBe(0);
  });

  test("View: zoom in, reset, and each toggle flips its setting", async ({ page }) => {
    const zoom = () => page.evaluate(() => Number((document.querySelector(".react-flow__viewport") as HTMLElement).style.transform.match(/scale\(([\d.]+)\)/)?.[1]));
    await runCommand(page, "zoom-in", "zoom in");
    await expect.poll(zoom).toBe(1.25);
    await runCommand(page, "zoom-reset", "reset zoom");
    await expect.poll(zoom).toBe(1);
    for (const t of ["grid", "snap", "layers", "outline", "dark"]) {
      const before = JSON.stringify(await ui(page));
      await runCommand(page, t);
      expect(JSON.stringify(await ui(page)), `${t} did nothing`).not.toBe(before);
      await runCommand(page, t);
    }
  });

  test("Arrange: Ungroup is offered only for a group, Group only for several loose shapes", async ({ page }) => {
    const a = await addShape(page, 0, 0, "A");
    const b = await addShape(page, 200, 0, "B");
    const item = (id: string) => page.getByTestId(`nd-command-${id}`);
    await select(page, [a]);
    await openPalette(page, "group");
    await expect(item("ungroup")).toHaveAttribute("aria-disabled", "true");
    await expect(item("group")).toHaveAttribute("aria-disabled", "true");
    await page.keyboard.press("Escape");
    await select(page, [a, b]);
    await runCommand(page, "group", "group");
    await openPalette(page, "group");
    await expect(item("ungroup")).not.toHaveAttribute("aria-disabled");
    await expect(item("group")).toHaveAttribute("aria-disabled", "true");
  });

  test("App menu: shortcuts, the quick tour and About", async ({ page }) => {
    await appMenu(page, "nd-help-shortcuts");
    await expect(page.getByTestId("nd-shortcuts-dialog")).toBeVisible();
    await page.keyboard.press("Escape");
    // On an empty canvas the tour brings in the sample and starts on its nested box.
    await appMenu(page, "nd-help-tour");
    await expect.poll(async () => (await ui(page)).onboarding.tourStep).toBe(1);
    await page.evaluate(() => (window.__ddStore!.getState() as unknown as UiStore).setTourStep(4));
    await appMenu(page, "nd-help-about");
    await expect(page.getByTestId("nd-about-dialog")).toBeVisible();
  });

  test("Export ▾ › Print sends the drawing to the browser's print dialog", async ({ page }) => {
    await addShape(page, 100, 100, "Alpha");
    // Print renders into a hidden frame and prints that; catch the frame's print() as it is made.
    await page.evaluate(() => {
      (window as unknown as { __printed: number[] }).__printed = [];
      const desc = Object.getOwnPropertyDescriptor(HTMLIFrameElement.prototype, "contentWindow")!;
      Object.defineProperty(HTMLIFrameElement.prototype, "contentWindow", {
        get() {
          const w = desc.get!.call(this) as Window & { __stubbed?: boolean };
          if (w && !w.__stubbed) {
            w.__stubbed = true;
            w.print = () => (window as unknown as { __printed: number[] }).__printed.push(w.document.querySelectorAll("svg").length);
          }
          return w;
        },
      });
    });
    await page.getByTestId("nd-export-menu-trigger").click();
    await page.getByTestId("nd-print").click();
    await expect.poll(() => page.evaluate(() => (window as unknown as { __printed: number[] }).__printed)).toEqual([1]);
  });
});
