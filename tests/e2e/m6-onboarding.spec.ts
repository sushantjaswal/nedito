import { expect, test } from "@playwright/test";
import { currentDiagramId, getDoc, gotoFirstVisit, gotoFresh, reloadApp } from "./helpers";

// Onboarding item 1: the permanent local-only disclosure. The acceptance
// bar is that it is reachable everywhere and by keyboard — a disclosure the user cannot find,
// or cannot escape from, is worse than none.
test.describe("Onboarding — local-only disclosure", () => {
  test.beforeEach(async ({ page }) => {
    await gotoFresh(page);
  });

  test("the badge is visible on load and opens a popover naming the risk", async ({ page }) => {
    const badge = page.getByTestId("nd-local-only-badge");
    await expect(badge).toBeVisible();
    await expect(badge).toContainText("Local only");

    await badge.click();
    const popover = page.getByTestId("nd-local-only-popover");
    await expect(popover).toBeVisible();
    await expect(popover).toContainText("Your data never leaves this device");
    await expect(popover).toContainText("Clearing browser data will erase your work");
  });

  test("the popover closes on Escape and returns focus to the badge", async ({ page }) => {
    await page.getByTestId("nd-local-only-badge").click();
    await expect(page.getByTestId("nd-local-only-popover")).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(page.getByTestId("nd-local-only-popover")).toHaveCount(0);
    await expect(page.getByTestId("nd-local-only-badge")).toBeFocused();
  });

  test("the popover closes on an outside click", async ({ page }) => {
    await page.getByTestId("nd-local-only-badge").click();
    await expect(page.getByTestId("nd-local-only-popover")).toBeVisible();
    // Any point on the bare canvas will do, but a fixed one will not: the empty-canvas start
    // panel and the page-tab strip both sit over parts of it, and the panel's tile grid grows
    // as featured templates are added. So find a point that is actually the pane.
    const spot = await page.evaluate(() => {
      const box = document.querySelector('[data-testid="nd-canvas"]')!.getBoundingClientRect();
      for (let y = box.bottom - 60; y > box.top; y -= 20) {
        for (let x = box.right - 60; x > box.left; x -= 20) {
          if (document.elementFromPoint(x, y)?.classList.contains("react-flow__pane")) {
            return { x: x - box.left, y: y - box.top };
          }
        }
      }
      throw new Error("no bare canvas to click");
    });
    await page.getByTestId("nd-canvas").click({ position: spot });
    await expect(page.getByTestId("nd-local-only-popover")).toHaveCount(0);
  });

  test("the badge stays visible two nesting levels deep", async ({ page }) => {
    const depth = await page.evaluate(() => {
      const s = window.__ddStore!.getState() as unknown as {
        addNestedNode: (p: { x: number; y: number }, z: { w: number; h: number }) => { nestedNodeId: string };
        navigateInto: (id: string) => void;
      };
      s.navigateInto(s.addNestedNode({ x: 60, y: 60 }, { w: 200, h: 140 }).nestedNodeId);
      const inner = window.__ddStore!.getState() as unknown as {
        addNestedNode: (p: { x: number; y: number }, z: { w: number; h: number }) => { nestedNodeId: string };
        navigateInto: (id: string) => void;
        navStack: string[];
      };
      inner.navigateInto(inner.addNestedNode({ x: 60, y: 60 }, { w: 200, h: 140 }).nestedNodeId);
      return (window.__ddStore!.getState() as unknown as { navStack: string[] }).navStack.length;
    });
    expect(depth).toBe(3);
    await expect(page.getByTestId("nd-local-only-badge")).toBeVisible();
  });

  test("Download a copy now downloads the document through the normal save path", async ({ page }) => {
    await page.getByTestId("nd-local-only-badge").click();
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByTestId("nd-local-only-download").click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/\.nedito$/);
    await expect(page.getByTestId("nd-local-only-popover")).toHaveCount(0);
  });
});

// Onboarding item 2: the first-visit sample. Uses gotoFirstVisit (no seeded flags) because the
// whole point is what a brand-new visitor sees; every other spec suppresses the sample.
test.describe("Onboarding — first-visit sample diagram", () => {
  test("a first visit loads the sample with its explanatory strip", async ({ page }) => {
    await gotoFirstVisit(page);

    await expect(page.getByTestId("nd-sample-strip")).toBeVisible();
    await expect(page.getByTestId("nd-sample-strip")).toContainText("sample diagram");

    const doc = await getDoc(page);
    const root = doc.diagrams[doc.rootDiagramIds[0]];
    expect(root.nodes.length).toBeGreaterThan(0);
    expect(root.nodes.some((n) => n.type === "nested")).toBe(true);
  });

  test("both nesting levels open, and the ghost link renders inside the first", async ({ page }) => {
    await gotoFirstVisit(page);
    // This test is about the sample's structure, not the tour — dismiss the coach marks first,
    // exactly as a user who skips them would, so their card isn't over the buttons being clicked.
    await expect(page.getByTestId("nd-coach-step-1")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("nd-coach-step-1")).toHaveCount(0);

    const doc = await getDoc(page);
    const root = doc.diagrams[doc.rootDiagramIds[0]];
    const service = root.nodes.find((n) => n.type === "nested")!;

    await page.getByTestId(`nd-nested-open-${service.id}`).click();
    await expect(page.getByTestId("nd-breadcrumb-1")).toBeVisible();
    // The port-mapped parent connection is what makes this a real boundary crossing.
    await expect(page.getByTestId("nd-ghost-links")).toBeVisible();

    const childDoc = await getDoc(page);
    const childId = await currentDiagramId(page);
    const fraud = childDoc.diagrams[childId].nodes.find((n) => n.type === "nested")!;
    await page.getByTestId(`nd-nested-open-${fraud.id}`).click();
    await expect(page.getByTestId("nd-breadcrumb-2")).toBeVisible();
  });

  test("'Start a blank canvas' empties the canvas and the sample never returns", async ({ page }) => {
    await gotoFirstVisit(page);
    await page.getByTestId("nd-start-blank").click();

    await expect(page.getByTestId("nd-sample-strip")).toHaveCount(0);
    const doc = await getDoc(page);
    expect(doc.diagrams[doc.rootDiagramIds[0]].nodes).toHaveLength(0);

    await reloadApp(page);
    await expect(page.getByTestId("nd-sample-strip")).toHaveCount(0);
  });

  test("editing the sample retires it, so a returning user keeps their own work", async ({ page }) => {
    await gotoFirstVisit(page);
    await expect(page.getByTestId("nd-sample-strip")).toBeVisible();

    await page.evaluate(() => {
      const s = window.__ddStore!.getState() as unknown as {
        addShapeNode: (r: string, p: { x: number; y: number }, z: { w: number; h: number }) => string;
      };
      s.addShapeNode("general/rect", { x: 900, y: 600 }, { w: 100, h: 60 });
    });

    await expect(page.getByTestId("nd-sample-strip")).toHaveCount(0);
    const dismissed = await page.evaluate(() => localStorage.getItem("nedito:demoDismissed"));
    expect(dismissed).toBe("true");
  });
});

// Onboarding item 3: the two coach marks. The acceptance bar is that the tour runs once, and
// that abandoning it at any point still leaves a working app with the sample intact.
test.describe("Onboarding — coach marks", () => {
  test("the tour runs both steps and confirms at the end", async ({ page }) => {
    await gotoFirstVisit(page);

    await expect(page.getByTestId("nd-coach-step-1")).toBeVisible();
    await expect(page.getByTestId("nd-nested-loop")).toBeVisible();

    await page.getByTestId("nd-coach-next").click();
    await expect(page.getByTestId("nd-coach-step-2")).toBeVisible();

    // The breadcrumb trail is highlighted while step 2 talks about it, so the thing being
    // described is unmistakable rather than merely un-dimmed.
    const trail = page.getByTestId("nd-breadcrumbs");
    await expect(trail).toContainText("Payment Service");
    await expect(trail).toHaveCSS("background-color", /rgba?\(109, 90, 230/);
    // And it wraps only the crumbs — a full-width target would spotlight the whole top bar.
    const box = (await trail.boundingBox())!;
    const bar = (await page.locator("header").first().boundingBox())!;
    expect(box.width).toBeLessThan(bar.width / 2);

    // Drilling back out now advances to step 3 rather than ending the tour.
    await page.getByTestId("nd-coach-next").click();
    await expect(page.getByTestId("nd-coach-step-3")).toBeVisible();
    await expect(page.getByTestId("nd-coach-step-3")).toContainText("Take it anywhere");

    await page.getByTestId("nd-coach-skip").click();
    expect(await page.evaluate(() => localStorage.getItem("nedito:tourDone"))).toBe("true");
    expect(await page.evaluate(() => localStorage.getItem("nedito:tourVersion"))).toBe("2");
  });

  test("step 1 says to click ⤢, and clicking the box's own ⤢ advances to step 2", async ({ page }) => {
    await gotoFirstVisit(page);
    const card = page.getByTestId("nd-coach-step-1");
    await expect(card).toContainText("Click ⤢ to open it");
    // Double-click renames a Nested Block, so the tour must not tell anyone to double-click it.
    await expect(card).not.toContainText(/double-click/i);

    const doc = await getDoc(page);
    const service = doc.diagrams[doc.rootDiagramIds[0]].nodes.find((n) => n.type === "nested")!;
    await page.getByTestId(`nd-nested-open-${service.id}`).click();
    await expect(page.getByTestId("nd-breadcrumb-1")).toBeVisible();
    await expect(page.getByTestId("nd-coach-step-2")).toBeVisible();
  });

  test("the tour never runs a second time", async ({ page }) => {
    await gotoFirstVisit(page);
    await expect(page.getByTestId("nd-coach-step-1")).toBeVisible();
    await page.getByTestId("nd-coach-skip").click();
    // The skip has taken (and been recorded) before the reload: a click that landed while the card
    // was still settling would otherwise reload with the tour unfinished (seen once in a full run).
    await expect(page.getByTestId("nd-coach-step-1")).toHaveCount(0);

    await reloadApp(page);
    // The sample is still there (skipping isn't dismissing it), but the tour is done for good.
    await expect(page.getByTestId("nd-sample-strip")).toBeVisible();
    await expect(page.getByTestId("nd-coach-step-1")).toHaveCount(0);
  });

  test("skipping at step 1 leaves a working app with the sample intact", async ({ page }) => {
    await gotoFirstVisit(page);
    await page.getByTestId("nd-coach-skip").click();

    await expect(page.getByTestId("nd-coach-step-1")).toHaveCount(0);
    await expect(page.getByTestId("nd-sample-strip")).toBeVisible();
    const doc = await getDoc(page);
    expect(doc.diagrams[doc.rootDiagramIds[0]].nodes.length).toBeGreaterThan(0);
  });

  test("Escape abandons the tour at any step", async ({ page }) => {
    await gotoFirstVisit(page);
    await expect(page.getByTestId("nd-coach-step-1")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("nd-coach-step-1")).toHaveCount(0);
  });

  test("the status bar shows the local-only badge and the diagram being viewed", async ({ page }) => {
    await gotoFresh(page);
    await expect(page.getByTestId("nd-status-bar")).toBeVisible();
    await expect(page.getByTestId("nd-local-only-badge")).toBeVisible();
    // The diagram's name alone: the zoom readout moved out with D108 (the zoom bar has it).
    const title = await page.evaluate(() => {
      const s = window.__ddStore!.getState();
      return s.doc.diagrams[s.currentDiagramId()].title;
    });
    await expect(page.getByTestId("nd-status-context")).toHaveText(title);
  });
});

// Onboarding item 4: the piece that actually prevents data loss. The
// thresholds and suppressions are unit-tested in src/onboarding/exportReminder.test.ts; what
// only a real browser can prove is that ordinary editing reaches the counter at all, and that
// the toast is reachable and dismissible on the real page.
test.describe("Onboarding - export reminder", () => {
  /** Places n shapes through the real store actions, the way the toolbar would. */
  async function makeChanges(page: import("@playwright/test").Page, n: number) {
    await page.evaluate((count) => {
      const store = window.__ddStore as unknown as {
        getState: () => {
          addShapeNode: (ref: string, at: { x: number; y: number }, size: { w: number; h: number }) => void;
        };
      };
      for (let i = 0; i < count; i += 1) {
        store.getState().addShapeNode("general/rect", { x: 40 + i * 12, y: 40 + i * 8 }, { w: 90, h: 50 });
      }
    }, n);
  }

  test("stays quiet through fourteen changes, then offers a download on the fifteenth", async ({ page }) => {
    await gotoFresh(page);
    await makeChanges(page, 14);
    await expect(page.getByTestId("nd-export-reminder")).toHaveCount(0);

    await makeChanges(page, 1);
    const toast = page.getByTestId("nd-export-reminder");
    await expect(toast).toBeVisible();
    await expect(toast).toContainText("15 changes");
    await expect(page.getByTestId("nd-export-reminder-download")).toContainText(".nedito");
  });

  test("Later dismisses it, and it does not come straight back", async ({ page }) => {
    await gotoFresh(page);
    await makeChanges(page, 15);
    await page.getByTestId("nd-export-reminder-later").click();
    await expect(page.getByTestId("nd-export-reminder")).toHaveCount(0);

    // Well short of the 40-change re-arm, so the user is left alone.
    await makeChanges(page, 10);
    await expect(page.getByTestId("nd-export-reminder")).toHaveCount(0);
  });

  test("the download button hands over a real file and resets the counter", async ({ page }) => {
    await gotoFresh(page);
    await makeChanges(page, 15);

    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByTestId("nd-export-reminder-download").click(),
    ]);
    expect(download.suggestedFilename()).toContain(".nedito");
    await expect(page.getByTestId("nd-export-reminder")).toHaveCount(0);

    const counter = await page.evaluate(() => {
      const store = window.__ddStore as unknown as {
        getState: () => { ui: { onboarding: { actionsSinceExport: number } } };
      };
      return store.getState().ui.onboarding.actionsSinceExport;
    });
    expect(counter).toBe(0);
  });

});

// Tutorial spec item L1, with L3's export lines folded in. The card's own logic is unit-tested
// in src/onboarding/tourStep3.test.tsx; what needs a browser is the clipboard write and the
// fact that "Show me" reveals entries the card is not sitting on top of.
test.describe("Onboarding - tour step 3, take it anywhere", () => {
  test.use({ permissions: ["clipboard-read", "clipboard-write"] });

  /** Walks the sample tour to its third step. */
  async function reachStep3(page: import("@playwright/test").Page) {
    await gotoFirstVisit(page);
    await expect(page.getByTestId("nd-coach-step-1")).toBeVisible();
    await page.getByTestId("nd-coach-next").click();
    await expect(page.getByTestId("nd-coach-step-2")).toBeVisible();
    await page.getByTestId("nd-coach-next").click();
    await expect(page.getByTestId("nd-coach-step-3")).toBeVisible();
  }

  test("spotlights the Export button and names the live-link command", async ({ page }) => {
    await reachStep3(page);

    const card = page.getByTestId("nd-coach-step-3");
    await expect(card).toContainText("Copy image with live link");
    await expect(card).toContainText("3 of 3");
    // The Export button is spotlighted while closed; the tour never drives the dropdown itself.
    await expect(page.getByTestId("nd-export-menu-trigger-content")).toHaveCount(0);
  });

  test("'Copy it now' really copies, then offers Done", async ({ page }) => {
    await reachStep3(page);
    await page.getByTestId("nd-coach-next").click();

    await expect(page.getByTestId("nd-coach-copied")).toBeVisible();
    await expect(page.getByTestId("nd-coach-next")).toContainText("Done");

    const types = await page.evaluate(async () => (await navigator.clipboard.read()).flatMap((i) => i.types));
    expect(types).toContain("image/png");
    expect(types).toContain("text/html");

    await page.getByTestId("nd-coach-next").click();
    await expect(page.getByTestId("nd-tour-done")).toBeVisible();
  });

  // The card is anchored clear of the Export menu on purpose: centred on its own spotlight it
  // lands on top of the dropdown and hides the very entries it is pointing at.
  test("'Show me' opens the menu with the export entries visible and highlighted", async ({ page }) => {
    await reachStep3(page);
    await page.getByTestId("nd-coach-more-ways").click();
    await expect(page.getByTestId("nd-coach-more-panel")).toContainText("Export to PowerPoint");

    await page.getByTestId("nd-coach-show-exports").click();
    const pptx = page.getByTestId("nd-export-pptx");
    await expect(pptx).toBeVisible();

    const menuItem = (await pptx.boundingBox())!;
    const card = (await page.getByTestId("nd-coach-step-3").boundingBox())!;
    expect(card.x + card.width, "the card is covering the menu it just opened").toBeLessThanOrEqual(menuItem.x + 1);
  });

  test("a returning user who finished the old tour sees only the new step, once", async ({ page }) => {
    await page.goto("/");
    await page.evaluate(() => {
      localStorage.clear();
      localStorage.setItem("nedito:collapsedSections", "[]");
      localStorage.setItem("nedito:collapsedGroups", '["cloud"]'); // see helpers.ts
      localStorage.setItem("nedito:demoDismissed", "true");
      // Finished the two-step tour, before step 3 existed.
      localStorage.setItem("nedito:tourDone", "true");
      localStorage.setItem("nedito:tourVersion", "1");
    });
    await reloadApp(page);

    // The step waits for a real diagram: it is about sharing *this* one.
    await expect(page.getByTestId("nd-coach-step-3")).toHaveCount(0);
    await page.evaluate(() => {
      const s = window.__ddStore!.getState() as unknown as {
        addShapeNode: (r: string, p: { x: number; y: number }, z: { w: number; h: number }) => string;
      };
      s.addShapeNode("general/rect", { x: 80, y: 80 }, { w: 140, h: 60 });
    });

    const card = page.getByTestId("nd-coach-step-3");
    await expect(card).toBeVisible();
    await expect(card).toContainText("New:");
    await expect(card).not.toContainText("of 3");

    await page.getByTestId("nd-coach-skip").click();
    await reloadApp(page);
    await expect(page.getByTestId("nd-coach-step-3")).toHaveCount(0);
  });
});

// Tutorial spec item L2, with L3's rider folded in. The rules are unit-tested in
// src/onboarding/liveLinkTip.test.tsx; what needs a browser is that a real PNG export triggers
// it, that the export itself is unaffected, and that it never comes back.
test.describe("Onboarding - live-link tip on first PNG export", () => {
  test.use({ permissions: ["clipboard-read", "clipboard-write"] });

  async function exportPng(page: import("@playwright/test").Page) {
    await page.getByTestId("nd-export-menu-trigger").click();
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByTestId("nd-export-png").click(),
    ]);
    return download;
  }

  async function drawSomething(page: import("@playwright/test").Page, nested = false) {
    await page.evaluate((withNested) => {
      const s = window.__ddStore!.getState() as unknown as {
        addShapeNode: (r: string, p: { x: number; y: number }, z: { w: number; h: number }) => string;
        addNestedNode: (p: { x: number; y: number }, z: { w: number; h: number }, t?: string) => { nestedNodeId: string };
      };
      s.addShapeNode("general/rect", { x: 60, y: 60 }, { w: 140, h: 60 });
      if (withNested) s.addNestedNode({ x: 260, y: 60 }, { w: 200, h: 130 }, "Payments");
    }, nested);
  }

  test("the PNG still downloads, and the tip follows it", async ({ page }) => {
    await gotoFresh(page);
    await drawSomething(page);

    const download = await exportPng(page);
    expect(download.suggestedFilename()).toMatch(/\.png$/);

    const notice = page.getByTestId("nd-notice");
    await expect(notice).toContainText("Copy image with live link");
    await expect(page.getByTestId("nd-notice-action")).toContainText("Try it");
  });

  test("only once, ever - not on the second export nor after a reload", async ({ page }) => {
    await gotoFresh(page);
    await drawSomething(page);

    await exportPng(page);
    await expect(page.getByTestId("nd-notice")).toBeVisible();
    await page.getByTestId("nd-notice-close").click();

    await exportPng(page);
    await expect(page.getByTestId("nd-notice")).toHaveCount(0);

    await reloadApp(page);
    await drawSomething(page);
    await exportPng(page);
    await expect(page.getByTestId("nd-notice")).toHaveCount(0);
  });

  // L3's rider: the PowerPoint line is only worth saying when there is something to zoom into.
  test("mentions the PowerPoint export only when the document has a nested block", async ({ page }) => {
    await gotoFresh(page);
    await drawSomething(page, false);
    await exportPng(page);
    await expect(page.getByTestId("nd-notice")).not.toContainText("Export ▾ › PowerPoint");

    await gotoFresh(page);
    await drawSomething(page, true);
    await exportPng(page);
    await expect(page.getByTestId("nd-notice")).toContainText("Export ▾ › PowerPoint");
  });

  test("'Try it' really copies the live-linked image", async ({ page }) => {
    await gotoFresh(page);
    await drawSomething(page);
    await exportPng(page);

    await page.getByTestId("nd-notice-action").click();
    await expect(page.getByTestId("nd-notice")).toContainText("Copied.");

    const types = await page.evaluate(async () => (await navigator.clipboard.read()).flatMap((i) => i.types));
    expect(types).toContain("image/png");
    expect(types).toContain("text/html");
  });

  // The editable PNG already survives a round trip, so advising a different format is noise.
  test("says nothing after the editable .nedito.png export", async ({ page }) => {
    await gotoFresh(page);
    await drawSomething(page);

    await page.getByTestId("nd-export-menu-trigger").click();
    await Promise.all([
      page.waitForEvent("download"),
      page.getByTestId("nd-export-editable-png").click(),
    ]);

    await expect(page.getByTestId("nd-notice")).toHaveCount(0);
  });
});
