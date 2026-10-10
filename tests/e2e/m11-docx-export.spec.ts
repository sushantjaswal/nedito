import { mkdirSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { gotoFresh } from "./helpers";

// The Word export. The XML shapes are unit-tested in
// src/export/docx/; what needs a browser is the render, the download, and the round trip back
// in through Open.
//
// The exported document is kept in test-results/ so the acceptance criteria that need Word
// itself — links resolving in Word desktop and Word Online, and surviving Save as PDF — can be
// checked by a person who has it.
const ARTIFACT_DIR = path.join("test-results", "docx");

async function buildNestedDocument(page: import("@playwright/test").Page) {
  await page.evaluate(() => {
    type Store = {
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
    const at = () => window.__ddStore!.getState() as unknown as Store;

    const gw = at().addShapeNode("general/rounded-rect", { x: 60, y: 80 }, { w: 180, h: 70 });
    at().setNodeLabel(gw, { text: "API Gateway" });
    const pay = at().addNestedNode({ x: 340, y: 60 }, { w: 240, h: 150 }, "Payment Service");

    at().navigateInto(pay.nestedNodeId);
    const ledger = at().addShapeNode("general/cylinder", { x: 60, y: 60 }, { w: 140, h: 80 });
    at().setNodeLabel(ledger, { text: "Ledger DB" });
    const fraud = at().addNestedNode({ x: 280, y: 50 }, { w: 200, h: 130 }, "Fraud Engine");

    at().navigateInto(fraud.nestedNodeId);
    const rules = at().addShapeNode("general/rect", { x: 50, y: 50 }, { w: 140, h: 60 });
    at().setNodeLabel(rules, { text: "Rules" });
    at().navigateToLevel(0);
  });
}

test.describe("Word export", () => {
  test.beforeAll(() => {
    mkdirSync(ARTIFACT_DIR, { recursive: true });
  });

  test("exports a figure per diagram and keeps the file for manual checking", async ({ page }) => {
    await gotoFresh(page);
    await buildNestedDocument(page);

    await page.getByTestId("nd-export-menu-trigger").click();
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByTestId("nd-export-docx").click(),
    ]);

    expect(download.suggestedFilename()).toMatch(/\.docx$/);
    await download.saveAs(path.join(ARTIFACT_DIR, "nedito-appendix.docx"));

    await expect(page.getByTestId("nd-notice")).toContainText("Exported 3 figures");
    await expect(page.getByTestId("nd-notice")).toContainText("opened here again");
  });

  // The spec's round-trip requirement: exporting to Word must not be a one-way trip.
  test("the exported Word file opens again as the original diagram", async ({ page }) => {
    await gotoFresh(page);
    await buildNestedDocument(page);

    const before = await page.evaluate(() => {
      const s = window.__ddStore!.getState();
      return { diagrams: Object.keys(s.doc.diagrams).length, title: s.doc.meta.title };
    });

    await page.getByTestId("nd-export-menu-trigger").click();
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByTestId("nd-export-docx").click(),
    ]);
    const saved = path.join(ARTIFACT_DIR, "roundtrip.docx");
    await download.saveAs(saved);

    // A clean session, then open the .docx the way any other file is opened.
    await gotoFresh(page);
    await expect
      .poll(async () => page.evaluate(() => Object.keys(window.__ddStore!.getState().doc.diagrams).length))
      .toBe(1);

    await page.getByTestId("nd-file-open-input").setInputFiles(saved);

    await expect
      .poll(async () => page.evaluate(() => Object.keys(window.__ddStore!.getState().doc.diagrams).length))
      .toBe(before.diagrams);
    const title = await page.evaluate(() => window.__ddStore!.getState().doc.meta.title);
    expect(title).toBe(before.title);
  });

  test("an ordinary Word file says so instead of loading an empty diagram", async ({ page }) => {
    await gotoFresh(page);

    const messages: string[] = [];
    page.on("dialog", (d) => {
      messages.push(d.message());
      return d.dismiss();
    });

    await page.getByTestId("nd-file-open-input").setInputFiles({
      name: "report.docx",
      mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      buffer: Buffer.from("PK\u0003\u0004 not really a docx", "utf-8"),
    });

    await expect.poll(() => messages.join(" ")).toMatch(/Word file/);
    const nodes = await page.evaluate(() => {
      const s = window.__ddStore!.getState();
      return s.doc.diagrams[s.currentDiagramId()].nodes.length;
    });
    expect(nodes).toBe(0);
  });
});
