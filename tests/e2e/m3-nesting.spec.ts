import { expect, test } from "@playwright/test";
import { currentDiagramId, getDoc, gotoFresh } from "./helpers";
import type { NestedNode } from "../../src/model/types";

// M3 exit test: the "checkout scenario" — API Gateway -> nested Payment
// Service -> Orders DB, drill into Payment Service, confirm ghost links render with the exact
// specified wording, confirm breadcrumb navigation, confirm a root-level undo from N levels
// deep both undoes the change and relocates the view back to where it happened.
test.describe("M3 — nesting (checkout scenario)", () => {
  test.beforeEach(async ({ page }) => {
    await gotoFresh(page);
  });

  async function buildCheckoutScenario(page: import("@playwright/test").Page) {
    return page.evaluate(() => {
      const s = window.__ddStore!.getState() as unknown as {
        addShapeNode: (ref: string, pos: { x: number; y: number }, size: { w: number; h: number }) => string;
        connect: (args: { sourceNodeId: string; sourceHandleId: string; targetNodeId: string; targetHandleId: string }) => string;
        setSelection: (nodeIds: string[], edgeIds?: string[]) => void;
        convertSelectionToNested: (title?: string) => { nestedNodeId: string; childDiagramId: string } | null;
        addPort: (nestedNodeId: string, port: { side: string; offset: number; innerNodeId: string }) => void;
        clearSelection: () => void;
      };
      const gateway = s.addShapeNode("general/rect", { x: 0, y: 0 }, { w: 120, h: 60 });
      const paymentEntry = s.addShapeNode("general/rect", { x: 300, y: 0 }, { w: 120, h: 60 });
      const ordersDb = s.addShapeNode("general/rect", { x: 600, y: 0 }, { w: 120, h: 60 });

      const inboundEdge = s.connect({ sourceNodeId: gateway, sourceHandleId: "right", targetNodeId: paymentEntry, targetHandleId: "left" });
      const outboundEdge = s.connect({ sourceNodeId: paymentEntry, sourceHandleId: "right", targetNodeId: ordersDb, targetHandleId: "left" });

      s.setSelection([paymentEntry]);
      const result = s.convertSelectionToNested("Payment Service")!;
      s.clearSelection();
      return { gateway, ordersDb, inboundEdge, outboundEdge, nestedNodeId: result.nestedNodeId, childDiagramId: result.childDiagramId };
    });
  }

  test("converting from the menu names the block there and then; inside, the pills have room for their names (D113)", async ({ page }) => {
    const ids = await page.evaluate(() => {
      const s = window.__ddStore!.getState() as unknown as {
        addShapeNode: (ref: string, pos: { x: number; y: number }, size: { w: number; h: number }) => string;
        setNodeLabel: (id: string, label: { text: string }) => void;
        connect: (args: { sourceNodeId: string; sourceHandleId: string; targetNodeId: string; targetHandleId: string }) => string;
        setSelection: (nodeIds: string[], edgeIds?: string[]) => void;
      };
      const gateway = s.addShapeNode("general/rect", { x: 100, y: 200 }, { w: 140, h: 70 });
      const cards = s.addShapeNode("general/rect", { x: 400, y: 120 }, { w: 140, h: 70 });
      const fraud = s.addShapeNode("general/rect", { x: 400, y: 300 }, { w: 140, h: 70 });
      s.setNodeLabel(gateway, { text: "API Gateway" });
      s.connect({ sourceNodeId: gateway, sourceHandleId: "right", targetNodeId: cards, targetHandleId: "left" });
      s.connect({ sourceNodeId: cards, sourceHandleId: "bottom", targetNodeId: fraud, targetHandleId: "top" });
      s.setSelection([cards, fraud]);
      return { cards };
    });
    const box = (await page.locator(`.react-flow__node[data-id="${ids.cards}"]`).boundingBox())!;
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2, { button: "right" });
    await page.getByText("Convert to nested block").click();

    // The name is open for typing; what is typed names both the box and its level.
    await page.keyboard.press("Control+a");
    await page.keyboard.type("Payment Service");
    await page.keyboard.press("Enter");
    const doc = await getDoc(page);
    const block = doc.diagrams[await currentDiagramId(page)].nodes.find((n) => n.type === "nested") as NestedNode;
    expect(block.label?.text).toBe("Payment Service");
    expect(doc.diagrams[block.childDiagramId].title).toBe("Payment Service");
    // The live miniature, not a stored "2 shapes" that would go stale.
    expect(block.collapsed).toEqual({ icons: [] });
    await expect(page.getByTestId(`nd-nested-node-${block.id}`)).not.toContainText("2 shapes");

    await page.getByTestId(`nd-nested-open-${block.id}`).click();
    await expect(page.getByTestId("nd-breadcrumb-1")).toHaveText("Payment Service");
    const pill = page.locator('[data-testid^="nd-ghost-link-"]').first();
    await expect(pill).toContainText("API Gateway");
    // Its whole name shows once the level has settled: polled, because the view eases in over
    // 300ms and a pill measured mid-way is still squeezed (D114).
    await expect.poll(() => pill.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
  });

  test("converting a selection to nested auto-creates ports for boundary-crossing edges", async ({ page }) => {
    const { nestedNodeId } = await buildCheckoutScenario(page);
    const rootId = await currentDiagramId(page);
    const doc = await getDoc(page);
    const nested = doc.diagrams[rootId].nodes.find((n) => n.id === nestedNodeId) as NestedNode;
    expect(nested.type).toBe("nested");
    expect(nested.ports.length).toBeGreaterThanOrEqual(2);
  });

  test("opening the nested node navigates in and shows ghost links with their wording", async ({ page }) => {
    const { nestedNodeId } = await buildCheckoutScenario(page);
    await page.getByTestId(`nd-nested-open-${nestedNodeId}`).click();

    await expect(page.getByTestId("nd-breadcrumb-1")).toBeVisible();
    const pageText = await page.textContent("body");
    expect(pageText).toMatch(/API Gateway|·\s*parent/i);
  });

  test("breadcrumb click and Esc both navigate back to the root", async ({ page }) => {
    const { nestedNodeId } = await buildCheckoutScenario(page);
    await page.getByTestId(`nd-nested-open-${nestedNodeId}`).click();
    await expect(page.getByTestId("nd-breadcrumb-1")).toBeVisible();

    await page.getByTestId("nd-breadcrumb-0").click();
    await expect(page.getByTestId("nd-breadcrumb-1")).not.toBeVisible();
    // DiagramCanvas's per-level viewport restore runs a 300ms fitView/setViewport animation
    // (see its diagramId-keyed effect); double-clicking the nested node again before that
    // settles can catch it mid-transition and hit a detached-element flake.
    await page.waitForTimeout(400);

    await page.getByTestId(`nd-nested-open-${nestedNodeId}`).click();
    await expect(page.getByTestId("nd-breadcrumb-1")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("nd-breadcrumb-1")).not.toBeVisible();
  });

  test("undo from inside the nested diagram relocates the view to where the change happened", async ({ page }) => {
    const { gateway, ordersDb, nestedNodeId } = await buildCheckoutScenario(page);
    const rootId = await currentDiagramId(page);

    // Make one more root-level change (connect gateway directly to ordersDb) before diving in,
    // so undo has something at the ROOT to undo while the view is several levels deep.
    await page.evaluate(
      ({ gateway, ordersDb }) => {
        const s = window.__ddStore!.getState() as unknown as {
          connect: (args: { sourceNodeId: string; sourceHandleId: string; targetNodeId: string; targetHandleId: string }) => string;
        };
        s.connect({ sourceNodeId: gateway, sourceHandleId: "bottom", targetNodeId: ordersDb, targetHandleId: "bottom" });
      },
      { gateway, ordersDb },
    );
    const beforeUndo = await getDoc(page);
    expect(beforeUndo.diagrams[rootId].edges).toHaveLength(3);

    await page.getByTestId(`nd-nested-open-${nestedNodeId}`).click();
    await expect(page.getByTestId("nd-breadcrumb-1")).toBeVisible();

    await page.keyboard.press("Control+z");

    // The edge at the root was undone...
    const afterUndo = await getDoc(page);
    expect(afterUndo.diagrams[rootId].edges).toHaveLength(2);
    // ...and the view relocated back to root, where that change actually happened.
    await expect(page.getByTestId("nd-breadcrumb-1")).not.toBeVisible();
  });

  test("double-clicking a nested node renames it (and its child diagram), rather than opening it", async ({ page }) => {
    const { nestedNodeId, childDiagramId } = await buildCheckoutScenario(page);

    await page.getByTestId(`nd-nested-node-${nestedNodeId}`).dblclick();
    // Still on the parent — double-click no longer navigates, the ⤢ button does that.
    await expect(page.getByTestId("nd-breadcrumb-1")).not.toBeVisible();

    await page.keyboard.type("Fraud Engine");
    await page.keyboard.press("Enter");

    const doc = await getDoc(page);
    const rootId = await currentDiagramId(page);
    const node = doc.diagrams[rootId].nodes.find((n) => n.id === nestedNodeId)!;
    expect(node.label?.text).toBe("Fraud Engine");
    expect(doc.diagrams[childDiagramId].title).toBe("Fraud Engine");
  });

  // Regression for the user-reported flow (screen recording 2026-08-20): drop an empty nested
  // node, wire something straight to its body while the child is still empty, open the child —
  // which used to show nothing at all, with no hint the connection existed.
  test("an edge dropped on an empty nested node's body becomes a waiting connection, then links to a shape", async ({
    page,
  }) => {
    const { nestedNodeId } = await page.evaluate(() => {
      const s = window.__ddStore!.getState() as unknown as {
        addShapeNode: (ref: string, pos: { x: number; y: number }, size: { w: number; h: number }) => string;
        addNestedNode: (pos: { x: number; y: number }, size: { w: number; h: number }) => { nestedNodeId: string };
        connect: (args: { sourceNodeId: string; sourceHandleId: string; targetNodeId: string; targetHandleId: string }) => string;
        clearSelection: () => void;
      };
      const outside = s.addShapeNode("general/rect", { x: 0, y: 0 }, { w: 120, h: 60 });
      const nested = s.addNestedNode({ x: 300, y: 0 }, { w: 200, h: 140 });
      // "left" is a generic body handle, not a "port:<id>" handle — the exact gesture that
      // previously produced an edge with no port and therefore no ghost link.
      s.connect({ sourceNodeId: outside, sourceHandleId: "right", targetNodeId: nested.nestedNodeId, targetHandleId: "left" });
      s.clearSelection();
      return { nestedNodeId: nested.nestedNodeId };
    });

    const rootId = await currentDiagramId(page);
    const beforeOpen = await getDoc(page);
    const nestedNode = beforeOpen.diagrams[rootId].nodes.find((n) => n.id === nestedNodeId) as NestedNode;
    expect(nestedNode.ports).toHaveLength(1);
    expect(nestedNode.ports[0].innerNodeId).toBeUndefined();

    await page.getByTestId(`nd-nested-open-${nestedNodeId}`).click();
    await expect(page.getByTestId("nd-breadcrumb-1")).toBeVisible();

    // The waiting connection is visible immediately, rather than silently absent.
    await expect(page.getByTestId("nd-ghost-banner-warn")).toBeVisible();
    const portId = nestedNode.ports[0].id;
    await expect(page.getByTestId(`nd-ghost-unmapped-${portId}`)).toBeVisible();

    // Linking it (here through the same store action the drag and the context menu both call)
    // clears the warning and maps the port.
    const innerId = await page.evaluate(() => {
      const s = window.__ddStore!.getState() as unknown as {
        addShapeNode: (ref: string, pos: { x: number; y: number }, size: { w: number; h: number }) => string;
      };
      return s.addShapeNode("general/rect", { x: 60, y: 60 }, { w: 120, h: 60 });
    });
    await page.evaluate(
      ({ portId, innerId }) => {
        const s = window.__ddStore!.getState() as unknown as {
          mapUnlinkedPort: (portId: string, innerNodeId: string) => void;
        };
        s.mapUnlinkedPort(portId, innerId);
      },
      { portId, innerId },
    );

    await expect(page.getByTestId("nd-ghost-banner-warn")).toHaveCount(0);
    const afterMap = await getDoc(page);
    const mapped = afterMap.diagrams[rootId].nodes.find((n) => n.id === nestedNodeId) as NestedNode;
    expect(mapped.ports[0].innerNodeId).toBe(innerId);
  });

  // Regression: two edges leaving a nested block used to end up on ONE port, because React
  // Flow snaps a connection to any handle inside its connectionRadius. Inside the child that
  // drew two ghosts at identical coordinates, so the earlier one was invisible and mapping
  // "it" moved both — the connection appeared to jump wherever you last dropped it.
  test("two connections out of one block stay two separate ports", async ({ page }) => {
    const ids = await page.evaluate(() => {
      const s = window.__ddStore!.getState() as unknown as {
        addShapeNode: (ref: string, pos: { x: number; y: number }, size: { w: number; h: number }) => string;
        addNestedNode: (
          pos: { x: number; y: number },
          size: { w: number; h: number },
          title?: string,
        ) => { nestedNodeId: string; childDiagramId: string };
        connect: (a: { sourceNodeId: string; sourceHandleId: string; targetNodeId: string; targetHandleId: string }) => string;
        doc: { diagrams: Record<string, { nodes: { id: string; type: string; ports?: { id: string }[] }[] }> };
        currentDiagramId: () => string;
      };
      const block = s.addNestedNode({ x: 300, y: 200 }, { w: 240, h: 150 }, "Block");
      const exit1 = s.addShapeNode("general/rect", { x: 760, y: 100 }, { w: 120, h: 60 });
      const exit2 = s.addShapeNode("general/rect", { x: 760, y: 340 }, { w: 120, h: 60 });

      s.connect({ sourceNodeId: block.nestedNodeId, sourceHandleId: "right", targetNodeId: exit1, targetHandleId: "left" });

      const st = window.__ddStore!.getState() as unknown as typeof s;
      const rootId = st.currentDiagramId();
      const firstPort = (st.doc.diagrams[rootId].nodes.find((n) => n.id === block.nestedNodeId)!.ports ?? [])[0].id;

      // The second drop arrives already snapped onto the first port's handle.
      (window.__ddStore!.getState() as unknown as typeof s).connect({
        sourceNodeId: block.nestedNodeId,
        sourceHandleId: `port:${firstPort}`,
        targetNodeId: exit2,
        targetHandleId: "left",
      });

      return { nestedNodeId: block.nestedNodeId, childDiagramId: block.childDiagramId, firstPort, rootId };
    });

    const doc = await getDoc(page);
    const block = doc.diagrams[ids.rootId].nodes.find((n) => n.id === ids.nestedNodeId) as NestedNode;
    expect(block.ports).toHaveLength(2);

    const portsUsed = doc.diagrams[ids.rootId].edges.map((e) => e.source.portId);
    expect(new Set(portsUsed).size).toBe(2);

    // ...and inside the child both crossings are announced, not one.
    await page.evaluate((id) => {
      (window.__ddStore!.getState() as unknown as { navigateToDiagram: (d: string) => void }).navigateToDiagram(id);
    }, ids.childDiagramId);

    await expect(page.getByTestId("nd-ghost-banner-warn")).toContainText("2 connections");
  });
});
