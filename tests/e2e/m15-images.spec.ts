// Inserting your own image, end to end in a real browser: every way in,
// save and reopen, undo across a delete, and the picture actually appearing in exports.
//
// The unit tests cover every decision; what needs a real browser is the file chooser, a real
// drop, a real paste from the system clipboard, image decoding, and rasterised exports.
import { deflateSync } from "node:zlib";
import { expect, test, type Page } from "@playwright/test";
import { gotoFresh, openPalette } from "./helpers";

// ------------------------------------------------------------------------------ fixtures

function crc32(bytes: Buffer): number {
  let c = 0xffffffff;
  for (const b of bytes) {
    c ^= b;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

/** A real, solid-magenta RGB PNG — trivial to find again in any rasterised export. */
function magentaPng(width: number, height: number): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type: RGB
  const row = Buffer.concat([Buffer.from([0]), Buffer.alloc(width * 3, Buffer.from([0xff, 0x00, 0xff]))]);
  const raw = Buffer.concat(Array.from({ length: height }, () => row));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const LOGO = magentaPng(120, 60);

// ------------------------------------------------------------------------------ helpers

type Img = { id: string; imageId?: string; position: { x: number; y: number }; size: { w: number; h: number } };

async function images(page: Page): Promise<Img[]> {
  return page.evaluate(() => {
    const s = window.__ddStore!.getState();
    return s.doc.diagrams[s.currentDiagramId()].nodes.filter((n) => n.type === "shape" && n.shapeRef === "image") as never;
  });
}

async function insertViaMenu(page: Page) {
  await openPalette(page, "insert image");
  const [chooser] = await Promise.all([page.waitForEvent("filechooser"), page.getByTestId("nd-command-insert-image").click()]);
  await chooser.setFiles({ name: "logo.png", mimeType: "image/png", buffer: LOGO });
  await expect.poll(async () => (await images(page)).length).toBe(1);
}

/** How many magenta pixels an image has, decoded in the page by the browser itself. */
async function magentaPixels(page: Page, bytes: Buffer): Promise<number> {
  return page.evaluate(async (b64) => {
    const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const bmp = await createImageBitmap(new Blob([bin]));
    const c = document.createElement("canvas");
    c.width = bmp.width;
    c.height = bmp.height;
    const ctx = c.getContext("2d")!;
    ctx.drawImage(bmp, 0, 0);
    const px = ctx.getImageData(0, 0, c.width, c.height).data;
    let n = 0;
    for (let i = 0; i < px.length; i += 4) if (px[i] > 230 && px[i + 1] < 40 && px[i + 2] > 230) n++;
    return n;
  }, bytes.toString("base64"));
}

async function downloadBytes(download: import("@playwright/test").Download): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const c of await download.createReadStream()) chunks.push(c as Buffer);
  return Buffer.concat(chunks);
}

/** A stored (uncompressed) entry from a ZIP — how the PowerPoint export writes its PNGs. */
function storedEntry(zip: Buffer, name: string): Buffer | null {
  let at = 0;
  while (at + 30 <= zip.length && zip.readUInt32LE(at) === 0x04034b50) {
    const size = zip.readUInt32LE(at + 18);
    const nameLen = zip.readUInt16LE(at + 26);
    const extra = zip.readUInt16LE(at + 28);
    const entry = zip.subarray(at + 30, at + 30 + nameLen).toString("utf8");
    const start = at + 30 + nameLen + extra;
    if (entry === name) return zip.subarray(start, start + size);
    at = start + size;
  }
  return null;
}

// ------------------------------------------------------------------------------ tests

test.describe("Inserting your own image", () => {
  test.beforeEach(async ({ page }) => gotoFresh(page));

  test("Arrange ▸ Insert image… places the picture, and it survives save and reopen", async ({ page }) => {
    await insertViaMenu(page);
    const [img] = await images(page);
    // 120×60 is under the default placed size, so it keeps its own pixels.
    expect(img.size).toEqual({ w: 120, h: 60 });
    await expect(page.locator(`[data-testid="nd-shape-node-${img.id}"] img[src^="data:image/png"]`)).toBeVisible();
    // The picture's name and size, in the context bar's Image popover (once the Style tab, R1).
    await page.getByTestId("nd-bar-image").click();
    await expect(page.getByTestId("nd-image-info")).toHaveText("logo.png · 120×60");

    await page.getByTestId("nd-app-menu-trigger").click();
    const [download] = await Promise.all([page.waitForEvent("download"), page.getByTestId("nd-app-save").click()]);
    const text = (await downloadBytes(download)).toString("utf8");
    const file = JSON.parse(text);
    // v5: new work is drawn in Nedito's own look (R6, D95), which only a v5 reader knows;
    // pictures alone would be v3, as model/assets.test.ts checks for a classic document.
    expect(file.formatVersion).toBe(5);
    expect(Object.keys(file.assets)).toHaveLength(1);

    // Reopen the saved file in a fresh app and find the same picture.
    await gotoFresh(page);
    await page.evaluate(
      async ({ t, mod }) => {
        const { decodeDoc } = (await import(/* @vite-ignore */ mod)) as {
          decodeDoc: (s: string) => { ok: true; doc: unknown } | { ok: false; error: string };
        };
        const r = decodeDoc(t);
        if (!r.ok) throw new Error(r.error);
        (window.__ddStore!.getState() as unknown as { loadDoc: (d: unknown) => void }).loadDoc(r.doc);
      },
      { t: text, mod: "/src/file/documentFormat.ts" },
    );
    const [reopened] = await images(page);
    await expect(page.locator(`[data-testid="nd-shape-node-${reopened.id}"] img[src^="data:image/png"]`)).toBeVisible();
  });

  test("dropping an image file places it where it was dropped", async ({ page }) => {
    const pane = (await page.locator(".react-flow").boundingBox())!;
    const at = { x: pane.x + pane.width * 0.6, y: pane.y + pane.height * 0.5 };
    await page.evaluate(
      ({ b64, at }) => {
        const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
        const dt = new DataTransfer();
        dt.items.add(new File([bytes], "photo.png", { type: "image/png" }));
        const target = document.elementFromPoint(at.x, at.y)!;
        target.dispatchEvent(new DragEvent("dragover", { bubbles: true, cancelable: true, dataTransfer: dt, clientX: at.x, clientY: at.y }));
        target.dispatchEvent(new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer: dt, clientX: at.x, clientY: at.y }));
      },
      { b64: LOGO.toString("base64"), at },
    );
    await expect.poll(async () => (await images(page)).length).toBe(1);
    const [img] = await images(page);
    const dropped = await page.evaluate(({ x, y }) => {
      const vp = document.querySelector<HTMLElement>(".react-flow__viewport")!.style.transform;
      const [tx, ty, z] = (vp.match(/-?[\d.]+/g) ?? []).map(Number);
      const r = document.querySelector(".react-flow")!.getBoundingClientRect();
      return { x: (x - r.left - tx) / z, y: (y - r.top - ty) / z };
    }, at);
    expect(Math.abs(img.position.x + img.size.w / 2 - dropped.x)).toBeLessThan(12);
    expect(Math.abs(img.position.y + img.size.h / 2 - dropped.y)).toBeLessThan(12);
  });

  test("Ctrl+V places an image copied in another app", async ({ page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.locator(".react-flow__pane").click({ position: { x: 40, y: 40 } });
    await page.evaluate(async (b64) => {
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      await navigator.clipboard.write([new ClipboardItem({ "image/png": new Blob([bytes], { type: "image/png" }) })]);
    }, LOGO.toString("base64"));
    await page.keyboard.press("ControlOrMeta+V");
    await expect.poll(async () => (await images(page)).length).toBe(1);
  });

  // D82: the menus read the system clipboard too, not only Ctrl+V.
  test("Edit ▸ Paste places an image copied in another app", async ({ page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.locator(".react-flow__pane").click({ position: { x: 40, y: 40 } });
    await page.evaluate(async (b64) => {
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      await navigator.clipboard.write([new ClipboardItem({ "image/png": new Blob([bytes], { type: "image/png" }) })]);
    }, LOGO.toString("base64"));
    await openPalette(page, "paste");
    await page.getByTestId("nd-command-paste").click();
    await expect.poll(async () => (await images(page)).length).toBe(1);
  });

  test("deleting a picture and undoing brings it back, picture and all", async ({ page }) => {
    await insertViaMenu(page);
    const [img] = await images(page);
    await page.keyboard.press("Delete");
    await expect.poll(async () => (await images(page)).length).toBe(0);
    await page.keyboard.press("ControlOrMeta+Z");
    await expect.poll(async () => (await images(page)).length).toBe(1);
    await expect(page.locator(`[data-testid="nd-shape-node-${img.id}"] img[src^="data:image/png"]`)).toBeVisible();
  });

  test("exports draw the picture: PNG and PowerPoint", async ({ page }) => {
    await insertViaMenu(page);

    await page.getByTestId("nd-export-menu-trigger").click();
    const [png] = await Promise.all([page.waitForEvent("download"), page.getByTestId("nd-export-png").click()]);
    // Exported at 2×, so the 120×60 picture covers about four times its own pixels.
    expect(await magentaPixels(page, await downloadBytes(png))).toBeGreaterThan(120 * 60 * 3);

    await page.getByTestId("nd-export-menu-trigger").click();
    await page.getByTestId("nd-export-pptx").click();
    const [pptx] = await Promise.all([page.waitForEvent("download"), page.getByTestId("nd-pptx-export").click()]);
    const slidePicture = storedEntry(await downloadBytes(pptx), "ppt/media/image1.png");
    expect(slidePicture).not.toBeNull();
    expect(await magentaPixels(page, slidePicture!)).toBeGreaterThan(120 * 60);
  });
});
