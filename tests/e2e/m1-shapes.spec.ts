import { expect, test } from "@playwright/test";
import { currentDiagramId, getDoc, gotoFresh } from "./helpers";

// M1 exit test: click-to-place shapes, selection shows the format panel,
// inline label editing, copy/paste/duplicate/delete, undo/redo.
test.describe("M1 — shapes on canvas", () => {
  test.beforeEach(async ({ page }) => {
    await gotoFresh(page);
  });

  test("click-to-place adds a shape and selects it", async ({ page }) => {
    await page.getByTestId("nd-stencil-general/rect").click();

    const diagramId = await currentDiagramId(page);
    const doc = await getDoc(page);
    expect(doc.diagrams[diagramId].nodes).toHaveLength(1);
    expect(doc.diagrams[diagramId].nodes[0].type).toBe("shape");

    // Selecting a shape brings up its context bar, with the style groups the panel used to hold
    // (R1, D90).
    await expect(page.getByTestId("nd-context-bar")).toBeVisible();
    await expect(page.getByTestId("nd-bar-fill")).toBeVisible();
  });

  test("double-click enters label edit; Enter commits the text", async ({ page }) => {
    await page.getByTestId("nd-stencil-general/rect").click();
    const diagramId = await currentDiagramId(page);
    const doc = await getDoc(page);
    const nodeId = doc.diagrams[diagramId].nodes[0].id;

    await page.getByTestId(`nd-shape-node-${nodeId}`).dblclick();
    await page.keyboard.type("Checkout");
    await page.keyboard.press("Enter");

    const after = await getDoc(page);
    expect(after.diagrams[diagramId].nodes[0].label?.text).toBe("Checkout");
  });

  test("Ctrl+D duplicates the selection", async ({ page }) => {
    await page.getByTestId("nd-stencil-general/rect").click();
    await page.keyboard.press("Control+d");

    const diagramId = await currentDiagramId(page);
    const doc = await getDoc(page);
    expect(doc.diagrams[diagramId].nodes).toHaveLength(2);
  });

  test("Delete removes the selection, Ctrl+Z / Ctrl+Y undo and redo it", async ({ page }) => {
    await page.getByTestId("nd-stencil-general/rect").click();
    const diagramId = await currentDiagramId(page);

    await page.keyboard.press("Delete");
    expect((await getDoc(page)).diagrams[diagramId].nodes).toHaveLength(0);

    await page.keyboard.press("Control+z");
    expect((await getDoc(page)).diagrams[diagramId].nodes).toHaveLength(1);

    await page.keyboard.press("Control+y");
    expect((await getDoc(page)).diagrams[diagramId].nodes).toHaveLength(0);
  });

  test("dragging a shape on the real canvas moves it (native pointer events, not jsdom-simulated)", async ({ page }) => {
    await page.getByTestId("nd-stencil-general/rect").click();
    const diagramId = await currentDiagramId(page);
    const before = await getDoc(page);
    const nodeId = before.diagrams[diagramId].nodes[0].id;
    const startPos = before.diagrams[diagramId].nodes[0].position;

    const handle = page.getByTestId(`nd-shape-node-${nodeId}`);
    const box = await handle.boundingBox();
    if (!box) throw new Error("node not rendered");

    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 120, box.y + box.height / 2 + 80, { steps: 10 });
    await page.mouse.up();

    const after = await getDoc(page);
    const endPos = after.diagrams[diagramId].nodes[0].position;
    expect(endPos.x).not.toBe(startPos.x);
    expect(endPos.y).not.toBe(startPos.y);
  });

  test("clicking a third shape after a rubber-band multi-select replaces the selection, not adds to it", async ({ page }) => {
    await page.evaluate(() => {
      const s = window.__ddStore!.getState() as unknown as {
        addShapeNode: (ref: string, pos: { x: number; y: number }, size: { w: number; h: number }) => string;
        setSelection: (nodeIds: string[]) => void;
      };
      s.addShapeNode("general/rect", { x: 100, y: 100 }, { w: 100, h: 60 });
      s.addShapeNode("general/rect", { x: 350, y: 100 }, { w: 100, h: 60 });
      s.addShapeNode("general/rect", { x: 600, y: 100 }, { w: 100, h: 60 });
      s.setSelection([]);
    });
    const diagramId = await currentDiagramId(page);
    const nodes = (await getDoc(page)).diagrams[diagramId].nodes;
    const [firstId, secondId, thirdId] = nodes.map((n) => n.id);

    const firstBox = await page.getByTestId(`nd-shape-node-${firstId}`).boundingBox();
    const secondBox = await page.getByTestId(`nd-shape-node-${secondId}`).boundingBox();
    const thirdBox = await page.getByTestId(`nd-shape-node-${thirdId}`).boundingBox();
    if (!firstBox || !secondBox || !thirdBox) throw new Error("nodes not rendered");

    // Rubber-band drag over the first two shapes only, starting from empty canvas above them.
    await page.mouse.move(firstBox.x - 20, firstBox.y - 20);
    await page.mouse.down();
    await page.mouse.move(secondBox.x + secondBox.width + 20, secondBox.y + secondBox.height + 20, { steps: 10 });
    await page.mouse.up();
    const afterDrag = await page.evaluate(() => window.__ddStore!.getState() as unknown as { selection: { nodeIds: string[] } });
    expect(afterDrag.selection.nodeIds.sort()).toEqual([firstId, secondId].sort());

    // Plain click on the third, previously-unselected shape must replace the selection.
    await page.mouse.click(thirdBox.x + thirdBox.width / 2, thirdBox.y + thirdBox.height / 2);
    const afterClick = await page.evaluate(() => window.__ddStore!.getState() as unknown as { selection: { nodeIds: string[] } });
    expect(afterClick.selection.nodeIds).toEqual([thirdId]);
  });

  test("dragging a stencil from the library onto the Favorites section saves it there", async ({ page }) => {
    // Native HTML5 drag-and-drop cannot be driven by synthetic mouse moves, so the drag payload
    // is handed to the drop zone directly — exactly the payload ShapeLibrary puts on the
    // dataTransfer for the sidebar-to-canvas path.
    await page.evaluate(() => {
      const zone = document.querySelector('[data-testid="nd-favorites-dropzone"]')!;
      const dt = new DataTransfer();
      dt.setData("application/nd-stencil", JSON.stringify({ id: "general/hexagon", w: 120, h: 90, kind: "shape" }));
      zone.dispatchEvent(new DragEvent("dragover", { dataTransfer: dt, bubbles: true, cancelable: true }));
      zone.dispatchEvent(new DragEvent("drop", { dataTransfer: dt, bubbles: true, cancelable: true }));
    });

    const saved = await page.evaluate(
      () => (window.__ddStore!.getState() as unknown as { scratchpad: { shapeRef: string }[] }).scratchpad,
    );
    expect(saved.map((i) => i.shapeRef)).toContain("general/hexagon");
    await expect(page.getByTestId(/^nd-scratchpad-/).first()).toBeVisible();
  });

  test("right-click opens the context menu for a node that is part of a multi-selection", async ({ page }) => {
    // Must use a real rubber-band gesture, not a programmatic setSelection: React Flow only
    // raises its `nodesselection` overlay for a genuine box-select, and that overlay is exactly
    // what used to swallow the right-click so no menu appeared.
    const ids = await page.evaluate(() => {
      const s = window.__ddStore!.getState() as unknown as {
        addShapeNode: (r: string, p: { x: number; y: number }, z: { w: number; h: number }) => string;
      };
      return [
        s.addShapeNode("general/rect", { x: 60, y: 60 }, { w: 120, h: 60 }),
        s.addShapeNode("general/rect", { x: 60, y: 200 }, { w: 120, h: 60 }),
      ];
    });

    const first = await page.getByTestId(`nd-shape-node-${ids[0]}`).boundingBox();
    const second = await page.getByTestId(`nd-shape-node-${ids[1]}`).boundingBox();
    if (!first || !second) throw new Error("nodes not rendered");

    await page.mouse.move(first.x - 30, first.y - 30);
    await page.mouse.down();
    await page.mouse.move(second.x + second.width + 30, second.y + second.height + 30, { steps: 10 });
    await page.mouse.up();
    const selected = await page.evaluate(
      () => (window.__ddStore!.getState() as unknown as { selection: { nodeIds: string[] } }).selection.nodeIds,
    );
    expect(selected.length).toBe(2);

    await page.mouse.click(first.x + first.width / 2, first.y + first.height / 2, { button: "right" });

    await expect(page.getByTestId("nd-context-menu")).toBeVisible();
    // Group is only offered for a genuine multi-selection, so it doubles as proof the selection
    // survived the right-click rather than collapsing to the one node under the cursor.
    await expect(page.getByTestId("nd-context-menu").getByText("Group", { exact: true })).toBeVisible();
  });
});
