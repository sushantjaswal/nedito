// Animated GIF export (G1, D131), in a real browser: from the Export menu, a looping GIF of the
// level as it moves — and a still one, said so, when nothing on it moves.
import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { gotoFresh } from "./helpers";

interface Store {
  addShapeNode: (r: string, p: { x: number; y: number }, z: { w: number; h: number }) => string;
  connect: (a: { sourceNodeId: string; sourceHandleId: string; targetNodeId: string; targetHandleId: string }) => string;
  setEdgeMotion: (ids: string[], m: { kind: string } | null) => void;
  clearSelection: () => void;
}

async function gif(page: Page, size?: "small" | "medium" | "large" | "xl", rate?: "smooth" | "light"): Promise<Buffer> {
  await page.getByTestId("nd-export-menu-trigger").click();
  await page.getByTestId("nd-export-gif").click();
  // The size choice (G3, D141) and the frame rate (G4, D142).
  await expect(page.getByTestId("nd-gif-dialog")).toBeVisible();
  if (size) await page.getByTestId(`nd-gif-size-${size}`).check();
  if (rate) await page.getByTestId(`nd-gif-rate-${rate}`).check();
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByTestId("nd-gif-export").click()]);
  expect(download.suggestedFilename()).toMatch(/\.gif$/);
  await expect(page.getByTestId("nd-gif-dialog")).toHaveCount(0);
  return readFileSync(await download.path());
}

/** A GIF's width and height, from its header. */
const dims = (bytes: Buffer) => ({ w: bytes.readUInt16LE(6), h: bytes.readUInt16LE(8) });

/** Image descriptors in a GIF: one per stored frame. */
const frameCount = (bytes: Buffer) => {
  let n = 0;
  for (let i = 0; i < bytes.length - 9; i++) if (bytes[i] === 0x21 && bytes[i + 1] === 0xf9 && bytes[i + 2] === 4) n++;
  return n;
};

test.beforeEach(async ({ page }) => gotoFresh(page));

test("a diagram that moves exports as a looping GIF from the Export menu", async ({ page }) => {
  await page.evaluate(() => {
    const s = window.__ddStore!.getState() as unknown as Store;
    const a = s.addShapeNode("general/rect", { x: 100, y: 200 }, { w: 150, h: 64 });
    const b = s.addShapeNode("general/rect", { x: 450, y: 200 }, { w: 150, h: 64 });
    s.setEdgeMotion([s.connect({ sourceNodeId: a, sourceHandleId: "right", targetNodeId: b, targetHandleId: "left" })], { kind: "flow" });
    s.clearSelection();
  });
  const bytes = await gif(page);
  expect(bytes.subarray(0, 6).toString("latin1")).toBe("GIF89a");
  expect(bytes.includes(Buffer.from("NETSCAPE2.0"))).toBe(true);
  expect(frameCount(bytes)).toBeGreaterThan(1);
  await expect(page.getByTestId("nd-notice")).toContainText("GIF saved");
});

test("a still diagram makes a one-frame GIF, and the notice says how to make it move", async ({ page }) => {
  await page.evaluate(() => (window.__ddStore!.getState() as unknown as Store).addShapeNode("general/rect", { x: 100, y: 200 }, { w: 150, h: 64 }));
  const bytes = await gif(page);
  expect(bytes.subarray(0, 6).toString("latin1")).toBe("GIF89a");
  expect(frameCount(bytes)).toBe(1);
  await expect(page.getByTestId("nd-notice")).toContainText("Add motion");
});

test("the size is chosen in a dialog, each option showing its pixels, and remembered (G3, D141)", async ({ page }) => {
  await page.evaluate(() => {
    const s = window.__ddStore!.getState() as unknown as Store;
    const a = s.addShapeNode("general/rect", { x: 0, y: 0 }, { w: 150, h: 64 });
    const b = s.addShapeNode("general/rect", { x: 1400, y: 300 }, { w: 150, h: 64 });
    s.setEdgeMotion([s.connect({ sourceNodeId: a, sourceHandleId: "right", targetNodeId: b, targetHandleId: "left" })], { kind: "flow" });
    s.clearSelection();
  });
  const small = await gif(page, "small");
  expect(Math.max(dims(small).w, dims(small).h)).toBe(600);

  // Esc closes the choice without making anything.
  await page.getByTestId("nd-export-menu-trigger").click();
  await page.getByTestId("nd-export-gif").click();
  await expect(page.getByTestId("nd-gif-size-small")).toBeChecked();
  await expect(page.getByTestId("nd-gif-dialog")).toContainText("600 ×");
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("nd-gif-dialog")).toHaveCount(0);

  const large = await gif(page, "large");
  expect(Math.max(dims(large).w, dims(large).h)).toBe(1200);
  expect(large.length).toBeGreaterThan(small.length);
  // Extra large (D143): twice Large, for sharp text on high-resolution screens and slides.
  const xl = await gif(page, "xl", "light");
  expect(Math.max(dims(xl).w, dims(xl).h)).toBe(2400);
});

/** Each stored frame's time, in hundredths of a second, from its graphic control block. */
const delays = (bytes: Buffer) => {
  const out: number[] = [];
  for (let i = 0; i < bytes.length - 9; i++) if (bytes[i] === 0x21 && bytes[i + 1] === 0xf9 && bytes[i + 2] === 4) out.push(bytes.readUInt16LE(i + 4));
  return out;
};

test("the frame rate is chosen beside the size: Lighter is half the frames, a smaller file (G4, D142)", async ({ page }) => {
  await page.evaluate(() => {
    const s = window.__ddStore!.getState() as unknown as Store;
    const a = s.addShapeNode("general/rect", { x: 0, y: 0 }, { w: 150, h: 64 });
    const b = s.addShapeNode("general/rect", { x: 700, y: 200 }, { w: 150, h: 64 });
    s.setEdgeMotion([s.connect({ sourceNodeId: a, sourceHandleId: "right", targetNodeId: b, targetHandleId: "left" })], { kind: "flow" });
    s.clearSelection();
  });
  const smooth = await gif(page, "medium", "smooth");
  expect(Math.min(...delays(smooth))).toBe(4);
  const light = await gif(page, "medium", "light");
  expect(Math.min(...delays(light))).toBe(8);
  expect(light.length).toBeLessThan(smooth.length);
  // Remembered for next time.
  await page.getByTestId("nd-export-menu-trigger").click();
  await page.getByTestId("nd-export-gif").click();
  await expect(page.getByTestId("nd-gif-rate-light")).toBeChecked();
  await page.keyboard.press("Escape");
});
