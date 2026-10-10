import { expect, test } from "@playwright/test";
import { currentDiagramId, getDoc, gotoFresh } from "./helpers";

// M2 exit test (CLAUDE_HISTORY.md): edge styles/arrowheads, waypoint dragging reroutes an
// orthogonal edge, label editing, z-order, undo/redo across edge operations.
//
// Edge SETUP goes through the store's connect() action directly (window.__ddStore) rather
// than driving the hover-to-reveal-handle-then-drag gesture — that exact interaction was
// flagged as fragile under synthetic/automated pointer events during M2 development
// (see CLAUDE_HISTORY.md). The interactions this spec exercises for real (waypoint drag,
// label edit) don't share that fragility.
test.describe("M2 — edges", () => {
  test.beforeEach(async ({ page }) => {
    await gotoFresh(page);
  });

  async function buildConnectedPair(page: import("@playwright/test").Page) {
    return page.evaluate(() => {
      const s = window.__ddStore!.getState() as unknown as {
        addShapeNode: (ref: string, pos: { x: number; y: number }, size: { w: number; h: number }) => string;
        connect: (args: { sourceNodeId: string; sourceHandleId: string; targetNodeId: string; targetHandleId: string }) => string;
        clearSelection: () => void;
      };
      const a = s.addShapeNode("general/rect", { x: 100, y: 100 }, { w: 100, h: 60 });
      const b = s.addShapeNode("general/ellipse", { x: 400, y: 100 }, { w: 80, h: 80 });
      const edgeId = s.connect({ sourceNodeId: a, sourceHandleId: "right", targetNodeId: b, targetHandleId: "left" });
      s.clearSelection();
      return { a, b, edgeId };
    });
  }

  test("a connected edge renders with an arrowhead", async ({ page }) => {
    await buildConnectedPair(page);
    const diagramId = await currentDiagramId(page);
    const doc = await getDoc(page);
    expect(doc.diagrams[diagramId].edges).toHaveLength(1);

    await expect(page.locator(".react-flow__edge-path").first()).toBeVisible();
    await expect(page.locator("marker").first()).toBeAttached();
  });

  test("dragging the edge line adds a waypoint that reroutes it", async ({ page }) => {
    const { edgeId } = await buildConnectedPair(page);
    const diagramId = await currentDiagramId(page);
    await page.evaluate(() => window.__rf?.fitView?.({ padding: 0.3 }));

    const before = await getDoc(page);
    expect(before.diagrams[diagramId].edges[0].waypoints ?? []).toHaveLength(0);

    const hitPath = page.locator('[class*="hitPath"]').first();
    const box = await hitPath.boundingBox();
    if (!box) throw new Error("edge hit-path not rendered");
    const midX = box.x + box.width / 2;
    const midY = box.y + box.height / 2;

    await page.mouse.move(midX, midY);
    await page.mouse.down();
    await page.mouse.move(midX, midY - 60, { steps: 10 });
    await page.mouse.up();

    const after = await getDoc(page);
    const edge = after.diagrams[diagramId].edges.find((e) => e.id === edgeId);
    expect(edge?.waypoints?.length ?? 0).toBeGreaterThan(0);
  });

  test("double-click on the edge commits a label", async ({ page }) => {
    const { edgeId } = await buildConnectedPair(page);
    const diagramId = await currentDiagramId(page);
    await page.evaluate(() => window.__rf?.fitView?.({ padding: 0.3 }));

    const hitPath = page.locator('[class*="hitPath"]').first();
    await hitPath.dblclick();
    await page.keyboard.type("payment ok");
    await page.keyboard.press("Enter");

    const doc = await getDoc(page);
    const edge = doc.diagrams[diagramId].edges.find((e) => e.id === edgeId);
    expect(edge?.label?.text).toBe("payment ok");
  });

  test("Ctrl+Z undoes a waypoint drag", async ({ page }) => {
    const { edgeId } = await buildConnectedPair(page);
    const diagramId = await currentDiagramId(page);
    await page.evaluate(() => window.__rf?.fitView?.({ padding: 0.3 }));

    const hitPath = page.locator('[class*="hitPath"]').first();
    const box = await hitPath.boundingBox();
    if (!box) throw new Error("edge hit-path not rendered");
    const midX = box.x + box.width / 2;
    const midY = box.y + box.height / 2;
    await page.mouse.move(midX, midY);
    await page.mouse.down();
    await page.mouse.move(midX, midY - 60, { steps: 10 });
    await page.mouse.up();

    expect(
      (await getDoc(page)).diagrams[diagramId].edges.find((e) => e.id === edgeId)?.waypoints?.length ?? 0,
    ).toBeGreaterThan(0);

    await page.keyboard.press("Control+z");

    expect(
      (await getDoc(page)).diagrams[diagramId].edges.find((e) => e.id === edgeId)?.waypoints?.length ?? 0,
    ).toBe(0);
  });
});
