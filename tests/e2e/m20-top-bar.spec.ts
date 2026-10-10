// R2 (CLAUDE_HISTORY.md D91): the top bar's app menu, command palette, Export split button and
// Share, in a real browser — the palette's Go to across nesting levels, the Export button
// remembering its format across a reload, Recent bringing back a diagram that New replaced,
// Preferences, and the Ctrl+K / Ctrl+S shortcuts.
import { expect, test, type Page } from "@playwright/test";
import { getDoc, gotoFresh, openPalette } from "./helpers";

interface Store {
  addShapeNode: (ref: string, pos: { x: number; y: number }, size: { w: number; h: number }) => string;
  addNestedNode: (pos: { x: number; y: number }, size: { w: number; h: number }) => { nestedNodeId: string; childDiagramId: string };
  setNodeLabel: (id: string, label: { text: string }) => void;
  renameNestedNode: (id: string, label: { text: string }) => void;
  navigateInto: (id: string) => void;
  navigateToDiagram: (id: string) => void;
  doc: { rootDiagramIds: string[] };
  selection: { nodeIds: string[] };
  ui: { darkMode: boolean; gridEnabled: boolean; paletteOpen: boolean };
}

async function addLabelled(page: Page, text: string) {
  await page.evaluate((t) => {
    const s = window.__ddStore!.getState() as unknown as Store;
    s.setNodeLabel(s.addShapeNode("general/rect", { x: 100, y: 100 }, { w: 120, h: 60 }), { text: t });
  }, text);
}

test.describe("Top bar (R2)", () => {
  test.beforeEach(async ({ page }) => gotoFresh(page));

  test("shows the app menu, the command button, the breadcrumb, Export and Share", async ({ page }) => {
    await expect(page.getByTestId("nd-app-menu-trigger")).toBeVisible();
    await expect(page.getByTestId("nd-command-button")).toBeVisible();
    await expect(page.getByTestId("nd-breadcrumbs")).toBeVisible();
    await expect(page.getByTestId("nd-export-main")).toHaveText("Export PNG");
    await expect(page.getByTestId("nd-share")).toBeVisible();
  });

  test("Ctrl+K opens the palette; typing filters, Enter runs, Esc closes", async ({ page }) => {
    await page.keyboard.press("ControlOrMeta+k");
    const input = page.getByTestId("nd-command-input");
    await expect(input).toBeFocused();
    await input.fill("show grid");
    await expect(page.getByRole("option")).toHaveCount(1);
    const before = await page.evaluate(() => (window.__ddStore!.getState() as unknown as Store).ui.gridEnabled);
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("nd-command-palette")).toHaveCount(0);
    expect(await page.evaluate(() => (window.__ddStore!.getState() as unknown as Store).ui.gridEnabled)).toBe(!before);

    await openPalette(page);
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("nd-command-palette")).toHaveCount(0);
    await expect(page.getByTestId("nd-command-button")).toBeFocused();
  });

  test("Go to finds a shape inside a Nested Block and opens its level with it selected", async ({ page }) => {
    const inner = await page.evaluate(() => {
      const s = window.__ddStore!.getState() as unknown as Store;
      const { nestedNodeId } = s.addNestedNode({ x: 100, y: 100 }, { w: 200, h: 140 });
      s.renameNestedNode(nestedNodeId, { text: "Payment Service" });
      (window.__ddStore!.getState() as unknown as Store).navigateInto(nestedNodeId);
      const g = window.__ddStore!.getState() as unknown as Store;
      const id = g.addShapeNode("general/rect", { x: 40, y: 40 }, { w: 120, h: 60 });
      g.setNodeLabel(id, { text: "Fraud Engine" });
      g.navigateToDiagram(g.doc.rootDiagramIds[0]);
      return id;
    });
    await expect(page.getByTestId("nd-breadcrumb-1")).toHaveCount(0);

    await openPalette(page, "fraud");
    const goTo = page.getByRole("option", { name: /^Go to: Fraud Engine/ });
    await expect(goTo).toContainText("In Payment Service");
    await goTo.click();
    await expect(page.getByTestId("nd-breadcrumb-1")).toHaveText("Payment Service");
    await expect.poll(() => page.evaluate(() => (window.__ddStore!.getState() as unknown as Store).selection.nodeIds)).toEqual([inner]);
  });

  test("the Export button repeats the last format, even after a reload", async ({ page }) => {
    await addLabelled(page, "Alpha");
    await page.getByTestId("nd-export-menu-trigger").click();
    const [svg] = await Promise.all([page.waitForEvent("download"), page.getByTestId("nd-export-svg").click()]);
    expect(svg.suggestedFilename()).toMatch(/\.svg$/);
    await expect(page.getByTestId("nd-export-main")).toHaveText("Export SVG");

    await page.reload();
    await expect(page.getByTestId("nd-export-main")).toHaveText("Export SVG");
    const [again] = await Promise.all([page.waitForEvent("download"), page.getByTestId("nd-export-main").click()]);
    expect(again.suggestedFilename()).toMatch(/\.svg$/);
  });

  test("Recent brings back a diagram that New replaced", async ({ page }) => {
    await page.getByTestId("nd-app-menu-trigger").click();
    await expect(page.getByTestId("nd-recent-empty")).toBeVisible();
    await page.keyboard.press("Escape");

    await addLabelled(page, "Keep me");
    await page.getByTestId("nd-app-menu-trigger").click();
    page.once("dialog", (d) => d.accept());
    await page.getByTestId("nd-app-new").click();
    await expect.poll(async () => Object.values((await getDoc(page)).diagrams)[0].nodes.length).toBe(0);

    await page.getByTestId("nd-app-menu-trigger").click();
    await expect(page.getByTestId("nd-recent-0")).toContainText("1 shape");
    await page.getByTestId("nd-recent-0").click();
    await expect.poll(async () => Object.values((await getDoc(page)).diagrams)[0].nodes.map((n) => n.label?.text)).toEqual(["Keep me"]);
  });

  test("Preferences switches dark mode", async ({ page }) => {
    await page.getByTestId("nd-app-menu-trigger").click();
    await page.getByTestId("nd-preferences").click();
    await expect(page.getByTestId("nd-preferences-dialog")).toBeVisible();
    await page.getByTestId("nd-pref-dark").check();
    expect(await page.evaluate(() => (window.__ddStore!.getState() as unknown as Store).ui.darkMode)).toBe(true);
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("nd-preferences-dialog")).toHaveCount(0);
  });

  test("Ctrl+S saves a copy as a .nedito file", async ({ page }) => {
    await addLabelled(page, "Alpha");
    const [download] = await Promise.all([page.waitForEvent("download"), page.keyboard.press("ControlOrMeta+s")]);
    expect(download.suggestedFilename()).toMatch(/\.nedito$/);
  });

  test("Share opens the share dialog straight from the top bar", async ({ page }) => {
    await page.getByTestId("nd-share").click();
    await expect(page.getByTestId("nd-share-dialog")).toBeVisible();
  });
});
