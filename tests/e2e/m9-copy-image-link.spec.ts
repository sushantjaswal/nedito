import { expect, test } from "@playwright/test";
import { gotoFresh } from "./helpers";

// Copy image with live link. The clipboard payload's shape is unit-tested in
// src/share/copyImageLink.test.ts; what only a real browser proves is that the menu item
// actually reaches the system clipboard with both flavours intact, and that the link it
// embeds opens the diagram at the other end.
test.use({ permissions: ["clipboard-read", "clipboard-write"] });

// The first copy in a fresh page loads the export fonts and rasterises the diagram: 2-3s on an
// idle machine, past Playwright's 5s default under load (found flaky 2026-10-05). The notice is
// what says it finished, so it gets a realistic wait.
const COPIED = { timeout: 15_000 };

async function drawSomething(page: import("@playwright/test").Page) {
  await page.evaluate(() => {
    const s = window.__ddStore!.getState() as unknown as {
      addShapeNode: (r: string, p: { x: number; y: number }, z: { w: number; h: number }) => string;
      setNodeLabel: (id: string, label: { text: string }) => void;
    };
    const id = s.addShapeNode("general/rounded-rect", { x: 80, y: 80 }, { w: 160, h: 60 });
    s.setNodeLabel(id, { text: "API Gateway" });
  });
}

async function copyImageLink(page: import("@playwright/test").Page) {
  await page.getByTestId("nd-export-menu-trigger").click();
  await page.getByTestId("nd-copy-image-link").click();
}

test.describe("copy image with live link", () => {
  test("puts a PNG and a hyperlinked HTML image on the clipboard in one write", async ({ page }) => {
    await gotoFresh(page);
    await drawSomething(page);
    await copyImageLink(page);

    await expect(page.getByTestId("nd-notice")).toContainText("Image copied with a live link", COPIED);

    const flavours = await page.evaluate(async () => {
      const items = await navigator.clipboard.read();
      const types = items.flatMap((i) => i.types);
      const htmlItem = items.find((i) => i.types.includes("text/html"))!;
      const html = await (await htmlItem.getType("text/html")).text();
      return { types, html };
    });

    // Both flavours, from a single ClipboardItem: Word/PowerPoint/Outlook take the HTML and
    // paste a clickable image; everything else takes the PNG.
    expect(flavours.types).toContain("image/png");
    expect(flavours.types).toContain("text/html");
    expect(flavours.html).toMatch(/^<a href="[^"]+"><img src="data:image\/png;base64,/);
    // The share link's own ampersand must survive HTML parsing at the far end.
    expect(flavours.html).toContain("&amp;v=");
  });

  test("the link it embeds really opens the diagram, read-only", async ({ page }) => {
    await gotoFresh(page);
    await drawSomething(page);
    await copyImageLink(page);

    const href = await page.evaluate(async () => {
      const items = await navigator.clipboard.read();
      const htmlItem = items.find((i) => i.types.includes("text/html"))!;
      const html = await (await htmlItem.getType("text/html")).text();
      return html.match(/href="([^"]+)"/)![1].replace(/&amp;/g, "&");
    });

    // A hash-only goto is a same-document change, so the app would never re-read the
    // fragment. Clearing the page first makes this the fresh navigation that clicking the
    // pasted link in Word or Outlook actually performs.
    await page.goto("about:blank");
    await page.goto(href);
    await expect(page.getByTestId("nd-viewer-readonly")).toBeVisible();
    await expect(page.getByTestId("nd-canvas").getByText("API Gateway")).toBeVisible();
  });

  test("the success notice goes away on its own", async ({ page }) => {
    await gotoFresh(page);
    await drawSomething(page);
    await copyImageLink(page);

    await expect(page.getByTestId("nd-notice")).toBeVisible(COPIED);
    // No link and no button on the success notice, so nothing is lost by it expiring.
    await expect(page.getByTestId("nd-notice")).toHaveCount(0, { timeout: 10_000 });
  });
});
