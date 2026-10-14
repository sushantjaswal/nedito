// Tidy up: the layout engine arrives on demand and places a level by its connections, in the
// running app rather than in the model's own tests. What matters here is what no unit test can
// show: that the engine actually loads in the browser under the site's content security policy,
// that one tidy-up is one undo, and that a nested document can be tidied all the way down from
// the level being viewed.
import { expect, test } from "@playwright/test";
import { getDoc, gotoWithStorage, runCommand } from "./helpers";

const meta = { title: "Tidy", created: "2026-10-14T00:00:00Z", modified: "2026-10-14T00:00:00Z", appVersion: "0.1.0" };
const shape = (id: string, x: number, y: number) => ({
  id,
  type: "shape",
  shapeRef: "general/rect",
  position: { x, y },
  size: { w: 120, h: 60 },
  z: 1,
  style: {},
  label: { text: id },
});
const line = (id: string, from: string, to: string) => ({
  id,
  source: { nodeId: from },
  target: { nodeId: to },
  style: {},
});

/** Three shapes in a chain, piled on top of each other, plus a Nested Block holding two more. */
const tangled = {
  format: "nedito",
  formatVersion: 6,
  meta,
  rootDiagramIds: ["main"],
  diagrams: {
    main: {
      id: "main",
      title: "Main",
      nodes: [
        shape("a", 400, 300),
        shape("b", 420, 320),
        shape("c", 440, 340),
        {
          id: "block",
          type: "nested",
          childDiagramId: "inside",
          position: { x: 460, y: 360 },
          size: { w: 200, h: 120 },
          z: 1,
          style: {},
          label: { text: "Block" },
          collapsed: { icons: [] },
          ports: [{ id: "p1", side: "right", offset: 0.5, innerNodeId: "x" }],
        },
      ],
      edges: [line("e1", "a", "b"), line("e2", "b", "c"), { ...line("e3", "c", "block"), target: { nodeId: "block", portId: "p1" } }],
    },
    // Inside: y -> x. The level above arrives at x through a port on the block's RIGHT side, so a
    // layout that reads the level above must turn this round and put x last.
    inside: {
      id: "inside",
      title: "Block",
      nodes: [shape("x", 100, 100), shape("y", 110, 110)],
      edges: [line("ie", "y", "x")],
    },
  },
};

const open = (page: import("@playwright/test").Page) =>
  gotoWithStorage(page, {
    "nedito:collapsedSections": "[]",
    "nedito:collapsedGroups": '["cloud"]',
    "nedito:demoDismissed": "true",
    "nedito:splashSeen": "1",
    "nedito:autosave": JSON.stringify(tangled),
  });

const boxes = async (page: import("@playwright/test").Page, diagramId: string) => {
  const doc = await getDoc(page);
  return Object.fromEntries(
    doc.diagrams[diagramId].nodes.map((n) => [
      n.id,
      { left: n.position.x, right: n.position.x + n.size.w, top: n.position.y, bottom: n.position.y + n.size.h },
    ]),
  );
};

/** How many shapes are selected — the store's own count, not a guess from the chrome. */
const selectedCount = (page: import("@playwright/test").Page) =>
  page.evaluate(() => (window.__ddStore!.getState() as unknown as { selection: { nodeIds: string[] } }).selection.nodeIds.length);

type Box = { left: number; right: number; top: number; bottom: number };
const overlaps = (a: Box, b: Box) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

test.describe("tidy up", () => {
  test("places a piled-up level along its connections, and undoes in one step", async ({ page }) => {
    await open(page);
    await expect.poll(async () => Object.keys(await boxes(page, "main")).length).toBe(4);
    const before = await boxes(page, "main");
    expect(overlaps(before.a, before.b)).toBe(true);

    await runCommand(page, "tidy-level", "tidy");
    // The engine is fetched on this first run, so give it longer than an ordinary assertion.
    await expect.poll(async () => overlaps((await boxes(page, "main")).a, (await boxes(page, "main")).b), { timeout: 20_000 }).toBe(false);

    const after = await boxes(page, "main");
    expect(after.a.right).toBeLessThanOrEqual(after.b.left);
    expect(after.b.right).toBeLessThanOrEqual(after.c.left);
    // The line into the block arrives at a port on its right side, so the block sits to the left
    // of the shape feeding it.
    expect(after.block.right).toBeLessThanOrEqual(after.c.left);
    for (const [first, second] of [
      ["a", "b"],
      ["b", "c"],
      ["c", "block"],
      ["a", "block"],
    ] as const) {
      expect(overlaps(after[first], after[second])).toBe(false);
    }

    await page.keyboard.press("Control+z");
    await expect.poll(async () => (await boxes(page, "main")).a).toEqual(before.a);
    expect((await boxes(page, "main")).c).toEqual(before.c);
  });

  test("runs down every level, from the one being viewed", async ({ page }) => {
    await open(page);
    await expect.poll(async () => Object.keys(await boxes(page, "inside")).length).toBe(2);
    const inside = await boxes(page, "inside");
    expect(overlaps(inside.x, inside.y)).toBe(true);

    await runCommand(page, "tidy-all-levels", "tidy");
    await expect
      .poll(async () => overlaps((await boxes(page, "inside")).x, (await boxes(page, "inside")).y), { timeout: 20_000 })
      .toBe(false);

    // y -> x on its own would put x last anyway; what is being checked is that it stays last
    // because the level above reaches it through a right-side port.
    const after = await boxes(page, "inside");
    expect(after.y.right).toBeLessThanOrEqual(after.x.left);
    // One document update, however many levels it touched: one undo puts all of it back.
    const mainAfter = await boxes(page, "main");
    await page.keyboard.press("Control+z");
    await expect.poll(async () => (await boxes(page, "inside")).x).toEqual(inside.x);
    expect((await boxes(page, "main")).a).not.toEqual(mainAfter.a);
  });

  test("remembers the direction that was chosen, for the next visit as well", async ({ page }) => {
    await open(page);
    await expect.poll(async () => Object.keys(await boxes(page, "main")).length).toBe(4);

    await runCommand(page, "tidy-level-down", "tidy");
    await expect
      .poll(async () => overlaps((await boxes(page, "main")).a, (await boxes(page, "main")).b), { timeout: 20_000 })
      .toBe(false);
    const down = await boxes(page, "main");
    expect(down.a.bottom).toBeLessThanOrEqual(down.b.top);

    // The plain command carries no direction of its own: it uses the one last chosen, here and
    // after a reload, because the choice is kept in this browser.
    await page.reload();
    await expect.poll(async () => Object.keys(await boxes(page, "main")).length).toBe(4);
    await runCommand(page, "tidy-level", "tidy");
    await expect
      .poll(
        async () => {
          const b = await boxes(page, "main");
          return b.a.bottom <= b.b.top;
        },
        { timeout: 20_000 },
      )
      .toBe(true);
  });

  test("tidies just the selection from the Arrange popover, leaving the rest alone", async ({ page }) => {
    await open(page);
    await expect.poll(async () => Object.keys(await boxes(page, "main")).length).toBe(4);
    const before = await boxes(page, "main");

    // Just the two shapes the layout should cover: click one, shift-click the other. These are
    // deliberately piled on top of each other, so each click lands on a corner the next shape
    // in the pile does not cover.
    await page.getByTestId("rf__node-a").click({ position: { x: 5, y: 5 } });
    // Selecting a shape raises it, so the second click aims at the sliver of b that neither the
    // now-raised a nor c covers: its top-right corner.
    await page.getByTestId("rf__node-b").click({ position: { x: 110, y: 10 }, modifiers: ["Shift"] });
    await expect.poll(() => selectedCount(page)).toBe(2);
    await page.getByTestId("nd-bar-arrange").click();
    await page.getByTestId("nd-tidy-right").click();

    await expect.poll(async () => overlaps((await boxes(page, "main")).a, (await boxes(page, "main")).b), { timeout: 20_000 }).toBe(false);
    expect((await boxes(page, "main")).block).toEqual(before.block);
  });
});
