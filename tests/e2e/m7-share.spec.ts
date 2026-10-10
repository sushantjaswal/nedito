import { expect, test } from "@playwright/test";
import { gotoShareLink, openShareLink, sharedDoc, shareUrlFor } from "./shareLink";
import { gotoFresh } from "./helpers";

// Phase 3.1: a diagram travels inside the URL fragment and
// opens in a read-only viewer that can still be navigated, including into nested blocks.
test.describe("Phase 3.1 — share link viewer", () => {
  test("opens a shared diagram read-only, with no editing chrome", async ({ page }) => {
    await gotoShareLink(page, await shareUrlFor(sharedDoc()));

    await expect(page.getByTestId("nd-viewer-shell")).toBeVisible();
    await expect(page.getByTestId("nd-viewer-readonly")).toContainText("read-only");
    await expect(page.getByTestId("nd-shape-library")).toHaveCount(0);
    await expect(page.getByTestId("nd-canvas-chip")).toHaveCount(0);
    await expect(page.getByTestId("nd-context-bar")).toHaveCount(0);
    await expect(page.getByTestId("nd-page-add")).toHaveCount(0);
  });

  test("renders the shared content", async ({ page }) => {
    await gotoShareLink(page, await shareUrlFor(sharedDoc()));
    await expect(page.getByText("API Gateway")).toBeVisible();
    await expect(page.getByTestId("nd-nested-node-svc")).toBeVisible();
  });

  // The reason sharing a nested diagram is worth anything: the reader can open the boxes.
  test("drills into a nested block and back out again", async ({ page }) => {
    await gotoShareLink(page, await shareUrlFor(sharedDoc()));

    await expect(page.getByTestId("nd-breadcrumb-0")).toHaveText("Main");
    await page.getByTestId("nd-nested-open-svc").click();

    await expect(page.getByTestId("nd-breadcrumb-1")).toHaveText("Payment Service");
    await expect(page.getByText("Ledger")).toBeVisible();

    // Arriving at the child's own 100% view, not stranded at whatever zoom the dive-in
    // animation reached — a failure seen before, re-checked here because
    // the viewer runs that same transition without the editor's chrome around it.
    await expect
      .poll(() => page.evaluate(() => window.__rf!.getViewport!().zoom), { timeout: 5000 })
      .toBeCloseTo(1, 2);

    // Esc walks back out, same as the editor.
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("nd-breadcrumb-1")).toHaveCount(0);
    await expect(page.getByText("API Gateway")).toBeVisible();
  });

  test("keeps the payload out of the query string", async ({ page }) => {
    await gotoShareLink(page, await shareUrlFor(sharedDoc()));
    const url = new URL(page.url());
    // The whole privacy claim: everything after # is stripped before the request is sent.
    expect(url.search).toBe("");
    expect(url.hash).toContain("d=");
  });

  test("double-clicking a shape does not open a label editor", async ({ page }) => {
    await gotoShareLink(page, await shareUrlFor(sharedDoc()));
    await page.getByTestId("nd-shape-node-gateway").dblclick();
    // The label editor is a textarea (canvas/LabelEditor.tsx); its formatting lives in the context bar.
    await expect(page.locator("textarea")).toHaveCount(0);
    await expect(page.getByLabel("Font size")).toHaveCount(0);
    // Still shown as text on the shape. (The click also traces it, D117, so the trace hint names
    // it too — hence scoped to the shape.)
    await expect(page.getByTestId("nd-shape-node-gateway").getByText("API Gateway")).toBeVisible();
  });
});

test.describe("Phase 3.1 — the recipient's own work", () => {
  test("opening a share link leaves an existing autosave untouched", async ({ page }) => {
    await page.goto("/");
    // Seed a document of "their own", exactly as autosave would have written it.
    const before = await page.evaluate(() => {
      localStorage.clear();
      localStorage.setItem("nedito:collapsedSections", "[]");
      localStorage.setItem("nedito:collapsedGroups", '["cloud"]'); // see helpers.ts
      localStorage.setItem("nedito:demoDismissed", "true");
      const own = JSON.stringify({
        format: "nedito",
        formatVersion: 2,
        meta: {
          title: "My Own Work",
          created: "2026-09-01T00:00:00.000Z",
          modified: "2026-09-01T00:00:00.000Z",
          appVersion: "0.0.1",
        },
        rootDiagramIds: ["mine"],
        diagrams: { mine: { id: "mine", title: "Mine", nodes: [], edges: [] } },
      });
      localStorage.setItem("nedito:autosave", own);
      return own;
    });

    await openShareLink(page, await shareUrlFor(sharedDoc()));
    await expect(page.getByTestId("nd-viewer-shell")).toBeVisible();
    // Comfortably past useAutosave's 800ms debounce, had it been running at all.
    await page.waitForTimeout(1500);

    expect(await page.evaluate(() => localStorage.getItem("nedito:autosave"))).toBe(before);
  });

  test("Edit a copy takes the shared diagram into the full editor", async ({ page }) => {
    await gotoShareLink(page, await shareUrlFor(sharedDoc()));
    await page.getByTestId("nd-viewer-edit-copy").click();

    await expect(page.getByTestId("nd-shape-library")).toBeVisible();
    await expect(page.getByTestId("nd-viewer-shell")).toHaveCount(0);
    // Still their colleague's diagram, now editable.
    await expect(page.getByText("API Gateway")).toBeVisible();
    // And the payload is out of the address bar, so a reload doesn't reopen the viewer.
    expect(new URL(page.url()).hash).toBe("");
  });
});

test.describe("Phase 3.1 — a link that cannot be read", () => {
  test("shows the error card instead of a blank canvas", async ({ page }) => {
    await gotoShareLink(page, "/#d=this-is-not-a-real-payload&v=2");

    const card = page.getByTestId("nd-share-error");
    await expect(card).toBeVisible();
    await expect(card).toContainText(/damaged/i);
    await expect(page.getByTestId("nd-viewer-shell")).toHaveCount(0);
  });

  test("says so plainly when the link came from a newer version", async ({ page }) => {
    const url = await shareUrlFor(sharedDoc());
    await gotoShareLink(page, url.replace(/&v=\d+$/, "&v=99"));

    await expect(page.getByTestId("nd-share-error")).toContainText(/newer version/i);
  });

  test("offers a way through to the editor", async ({ page }) => {
    await gotoShareLink(page, "/#d=broken&v=2");
    await page.getByTestId("nd-share-error-dismiss").click();
    await expect(page.getByTestId("nd-shape-library")).toBeVisible();
  });
});

// Phase 3.3. The dialog's own behaviour is unit-tested in
// src/share/ShareDialog.test.tsx; the acceptance criterion that needs a browser is that the
// &p= parameter really does land the reader at the right nesting level.
test.describe("Phase 3.3 — share dialog and 'Open at this level'", () => {
  test("a link with &p= opens the viewer inside the nested block", async ({ page }) => {
    await gotoShareLink(page, await shareUrlFor(sharedDoc(), "child"));

    // Straight in at depth 1, without the reader having to find and open the box.
    await expect(page.getByTestId("nd-breadcrumb-1")).toHaveText("Payment Service");
    await expect(page.getByText("Ledger")).toBeVisible();
    // And the trail back out is intact, not a viewer stranded with no context.
    await expect(page.getByTestId("nd-breadcrumb-0")).toHaveText("Main");
  });

  test("without &p= the same link still opens at the top", async ({ page }) => {
    await gotoShareLink(page, await shareUrlFor(sharedDoc()));
    await expect(page.getByTestId("nd-breadcrumb-0")).toHaveText("Main");
    await expect(page.getByTestId("nd-breadcrumb-1")).toHaveCount(0);
  });

  // A stale or hand-edited link must not become an error page: page one is a fine answer.
  test("a &p= naming a diagram that isn't there falls back to page one", async ({ page }) => {
    await gotoShareLink(page, await shareUrlFor(sharedDoc(), "no-such-diagram"));

    await expect(page.getByTestId("nd-viewer-shell")).toBeVisible();
    await expect(page.getByTestId("nd-breadcrumb-0")).toHaveText("Main");
    await expect(page.getByTestId("nd-share-error")).toHaveCount(0);
  });

  test("the Share button offers the link, its size and the no-upload claim", async ({ page }) => {
    await gotoFresh(page);
    await page.getByTestId("nd-share").click();

    const dialog = page.getByTestId("nd-share-dialog");
    await expect(dialog).toBeVisible();
    await expect(page.getByTestId("nd-share-url")).toHaveValue(/#d=/);
    await expect(page.getByTestId("nd-share-size")).toContainText("of 16 KB");
    await expect(page.getByTestId("nd-share-privacy")).toContainText("Nothing is uploaded");

    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
  });
});
