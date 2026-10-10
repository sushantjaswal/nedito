import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { getDoc, gotoFresh } from "./helpers";

// Phase 2's drawio XML import. The mapping itself is unit-tested in src/file/drawio/; what only
// a real browser proves is that a file picked through Open actually lands on the canvas,
// that the best-effort warnings reach the user, and that a file we can't read says so instead
// of wiping the canvas.

const SAMPLE = `<mxfile host="app.diagrams.net" agent="e2e" version="24.0.0">
  <diagram id="p1" name="Payments">
    <mxGraphModel dx="1114" dy="762" grid="1" gridSize="10" page="1">
      <root>
        <mxCell id="0"/><mxCell id="1" parent="0"/>
        <mxCell id="2" value="API Gateway" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#dae8fc;" vertex="1" parent="1">
          <mxGeometry x="80" y="80" width="160" height="60" as="geometry"/>
        </mxCell>
        <mxCell id="3" value="Decision?" style="rhombus;whiteSpace=wrap;html=1;" vertex="1" parent="1">
          <mxGeometry x="120" y="220" width="120" height="80" as="geometry"/>
        </mxCell>
        <mxCell id="4" value="routes" style="edgeStyle=orthogonalEdgeStyle;html=1;" edge="1" parent="1" source="2" target="3">
          <mxGeometry relative="1" as="geometry"/>
        </mxCell>
      </root>
    </mxGraphModel>
  </diagram>
  <diagram id="p2" name="Detail">
    <mxGraphModel dx="1114" dy="762">
      <root>
        <mxCell id="0"/><mxCell id="1" parent="0"/>
        <mxCell id="9" value="Note" style="shape=note;html=1;" vertex="1" parent="1">
          <mxGeometry x="40" y="40" width="100" height="80" as="geometry"/>
        </mxCell>
      </root>
    </mxGraphModel>
  </diagram>
</mxfile>`;

async function openDrawio(page: import("@playwright/test").Page, xml: string, name = "Payments.drawio") {
  await page.getByTestId("nd-file-open-input").setInputFiles({
    name,
    mimeType: "application/xml",
    buffer: Buffer.from(xml, "utf-8"),
  });
}

test.describe("drawio XML import", () => {
  test("opens a .drawio file onto the canvas, one page tab per diagram", async ({ page }) => {
    await gotoFresh(page);
    await openDrawio(page, SAMPLE);

    // The imported page's shapes are really on the canvas, not merely in the store.
    await expect(page.getByTestId("nd-canvas").getByText("API Gateway")).toBeVisible();
    await expect(page.getByTestId("nd-canvas").getByText("Decision?")).toBeVisible();

    const doc = await getDoc(page);
    expect(doc.rootDiagramIds).toHaveLength(2);
    expect(doc.rootDiagramIds.map((id) => doc.diagrams[id].title)).toEqual(["Payments", "Detail"]);
    expect(doc.meta.title).toBe("Payments");

    const first = doc.diagrams[doc.rootDiagramIds[0]];
    expect(first.nodes).toHaveLength(2);
    expect(first.edges).toHaveLength(1);
  });

  test("tells the user which shapes it could not draw, rather than losing them quietly", async ({ page }) => {
    await gotoFresh(page);

    // The note used to be a window.alert: gone once dismissed, and unable to point at anything.
    // It must not come back as one.
    const dialogs: string[] = [];
    page.on("dialog", (d) => {
      dialogs.push(d.message());
      return d.dismiss();
    });

    const exotic = SAMPLE.replace(
      'style="rhombus;whiteSpace=wrap;html=1;"',
      'style="shape=mxgraph.azure.virtual_machine;"',
    );
    await openDrawio(page, exotic);

    // The shape still arrives, labelled and placed - just as a rectangle.
    await expect(page.getByTestId("nd-canvas").getByText("Decision?")).toBeVisible();

    const panel = page.getByTestId("nd-import-notices");
    await expect(panel).toBeVisible();
    await expect(panel).toContainText("mxgraph.azure.virtual_machine");
    expect(dialogs).toEqual([]);

    // "Show" selects exactly the stand-in, so the user is taken to what changed.
    await page.getByTestId("nd-import-notice-show-0").click();
    const selected = await page.evaluate(() => {
      const s = window.__ddStore!.getState() as unknown as {
        selection: { nodeIds: string[] };
        doc: { diagrams: Record<string, { nodes: { id: string; label?: { text: string } }[] }> };
        navStack: string[];
      };
      const nodes = s.doc.diagrams[s.navStack[s.navStack.length - 1]].nodes;
      return s.selection.nodeIds.map((id) => nodes.find((n) => n.id === id)?.label?.text);
    });
    expect(selected).toEqual(["Decision?"]);

    // It stays until the user closes it — the whole reason it is not an alert any more.
    await expect(panel).toBeVisible();
    await page.getByTestId("nd-import-notices-close").click();
    await expect(panel).toHaveCount(0);
  });

  test("says nothing at all when the whole file came across", async ({ page }) => {
    await gotoFresh(page);
    await openDrawio(page, SAMPLE);
    await expect(page.getByTestId("nd-canvas").getByText("Decision?")).toBeVisible();
    await expect(page.getByTestId("nd-import-notices")).toHaveCount(0);
  });

  test("refuses a file that isn't draw.io without disturbing the current diagram", async ({ page }) => {
    await gotoFresh(page);

    // Something already on the canvas, so "didn't disturb it" is a real assertion.
    await page.evaluate(() => {
      const s = window.__ddStore!.getState() as unknown as {
        addShapeNode: (r: string, p: { x: number; y: number }, z: { w: number; h: number }) => string;
      };
      s.addShapeNode("general/rect", { x: 100, y: 100 }, { w: 120, h: 60 });
    });

    const messages: string[] = [];
    page.on("dialog", (d) => {
      messages.push(d.message());
      return d.dismiss();
    });

    await openDrawio(page, "<html><body>definitely not a diagram</body></html>", "notes.xml");

    await expect.poll(() => messages.join(" ")).toContain("draw.io");
    const doc = await getDoc(page);
    expect(doc.diagrams[doc.rootDiagramIds[0]].nodes).toHaveLength(1);
  });

  // D82: a picture embedded in a draw.io file arrives as a real picture, not a placeholder.
  test("brings an embedded picture across as a picture", async ({ page }) => {
    await gotoFresh(page);
    const png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==";
    const xml = `<mxfile host="app.diagrams.net"><diagram id="p" name="Logos"><mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/>
      <mxCell id="2" value="Logo" style="shape=image;html=1;verticalLabelPosition=bottom;image=data:image/png,${png};" vertex="1" parent="1"><mxGeometry x="60" y="60" width="80" height="80" as="geometry"/></mxCell>
      </root></mxGraphModel></diagram></mxfile>`;
    await openDrawio(page, xml, "Logos.drawio");
    await expect(page.locator('.react-flow__node img[src^="data:image/png"]')).toBeVisible();
    await expect(page.getByTestId("nd-import-notices")).toHaveCount(0);
    const doc = await getDoc(page);
    expect(Object.keys(doc.assets ?? {})).toHaveLength(1);
  });
});

test("a table's narrow key column keeps its word on one line (D139)", async ({ page }) => {
  await gotoFresh(page);
  const xml = readFileSync("src/file/drawio/fixtures/audit/er-table.drawio", "utf8");
  await page.evaluate(async (text) => {
    const m = await import("/src/file/drawio/drawioImport.ts" as string);
    const r = await m.decodeDrawio(text, "er.drawio");
    (window.__ddStore!.getState() as unknown as { loadDoc: (d: unknown) => void }).loadDoc(r.doc);
  }, xml);
  const pk = page.locator(".react-flow__node").filter({ hasText: /^PK$/ }).first();
  await expect(pk).toBeVisible();
  // One line box for the word: it was broken into "P" over "K".
  const lines = await pk.evaluate((el) => {
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    const node = walker.nextNode()!;
    const range = document.createRange();
    range.selectNodeContents(node);
    return new Set(Array.from(range.getClientRects(), (r) => Math.round(r.top))).size;
  });
  expect(lines).toBe(1);
});
