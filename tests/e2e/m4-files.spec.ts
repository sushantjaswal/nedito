import { expect, test } from "@playwright/test";
import { currentDiagramId, getDoc, gotoFresh } from "./helpers";
import { decodeDoc } from "../../src/file/documentFormat";

// M4 exit test (CLAUDE_HISTORY.md): multi-page doc with nesting saves to `.nedito`, survives
// reload byte-identical (round-trip test), exports clean PNG and SVG, autosave restore works.
test.describe("M4 — document & files", () => {
  test.beforeEach(async ({ page }) => {
    await gotoFresh(page);
  });

  test("Save a copy downloads a .nedito file that decodes back to the current doc", async ({ page }) => {
    await page.getByTestId("nd-stencil-general/rect").click();
    await page.evaluate(() => window.__ddStore!.getState());
    const secondPageId: string = await page.evaluate(() => {
      const s = window.__ddStore!.getState() as unknown as { addPage: (title?: string) => string };
      return s.addPage("Page 2");
    });
    await page.evaluate(() => {
      const s = window.__ddStore!.getState() as unknown as {
        addShapeNode: (ref: string, pos: { x: number; y: number }, size: { w: number; h: number }) => string;
      };
      s.addShapeNode("general/ellipse", { x: 50, y: 50 }, { w: 80, h: 80 });
    });
    const doc = await getDoc(page);
    expect(doc.rootDiagramIds).toContain(secondPageId);

    await page.getByTestId("nd-app-menu-trigger").click();
    const [download] = await Promise.all([page.waitForEvent("download"), page.getByTestId("nd-app-save").click()]);

    expect(download.suggestedFilename()).toMatch(/\.nedito$/);
    const stream = await download.createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(chunk as Buffer);
    const text = Buffer.concat(chunks).toString("utf-8");

    const result = decodeDoc(text);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.doc).toEqual(doc);
  });

  test("Export ▾ › SVG downloads a well-formed SVG", async ({ page }) => {
    await page.getByTestId("nd-stencil-general/rect").click();

    await page.getByTestId("nd-export-menu-trigger").click();
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByTestId("nd-export-svg").click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/\.svg$/);
    const stream = await download.createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(chunk as Buffer);
    const text = Buffer.concat(chunks).toString("utf-8");
    expect(text.startsWith("<svg")).toBe(true);
    expect(text).toContain("<rect");
  });

  test("Export ▾ › PNG downloads a non-empty PNG", async ({ page }) => {
    await page.getByTestId("nd-stencil-general/ellipse").click();

    await page.getByTestId("nd-export-menu-trigger").click();
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByTestId("nd-export-png").click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/\.png$/);
    const stream = await download.createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(chunk as Buffer);
    const bytes = Buffer.concat(chunks);
    expect(bytes.length).toBeGreaterThan(0);
    // PNG file signature.
    expect(bytes.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
  });

  test("Export ▾ › .nedito.png round-trips through Open", async ({ page }) => {
    await page.getByTestId("nd-stencil-general/rect").click();
    const doc = await getDoc(page);

    await page.getByTestId("nd-export-menu-trigger").click();
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByTestId("nd-export-editable-png").click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/\.nedito\.png$/);
    const stream = await download.createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(chunk as Buffer);
    const bytes = Buffer.concat(chunks);
    expect(bytes.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a"); // PNG signature — still a real, openable image

    // Start a fresh document, then re-open the exported PNG — the embedded document should
    // bring back the exact original doc, not just a picture of it. Built from the downloaded
    // bytes directly (not download.path()) since Playwright's saved temp file doesn't
    // necessarily keep the .png extension the app's Open handler branches on by filename.
    await page.getByTestId("nd-app-menu-trigger").click();
    page.once("dialog", (dialog) => dialog.accept());
    await page.getByTestId("nd-app-new").click();
    const blank = await getDoc(page);
    expect(blank.diagrams[Object.keys(blank.diagrams)[0]].nodes).toHaveLength(0);

    await page.setInputFiles('[data-testid="nd-file-open-input"]', {
      name: "reopened.nedito.png",
      mimeType: "image/png",
      buffer: bytes,
    });
    await expect.poll(async () => (await getDoc(page)).rootDiagramIds).toEqual(doc.rootDiagramIds);
    const reopened = await getDoc(page);
    expect(reopened).toEqual(doc);
  });

  // Since R5 (D94) the work comes back by itself, with a note, rather than behind a prompt.
  test("autosave persists across reload and the doc comes back by itself", async ({ page }) => {
    await page.getByTestId("nd-stencil-general/rect").click();
    const diagramId = await currentDiagramId(page);
    const before = await getDoc(page);
    expect(before.diagrams[diagramId].nodes).toHaveLength(1);

    // useAutosave debounces at 800ms.
    await page.waitForTimeout(1000);
    await page.reload();

    await expect(page.getByTestId("nd-restored-note")).toContainText("Restored your last diagram");

    const after = await getDoc(page);
    expect(after.diagrams[diagramId].nodes).toHaveLength(1);
    expect(after.diagrams[diagramId].nodes[0].id).toBe(before.diagrams[diagramId].nodes[0].id);
  });

  test("Export ▾ › PDF downloads a structurally valid PDF at the diagram page size", async ({ page }) => {
    await page.evaluate(() => {
      const s = window.__ddStore!.getState() as unknown as {
        addShapeNode: (r: string, p: { x: number; y: number }, z: { w: number; h: number }) => string;
        setDiagramPageSize: (size: { w: number; h: number } | undefined) => void;
      };
      s.addShapeNode("general/rect", { x: 40, y: 40 }, { w: 160, h: 80 });
      s.setDiagramPageSize({ w: 794, h: 1123 }); // A4 portrait
    });

    const [download] = await Promise.all([
      page.waitForEvent("download"),
      (async () => {
        await page.getByTestId("nd-export-menu-trigger").click();
        await page.getByTestId("nd-export-pdf").click();
      })(),
    ]);
    expect(download.suggestedFilename()).toMatch(/.pdf$/);

    const path = await download.path();
    const bytes = await import("node:fs/promises").then((fs) => fs.readFile(path!));
    const text = bytes.toString("latin1");
    expect(text.startsWith("%PDF-")).toBe(true);
    expect(text.trimEnd().endsWith("%%EOF")).toBe(true);
    // A4 at 72dpi is 595.5 x 842.25pt — proof the page size actually drove the output.
    expect(text).toContain("/MediaBox [0 0 595.50 842.25]");
    // And the xref offset must land on the table, or the file will not open.
    const startxref = Number(text.slice(text.lastIndexOf("startxref") + 9).trim().split(/\s/)[0]);
    expect(text.slice(startxref, startxref + 4)).toBe("xref");
  });
});
