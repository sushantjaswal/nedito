// R3: the ＋ handles that replaced the four hover arrows. Clicking one
// adds a connected copy, ready to name; dragging one connects exactly as the arrows did.
import { expect, test, type Page } from "@playwright/test";
import { getDoc, gotoFresh } from "./helpers";
import { gotoShareLink, sharedDoc, shareUrlFor } from "./shareLink";

interface Store {
  addShapeNode: (ref: string, pos: { x: number; y: number }, size: { w: number; h: number }) => string;
  addNestedNode: (pos: { x: number; y: number }, size: { w: number; h: number }) => { nestedNodeId: string };
  setNodeLabel: (id: string, label: { text: string }) => void;
  setSelection: (nodeIds: string[], edgeIds?: string[]) => void;
}

async function add(page: Page, x: number, y: number, label?: string): Promise<string> {
  return page.evaluate(
    ({ x, y, label }) => {
      const s = window.__ddStore!.getState() as unknown as Store;
      const id = s.addShapeNode("general/rounded-rect", { x, y }, { w: 160, h: 80 });
      if (label) s.setNodeLabel(id, { text: label });
      s.setSelection([], []);
      return id;
    },
    { x, y, label },
  );
}

async function page1(page: Page) {
  const doc = await getDoc(page);
  return doc.diagrams[doc.rootDiagramIds[0]];
}

async function fit(page: Page) {
  await page.evaluate(() => window.__rf?.fitView?.({ padding: 0.6 }));
  await page.waitForTimeout(150);
}

test.describe("＋ handles (R3)", () => {
  test.beforeEach(async ({ page }) => {
    await gotoFresh(page);
    await page.locator(".react-flow__pane").waitFor();
    await page.waitForTimeout(150);
  });

  test("hovering a shape shows a ＋ outside the middle of each side, and none of the old arrow dots", async ({ page }) => {
    const id = await add(page, 200, 200, "Order placed");
    await fit(page);
    const node = page.locator(`.react-flow__node[data-id="${id}"]`);
    await node.hover();
    const box = (await node.boundingBox())!;
    for (const side of ["top", "right", "bottom", "left"] as const) {
      const plus = node.getByTestId(`nd-plus-${side}`);
      await expect(plus).toBeVisible();
      const p = (await plus.boundingBox())!;
      const c = { x: p.x + p.width / 2, y: p.y + p.height / 2 };
      // Outside the shape, and centred on its side.
      if (side === "right") expect(c.x).toBeGreaterThan(box.x + box.width);
      if (side === "left") expect(c.x).toBeLessThan(box.x);
      if (side === "top") expect(c.y).toBeLessThan(box.y);
      if (side === "bottom") expect(c.y).toBeGreaterThan(box.y + box.height);
      if (side === "right" || side === "left") expect(Math.abs(c.y - (box.y + box.height / 2))).toBeLessThan(2);
      else expect(Math.abs(c.x - (box.x + box.width / 2))).toBeLessThan(2);
    }
    // The side handle itself is no longer drawn: only its ＋ shows.
    await expect(node.locator('.react-flow__handle[data-handleid="right"]')).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  });

  test("clicking ＋ adds a connected copy on that side, selected and ready to name, as one undo step", async ({ page }) => {
    const id = await add(page, 192, 208, "Order placed");
    await fit(page);
    const node = page.locator(`.react-flow__node[data-id="${id}"]`);
    await node.hover();
    await node.getByTestId("nd-plus-right").click();

    let diagram = await page1(page);
    expect(diagram.nodes).toHaveLength(2);
    const copy = diagram.nodes.find((n) => n.id !== id)!;
    expect(copy.type === "shape" && copy.shapeRef).toBe("general/rounded-rect");
    expect(copy.size).toEqual({ w: 160, h: 80 });
    expect(copy.position.y).toBe(208);
    expect(copy.position.x).toBeGreaterThan(192 + 160);
    expect(diagram.edges).toHaveLength(1);
    expect(diagram.edges[0].source.nodeId).toBe(id);
    expect(diagram.edges[0].target.nodeId).toBe(copy.id);
    expect(diagram.edges[0].style).toMatchObject({ edgeStyle: "curved", sourceHandle: "right", targetHandle: "left" });

    // It was placed off screen, so the canvas brought it into view.
    await expect(page.locator(`.react-flow__node[data-id="${copy.id}"]`)).toBeInViewport();

    // Its label is open for typing straight away.
    await page.keyboard.type("Payment taken");
    await page.keyboard.press("Enter");
    diagram = await page1(page);
    expect(diagram.nodes.find((n) => n.id === copy.id)!.label?.text).toBe("Payment taken");

    // Undo takes back the name, then the copy and its edge together.
    await page.keyboard.press("ControlOrMeta+z");
    await page.keyboard.press("ControlOrMeta+z");
    await expect.poll(async () => ((await page1(page)).nodes.length)).toBe(1);
    expect((await page1(page)).edges).toHaveLength(0);
  });

  test("dragging from ＋ connects to an existing shape, as the arrows did", async ({ page }) => {
    const a = await add(page, 100, 200, "A");
    const b = await add(page, 500, 200, "B");
    await fit(page);
    const nodeA = page.locator(`.react-flow__node[data-id="${a}"]`);
    await nodeA.hover();
    const plus = (await nodeA.getByTestId("nd-plus-right").boundingBox())!;
    const target = (await page.locator(`.react-flow__node[data-id="${b}"]`).boundingBox())!;
    await page.mouse.move(plus.x + plus.width / 2, plus.y + plus.height / 2);
    await page.mouse.down();
    await page.mouse.move(target.x + 20, target.y + target.height / 2, { steps: 8 });
    await page.mouse.move(target.x + 30, target.y + target.height / 2, { steps: 4 });
    await page.mouse.up();

    const diagram = await page1(page);
    expect(diagram.nodes).toHaveLength(2);
    expect(diagram.edges).toHaveLength(1);
    expect(diagram.edges[0].source.nodeId).toBe(a);
    expect(diagram.edges[0].target.nodeId).toBe(b);
  });

  test("the ＋ stays one size on screen whatever the zoom", async ({ page }) => {
    const id = await add(page, 200, 200);
    const node = page.locator(`.react-flow__node[data-id="${id}"]`);
    const glyphSize = async (zoom: number) => {
      await page.evaluate((z) => {
        const rf = window.__rf as unknown as { setViewport: (v: { x: number; y: number; zoom: number }) => void };
        rf.setViewport({ x: 100, y: 50, zoom: z });
      }, zoom);
      await page.waitForTimeout(100);
      await node.hover();
      return (await node.getByTestId("nd-plus-right").boundingBox())!.height;
    };
    const small = await glyphSize(0.5);
    const large = await glyphSize(2);
    expect(Math.abs(small - large)).toBeLessThan(1);
  });

  test("clicking ＋ on a Nested Block adds a new, empty Nested Block, connected through ports", async ({ page }) => {
    const nested = await page.evaluate(() => {
      const s = window.__ddStore!.getState() as unknown as Store;
      const { nestedNodeId } = s.addNestedNode({ x: 200, y: 200 }, { w: 200, h: 140 });
      s.setSelection([], []);
      return nestedNodeId;
    });
    await fit(page);
    const node = page.locator(`.react-flow__node[data-id="${nested}"]`);
    await node.hover();
    await node.getByTestId("nd-plus-bottom").click();
    await page.keyboard.press("Escape");

    const diagram = await page1(page);
    const copy = diagram.nodes.find((n) => n.id !== nested)!;
    expect(copy.type).toBe("nested");
    expect(diagram.edges).toHaveLength(1);
    expect(diagram.edges[0].source.portId).toBeDefined();
    expect(diagram.edges[0].target.portId).toBeDefined();
  });

  test("Alt+Shift+Arrow does the same from the keyboard", async ({ page }) => {
    const id = await add(page, 200, 200, "Start");
    await page.evaluate((nodeId) => (window.__ddStore!.getState() as unknown as Store).setSelection([nodeId]), id);
    await page.keyboard.press("Alt+Shift+ArrowDown");
    const diagram = await page1(page);
    expect(diagram.nodes).toHaveLength(2);
    expect(diagram.edges[0].style).toMatchObject({ sourceHandle: "bottom", targetHandle: "top" });
  });
});

test("a shared link's read-only viewer shows no ＋", async ({ page }) => {
  await gotoShareLink(page, await shareUrlFor(sharedDoc()));
  const node = page.locator(".react-flow__node-shape").first();
  await node.hover();
  await expect(node.getByTestId("nd-plus-right")).toBeHidden();
});
