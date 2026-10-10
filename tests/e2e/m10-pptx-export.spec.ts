import { mkdirSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { gotoFresh } from "./helpers";

// The PowerPoint export. The package structure and the Slide Zoom XML are
// unit-tested in src/export/pptx/; what needs a real browser is that Export ▾ › PowerPoint
// renders the diagrams through a canvas and hands over a file.
//
// The exported deck is also written to test-results/ so the one acceptance criterion no
// automated check can cover — "opens without repair prompts in PowerPoint" — can be checked by
// a person with PowerPoint to hand.
const ARTIFACT_DIR = path.join("test-results", "pptx");

/** Three levels: Page 1 ▸ Payment Service ▸ Fraud Engine. */
async function buildNestedDocument(page: import("@playwright/test").Page) {
  await page.evaluate(() => {
    const s = window.__ddStore!.getState() as unknown as {
      addShapeNode: (r: string, p: { x: number; y: number }, z: { w: number; h: number }) => string;
      setNodeLabel: (id: string, label: { text: string }) => void;
      addNestedNode: (
        p: { x: number; y: number },
        z: { w: number; h: number },
        title?: string,
      ) => { nestedNodeId: string };
      navigateInto: (id: string) => void;
      navigateToLevel: (index: number) => void;
    };
    const gw = s.addShapeNode("general/rounded-rect", { x: 60, y: 80 }, { w: 180, h: 70 });
    s.setNodeLabel(gw, { text: "API Gateway" });
    const pay = s.addNestedNode({ x: 340, y: 60 }, { w: 240, h: 150 }, "Payment Service");

    s.navigateInto(pay.nestedNodeId);
    const ledger = (window.__ddStore!.getState() as unknown as typeof s).addShapeNode(
      "general/cylinder",
      { x: 60, y: 60 },
      { w: 140, h: 80 },
    );
    (window.__ddStore!.getState() as unknown as typeof s).setNodeLabel(ledger, { text: "Ledger DB" });
    const fraud = (window.__ddStore!.getState() as unknown as typeof s).addNestedNode(
      { x: 280, y: 50 },
      { w: 200, h: 130 },
      "Fraud Engine",
    );

    (window.__ddStore!.getState() as unknown as typeof s).navigateInto(fraud.nestedNodeId);
    const rules = (window.__ddStore!.getState() as unknown as typeof s).addShapeNode(
      "general/rect",
      { x: 50, y: 50 },
      { w: 140, h: 60 },
    );
    (window.__ddStore!.getState() as unknown as typeof s).setNodeLabel(rules, { text: "Rules" });
    (window.__ddStore!.getState() as unknown as typeof s).navigateToLevel(0);
  });
}

test.describe("PowerPoint export", () => {
  test.beforeAll(() => {
    mkdirSync(ARTIFACT_DIR, { recursive: true });
  });

  test("the dialog states the Slide Zoom limitation rather than hiding it", async ({ page }) => {
    await gotoFresh(page);
    await page.getByTestId("nd-export-menu-trigger").click();
    await page.getByTestId("nd-export-pptx").click();

    const dialog = page.getByTestId("nd-pptx-dialog");
    await expect(dialog).toBeVisible();
    await expect(page.getByTestId("nd-pptx-caveat")).toContainText("can only be created on Windows");

    // Choosing plain links changes the caveat, because the trade is different.
    await page.getByTestId("nd-pptx-nav-link").click();
    await expect(page.getByTestId("nd-pptx-caveat")).toContainText("every version of PowerPoint");

    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
  });

  test("exports a three-level document as a real .pptx and keeps it for manual checking", async ({ page }) => {
    await gotoFresh(page);
    await buildNestedDocument(page);

    await page.getByTestId("nd-export-menu-trigger").click();
    await page.getByTestId("nd-export-pptx").click();
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByTestId("nd-pptx-export").click(),
    ]);

    expect(download.suggestedFilename()).toMatch(/\.pptx$/);
    await download.saveAs(path.join(ARTIFACT_DIR, "nedito-slide-zoom.pptx"));

    // One slide per diagram, and both nested blocks reported as clickable.
    await expect(page.getByTestId("nd-notice")).toContainText("Exported 3 slides");
    await expect(page.getByTestId("nd-notice")).toContainText("2 nested blocks are clickable");
  });

  test("the plain-links variant exports too, for older PowerPoint", async ({ page }) => {
    await gotoFresh(page);
    await buildNestedDocument(page);

    await page.getByTestId("nd-export-menu-trigger").click();
    await page.getByTestId("nd-export-pptx").click();
    await page.getByTestId("nd-pptx-nav-link").click();
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByTestId("nd-pptx-export").click(),
    ]);

    await download.saveAs(path.join(ARTIFACT_DIR, "nedito-plain-links.pptx"));
    await expect(page.getByTestId("nd-notice")).toContainText("Exported 3 slides");
  });
});
