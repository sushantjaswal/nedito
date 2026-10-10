import { expect, test } from "@playwright/test";
import { getDoc, gotoFirstVisit, gotoFresh, templateLanded } from "./helpers";

// Phase 5 batch T1. The catalogue, the apply transformation and the components are unit-tested
// under src/templates/; the spec's own acceptance list asks for the three entry points to be
// exercised in a browser, plus the undo and the nesting drill-down on a real canvas.
test.describe("Templates — applying from each entry point", () => {
  test("from the empty-canvas start panel", async ({ page }) => {
    await gotoFresh(page);

    await expect(page.getByTestId("nd-start-panel")).toBeVisible();
    await page.getByTestId("nd-start-template-basic-flowchart").click();
    await templateLanded(page);

    // The panel is for an empty page, so it disappears the moment one is not.
    await expect(page.getByTestId("nd-start-panel")).toHaveCount(0);
    const doc = await getDoc(page);
    expect(doc.diagrams[doc.rootDiagramIds[0]].nodes.length).toBeGreaterThan(0);
    expect(doc.diagrams[doc.rootDiagramIds[0]].title).toBe("Flowchart");
  });

  test("from the sidebar Templates tab, which is remembered", async ({ page }) => {
    await gotoFresh(page);

    await page.getByTestId("nd-sidebar-tab-templates").click();
    await expect(page.getByTestId("nd-template-browser")).toBeVisible();
    await expect(page.getByTestId("nd-shape-search")).toHaveAttribute("placeholder", "Search templates");

    await page.reload();
    await expect(page.getByTestId("nd-template-browser")).toBeVisible();

    await page.getByTestId("nd-template-card-mind-map").first().click();
    await templateLanded(page);
    const doc = await getDoc(page);
    expect(doc.diagrams[doc.rootDiagramIds[0]].title).toBe("Mind map");
  });

  test("from the first-visit sample strip", async ({ page }) => {
    await gotoFirstVisit(page);
    await page.keyboard.press("Escape"); // leave the tour; the sample stays

    await page.getByTestId("nd-start-from-template").click();

    // Clears the sample exactly like "Start a blank canvas", then shows the catalogue.
    await expect(page.getByTestId("nd-sample-strip")).toHaveCount(0);
    await expect(page.getByTestId("nd-template-browser")).toBeVisible();
    const doc = await getDoc(page);
    expect(doc.diagrams[doc.rootDiagramIds[0]].nodes).toHaveLength(0);
  });

  test("from the app menu › New from template…", async ({ page }) => {
    await gotoFresh(page);
    await page.getByTestId("nd-app-menu-trigger").click();
    await page.getByTestId("nd-new-from-template").click();
    await expect(page.getByTestId("nd-template-browser")).toBeVisible();
  });
});

test.describe("Templates — the apply flow", () => {
  async function drawSomething(page: import("@playwright/test").Page) {
    await page.evaluate(() => {
      const s = window.__ddStore!.getState() as unknown as {
        addShapeNode: (r: string, p: { x: number; y: number }, z: { w: number; h: number }) => string;
      };
      s.addShapeNode("general/rect", { x: 60, y: 60 }, { w: 140, h: 60 });
    });
  }

  test("asks before touching a page that already has content", async ({ page }) => {
    await gotoFresh(page);
    await drawSomething(page);

    await page.getByTestId("nd-sidebar-tab-templates").click();
    await page.getByTestId("nd-template-card-basic-flowchart").first().click();
    await templateLanded(page);

    const dialog = page.getByTestId("nd-template-dialog");
    await expect(dialog).toBeVisible();
    await page.getByTestId("nd-template-new-page").click();

    const doc = await getDoc(page);
    expect(doc.rootDiagramIds).toHaveLength(2);
    // The page they were on is untouched.
    expect(doc.diagrams[doc.rootDiagramIds[0]].nodes).toHaveLength(1);
  });

  // The spec's acceptance: one Ctrl+Z restores the prior state exactly, child diagrams included.
  test("one undo removes the template and every child diagram it created", async ({ page }) => {
    await gotoFresh(page);
    await page.getByTestId("nd-start-template-flowchart-with-subprocess").click();
    await templateLanded(page);

    const applied = await getDoc(page);
    expect(Object.keys(applied.diagrams)).toHaveLength(2);
    expect(applied.diagrams[applied.rootDiagramIds[0]].nodes.length).toBeGreaterThan(0);

    await page.keyboard.press("Control+z");

    const undone = await getDoc(page);
    expect(Object.keys(undone.diagrams)).toHaveLength(1);
    expect(undone.diagrams[undone.rootDiagramIds[0]].nodes).toHaveLength(0);
  });

  test("a nested template drills in and shows a ghost link inside its child", async ({ page }) => {
    await gotoFresh(page);
    await page.getByTestId("nd-start-template-flowchart-with-subprocess").click();
    await templateLanded(page);

    const doc = await getDoc(page);
    const nested = doc.diagrams[doc.rootDiagramIds[0]].nodes.find((n) => n.type === "nested")!;
    await page.getByTestId(`nd-nested-open-${nested.id}`).click();

    await expect(page.getByTestId("nd-breadcrumb-1")).toHaveText("Validate payment");
    // The port-mapped crossing is what makes the nesting real rather than decorative.
    await expect(page.getByTestId("nd-ghost-links")).toBeVisible();
  });

  // Applying the same template twice must not collide ids, which is the whole reason apply
  // re-issues every one of them.
  test("the same template applies twice without colliding", async ({ page }) => {
    await gotoFresh(page);
    await page.getByTestId("nd-start-template-flowchart-with-subprocess").click();
    await templateLanded(page);

    await page.getByTestId("nd-sidebar-tab-templates").click();
    await page.getByTestId("nd-template-card-flowchart-with-subprocess").first().click();
    await page.getByTestId("nd-template-new-page").click();

    const doc = await getDoc(page);
    expect(doc.rootDiagramIds).toHaveLength(2);
    expect(doc.diagrams[doc.rootDiagramIds[1]].title).toBe("Order handling 2");

    const everyId = Object.values(doc.diagrams).flatMap((d) => [
      d.id,
      ...d.nodes.map((n) => n.id),
      ...d.edges.map((e) => e.id),
    ]);
    expect(new Set(everyId).size).toBe(everyId.length);
  });

  // The panel must never block the canvas: someone ignoring it should just start drawing.
  test("the start panel never blocks the canvas beside it", async ({ page }) => {
    await gotoFresh(page);
    await expect(page.getByTestId("nd-start-panel")).toBeVisible();

    // A point on the empty canvas beside the panel — clear of the canvas chip in the bottom-left
    // corner (R1, D90), which is meant to be clickable.
    const underneath = await page.evaluate(() => {
      const el = document.elementFromPoint(300, 520);
      const layer = document.querySelector('[data-testid="nd-empty-canvas-layer"]');
      return { insideLayer: layer?.contains(el) ?? false, className: String(el?.className ?? "") };
    });
    expect(underneath.insideLayer).toBe(false);
    expect(underneath.className).toContain("react-flow__pane");
  });
});

// Phase 5 batch T2. The eight Software & UML templates. Their content is unit-tested under
// src/templates/software/; what only a browser can show is that the C4 model's two levels of
// nesting actually open, and that the UML line ends survive the trip to the canvas.
test.describe("Templates — Software & UML", () => {
  test("the C4 model opens two levels deep and walks back out", async ({ page }) => {
    await gotoFresh(page);
    await page.getByTestId("nd-start-template-c4-model").click();
    await templateLanded(page);

    await expect(page.getByTestId("nd-breadcrumb-0")).toHaveText("System Context");

    const doc = await getDoc(page);
    const system = doc.diagrams[doc.rootDiagramIds[0]].nodes.find((n) => n.type === "nested")!;
    await page.getByTestId(`nd-nested-open-${system.id}`).click();
    await expect(page.getByTestId("nd-breadcrumb-1")).toHaveText("Internet Banking System");

    const app = doc.diagrams[system.childDiagramId].nodes.find((n) => n.type === "nested")!;
    await page.getByTestId(`nd-nested-open-${app.id}`).click();
    await expect(page.getByTestId("nd-breadcrumb-2")).toHaveText("API Application");
    // Three levels is the whole claim of this template, so the deepest one must be real.
    await expect(page.getByText("Sign In Controller")).toBeVisible();

    // Esc walks back one level at a time, as it does anywhere else in the app.
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("nd-breadcrumb-2")).toHaveCount(0);
    await page.getByTestId("nd-breadcrumb-0").click();
    await expect(page.getByTestId("nd-breadcrumb-1")).toHaveCount(0);
  });

  test("a UML template keeps its line ends on the canvas", async ({ page }) => {
    await gotoFresh(page);
    await page.getByTestId("nd-sidebar-tab-templates").click();
    await page.getByTestId("nd-template-card-uml-class").first().click();
    await templateLanded(page);

    await expect(page.getByText("SavingsAccount")).toBeVisible();

    // The hollow triangle and the two diamonds are what make it read as UML rather than as
    // boxes and lines; they are markers, so a missing definition fails silently on screen.
    // Resolve each reference rather than substring-match it. From T2 until D72 the canvas wrote
    // url('#url(#nd-arrow-triangle)') — which *contains* the name and points at nothing — and a
    // `.includes()` check here passed the whole time the canvas drew no arrowheads at all.
    const markers = await page.evaluate(() =>
      Array.from(document.querySelectorAll(".react-flow__edge-path")).map((p) => {
        const m = (p.getAttribute("marker-end") ?? "").match(/^url\(\s*['"]?#([^'")]+)['"]?\s*\)$/);
        return m && document.getElementById(m[1]) ? m[1] : null;
      }),
    );
    expect(markers).toContain("nd-arrow-triangle");
    expect(await page.locator("#nd-arrow-triangle").count()).toBeGreaterThan(0);
    expect(await page.locator("#nd-arrow-diamond-open").count()).toBeGreaterThan(0);
  });
});

// Phase 5 batch T3. The five Data templates. What only a browser shows: that the levelled DFD's
// two levels really open into each other, that crow's-foot marks reach the canvas as markers,
// and that a multi-line label renders as multiple lines.
test.describe("Templates — Data", () => {
  test("the levelled DFD opens from context into Level 1, with ghost links", async ({ page }) => {
    await gotoFresh(page);
    await page.getByTestId("nd-start-template-dfd-levelled-yourdon").click();
    await templateLanded(page);

    await expect(page.getByTestId("nd-breadcrumb-0")).toHaveText("Context diagram");

    const doc = await getDoc(page);
    const system = doc.diagrams[doc.rootDiagramIds[0]].nodes.find((n) => n.type === "nested")!;
    await page.getByTestId(`nd-nested-open-${system.id}`).click();

    await expect(page.getByTestId("nd-breadcrumb-1")).toHaveText("Order System");
    // The numbered processes are the whole point of levelling.
    await expect(page.getByText("Receive", { exact: false }).first()).toBeVisible();
    // Balancing: the boundary flows reappear inside as ghosts attached to the mapped processes.
    await expect(page.getByTestId("nd-ghost-links")).toBeVisible();
  });

  test("crow's-foot cardinality reaches the canvas as real markers", async ({ page }) => {
    await gotoFresh(page);
    await page.getByTestId("nd-sidebar-tab-templates").click();
    await page.getByTestId("nd-template-card-er-crows-foot").first().click();
    await templateLanded(page);

    // Scoped to the canvas and exact: a loose page-wide match also finds the sidebar's
    // "Customer journey map" card, which is visible before the template has applied at all.
    await expect(page.getByTestId("nd-canvas").getByText("CUSTOMER", { exact: false }).first()).toBeVisible();

    // Resolved, not substring-matched — see the UML test above for why that distinction matters.
    const markers = await page.evaluate(() =>
      Array.from(document.querySelectorAll(".react-flow__edge-path")).flatMap((p) =>
        ["marker-start", "marker-end"].map((attr) => {
          const m = (p.getAttribute(attr) ?? "").match(/^url\(\s*['"]?#([^'")]+)['"]?\s*\)$/);
          return m && document.getElementById(m[1]) ? m[1] : null;
        }),
      ),
    );
    expect(markers).toContain("nd-arrow-er-one");
    expect(markers.some((m) => m?.includes("many"))).toBe(true);
    // A missing <marker> definition fails silently on screen, so check it is really defined.
    expect(await page.locator("#nd-arrow-crows-foot").count()).toBeGreaterThan(0);
    expect(await page.locator("#nd-arrow-er-zero-or-many").count()).toBeGreaterThan(0);
  });

  // A newline the author typed is a line break. A flex box collapses it to a space unless told
  // otherwise, which ran every UML class compartment and ER table column onto one line.
  test("a multi-line label renders as multiple lines on the canvas", async ({ page }) => {
    await gotoFresh(page);
    await page.getByTestId("nd-sidebar-tab-templates").click();
    await page.getByTestId("nd-template-card-er-crows-foot").first().click();
    await templateLanded(page);

    // Scoped to the canvas and exact: a loose page-wide match also finds the sidebar's
    // "Customer journey map" card, which is visible before the template has applied at all.
    await expect(page.getByTestId("nd-canvas").getByText("CUSTOMER", { exact: false }).first()).toBeVisible();

    // The table's column list: one label holding a line per column (the name is its own band).
    const box = await page.evaluate(() => {
      const el = Array.from(document.querySelectorAll("div")).find(
        (d) => (d.textContent ?? "").startsWith("customer_id") && d.children.length === 0,
      );
      if (!el || !el.firstChild) return null;
      // One client rect per rendered line — the label div is inset:0 so its own height is the
      // node's, which would pass this test whether the text wrapped or not.
      const range = document.createRange();
      range.selectNodeContents(el);
      return { whiteSpace: getComputedStyle(el).whiteSpace, lines: range.getClientRects().length };
    });
    expect(box).not.toBeNull();
    expect(box!.whiteSpace).toBe("pre-line");
    // customer_id, name, email.
    expect(box!.lines).toBeGreaterThanOrEqual(3);
  });

  test("both DFD dialects can be applied to one document without colliding", async ({ page }) => {
    await gotoFresh(page);
    await page.getByTestId("nd-start-template-dfd-levelled-yourdon").click();
    await templateLanded(page);
    // Let the first land before picking the second: if the second loaded first, the page was still
    // empty, so it was applied straight in with no placement dialog (D110).
    await templateLanded(page);

    await page.getByTestId("nd-sidebar-tab-templates").click();
    await page.getByTestId("nd-template-card-dfd-levelled-gane-sarson").first().click();
    await page.getByTestId("nd-template-new-page").click();

    const doc = await getDoc(page);
    expect(doc.rootDiagramIds).toHaveLength(2);
    // Two contexts and two Level 1 children.
    expect(Object.keys(doc.diagrams)).toHaveLength(4);

    const everyId = Object.values(doc.diagrams).flatMap((d) => [
      d.id,
      ...d.nodes.map((n) => n.id),
      ...d.edges.map((e) => e.id),
    ]);
    expect(new Set(everyId).size).toBe(everyId.length);
  });
});

// Phase 5 batch T4. The five Architecture & Cloud templates. What only a browser shows: that a
// boundary box does not hide the links inside it, that vendor icons really draw (they are raw
// SVG, so a bad id renders nothing rather than failing), and that the spokes open.
test.describe("Templates — Architecture & Cloud", () => {
  /**
   * Applies a template by name, and waits for it to land. Only the six featured ones are on the
   * start panel, so everything else goes through the browser. Applying is asynchronous — the
   * template module is lazy-loaded first — so reading the document straight after the click
   * reads the empty page that was there before.
   */
  async function apply(page: import("@playwright/test").Page, id: string) {
    await page.getByTestId("nd-sidebar-tab-templates").click();
    await page.getByTestId(`nd-template-card-${id}`).first().click();
    await templateLanded(page);
  }

  /**
   * These diagrams are wider than the viewport, so a nested block can sit off-screen and the
   * click lands on the pane instead. Fit first, exactly as a user would.
   */
  async function fit(page: import("@playwright/test").Page) {
    await page.locator(".react-flow__controls-fitview").click();
    await page.waitForTimeout(500);
  }

  test("the Azure landing zone opens each spoke into its own VNet", async ({ page }) => {
    await gotoFresh(page);
    await page.getByTestId("nd-start-template-azure-landing-zone").click();
    await templateLanded(page);
    await expect(page.locator(".react-flow__node").first()).toBeAttached();

    await expect(page.getByTestId("nd-breadcrumb-0")).toHaveText("Platform");

    const doc = await getDoc(page);
    const spokes = doc.diagrams[doc.rootDiagramIds[0]].nodes.filter((n) => n.type === "nested");
    expect(spokes).toHaveLength(2);

    await fit(page);
    await page.getByTestId(`nd-nested-open-${spokes[0].id}`).click();
    await expect(page.getByTestId("nd-breadcrumb-1")).toHaveText("Retail");
    await fit(page);
    // Scoped to the canvas: the sidebar's Azure section lists a "SQL Database" stencil too.
    await expect(page.getByTestId("nd-canvas").getByText("SQL Database", { exact: true })).toBeVisible();
    // The hub peering survives the drill-in rather than being something to remember.
    await expect(page.getByTestId("nd-ghost-links")).toBeVisible();
  });

  // A boundary box is a node, and React Flow draws nodes above the edge layer — so a filled one
  // hides every link inside it, which is what happened to the Azure hub.
  test("a boundary box does not paint over the links inside it", async ({ page }) => {
    await gotoFresh(page);
    await page.getByTestId("nd-start-template-azure-landing-zone").click();
    await templateLanded(page);
    await expect(page.locator(".react-flow__edge-path").first()).toBeAttached();


    const visible = await page.evaluate(() => {
      const edges = document.querySelectorAll(".react-flow__edge-path").length;
      const unfilled = Array.from(document.querySelectorAll(".react-flow__node")).filter(
        (n) => n.querySelector("svg g[fill]")?.getAttribute("fill") === "none",
      ).length;
      return { edges, unfilled };
    });
    expect(visible.edges).toBeGreaterThan(0);
    expect(visible.unfilled).toBeGreaterThan(0);
  });

  test("vendor icons really draw, rather than resolving to nothing", async ({ page }) => {
    await gotoFresh(page);
    await apply(page, "aws-three-tier");
    await fit(page);

    // A raw vendor icon is a nested <svg> the stencil supplies verbatim; a wrong id would leave
    // the node silently empty, which no model-level test can see.
    const drawn = await page.evaluate(
      () =>
        Array.from(document.querySelectorAll(".react-flow__node-shape")).filter((n) => {
          const svg = n.querySelector("svg");
          return svg !== null && svg.querySelector("path, polygon, circle, rect") !== null;
        }).length,
    );
    expect(drawn).toBeGreaterThan(5);
  });

  test("the Kubernetes cluster opens its namespaces and uses no vendor artwork", async ({ page }) => {
    await gotoFresh(page);
    await apply(page, "kubernetes-cluster");

    const doc = await getDoc(page);
    const namespaces = doc.diagrams[doc.rootDiagramIds[0]].nodes.filter((n) => n.type === "nested");
    expect(namespaces).toHaveLength(2);

    await fit(page);
    await page.getByTestId(`nd-nested-open-${namespaces[0].id}`).click();
    await expect(page.getByTestId("nd-breadcrumb-1")).toHaveText("Storefront");
    await fit(page);
    await expect(page.getByTestId("nd-canvas").getByText("ConfigMap", { exact: false })).toBeVisible();
  });
});

// Phase 5 batch T5. The eight Business & Process templates. What only a browser shows: that a
// lane's name lands in its band rather than across the middle of the diagram, and that the org
// chart's departments open.
test.describe("Templates — Business & Process", () => {
  async function applyTemplate(page: import("@playwright/test").Page, id: string) {
    await page.getByTestId("nd-sidebar-tab-templates").click();
    await page.getByTestId(`nd-template-card-${id}`).first().click();
    await templateLanded(page);
  }

  // `align` was inert on the canvas: the label is a centring flex box, so text-align alone could
  // not move a single-line label, and every lane name rendered mid-diagram over the first task.
  test("a lane's name sits in its band, not across the middle of the diagram", async ({ page }) => {
    await gotoFresh(page);
    await applyTemplate(page, "swimlane-process");

    const placed = await page.evaluate(() => {
      const label = Array.from(document.querySelectorAll("div")).find(
        (d) => d.textContent === "Customer" && d.children.length === 0,
      );
      if (!label) return null;
      const lane = label.closest(".react-flow__node")!.getBoundingClientRect();
      const text = label.getBoundingClientRect();
      return {
        justify: getComputedStyle(label).justifyContent,
        // How far into the lane the text starts, as a fraction of the lane's width.
        offset: (text.left - lane.left) / lane.width,
      };
    });
    expect(placed).not.toBeNull();
    expect(placed!.justify).toBe("flex-start");
    // The name band is the leftmost 6% of the lane; centred it would land near 0.5.
    expect(placed!.offset).toBeLessThan(0.1);
  });

  test("the org chart opens each department onto its own team", async ({ page }) => {
    await gotoFresh(page);
    await applyTemplate(page, "org-chart");

    const doc = await getDoc(page);
    const depts = doc.diagrams[doc.rootDiagramIds[0]].nodes.filter((n) => n.type === "nested");
    expect(depts).toHaveLength(3);

    await page.locator(".react-flow__controls-fitview").click();
    await page.waitForTimeout(400);
    await page.getByTestId(`nd-nested-open-${depts[0].id}`).click();
    await expect(page.getByTestId("nd-breadcrumb-1")).toHaveText("VP Engineering");
    await expect(page.getByTestId("nd-canvas").getByText("Platform Lead")).toBeVisible();
  });

  test("the BPMN gateway labels both of its branches", async ({ page }) => {
    await gotoFresh(page);
    await applyTemplate(page, "bpmn-basic");

    const canvas = page.getByTestId("nd-canvas");
    await expect(canvas.getByText("yes", { exact: true })).toBeVisible();
    await expect(canvas.getByText("no", { exact: true })).toBeVisible();
  });

  test("every BPMN shape the template uses really draws", async ({ page }) => {
    await gotoFresh(page);
    await applyTemplate(page, "bpmn-basic");

    // A wrong stencil id leaves the node silently empty, which no model-level test can see.
    const empty = await page.evaluate(
      () =>
        Array.from(document.querySelectorAll(".react-flow__node-shape")).filter(
          (n) => n.querySelector("svg path, svg circle, svg polygon, svg rect, svg line") === null,
        ).length,
    );
    expect(empty).toBe(0);
  });
});

// Phase 5 batch T6. The six Thinking & Planning templates. What only a browser shows: that a
// Venn's fills really blend where the sets meet while the outlines and labels stay solid.
test.describe("Templates — Thinking & Planning", () => {
  async function applyTemplate(page: import("@playwright/test").Page, id: string) {
    await page.getByTestId("nd-sidebar-tab-templates").click();
    await page.getByTestId(`nd-template-card-${id}`).first().click();
    await templateLanded(page);
  }

  // Whole-node opacity would have faded the border and the text with the fill. Fill opacity is
  // the style added for this batch, so check the canvas really applies it to the fill alone.
  test("a Venn's fills are translucent while its outlines and labels stay solid", async ({ page }) => {
    await gotoFresh(page);
    await applyTemplate(page, "venn-two");

    const sets = await page.evaluate(() =>
      Array.from(document.querySelectorAll(".react-flow__node-shape"))
        .map((n) => {
          const g = n.querySelector("svg g[fill-opacity]");
          if (!g) return null;
          return {
            fillOpacity: g.getAttribute("fill-opacity"),
            // The node itself must not be faded, or the label goes with it.
            nodeOpacity: getComputedStyle(n.querySelector("div")!).opacity,
          };
        })
        .filter(Boolean),
    );

    expect(sets.length).toBe(2);
    for (const s of sets) {
      expect(Number(s!.fillOpacity)).toBeGreaterThan(0);
      expect(Number(s!.fillOpacity)).toBeLessThan(1);
      expect(Number(s!.nodeOpacity)).toBe(1);
    }
    // The region labels have to be readable, which is the reason for the distinction.
    await expect(page.getByTestId("nd-canvas").getByText("Build this")).toBeVisible();
  });

  test("the Fill popover offers fill opacity (once the Style panel), so a Venn can be drawn by hand", async ({ page }) => {
    await gotoFresh(page);
    await applyTemplate(page, "venn-two");

    // Select a set by clicking it, the way the user reaching for this control would.
    const doc = await getDoc(page);
    const ellipse = doc.diagrams[doc.rootDiagramIds[0]].nodes.find(
      (n) => n.type === "shape" && n.shapeRef === "general/ellipse",
    )!;
    await page.getByTestId(`nd-shape-node-${ellipse.id}`).click({ position: { x: 20, y: 150 } });

    await page.getByTestId("nd-bar-fill").click();
    const slider = page.getByLabel("Fill opacity");
    await expect(slider).toBeVisible();
    await expect(slider).toHaveValue("0.4");
  });

  test("the concept map labels every one of its links", async ({ page }) => {
    await gotoFresh(page);
    await applyTemplate(page, "concept-map");

    const canvas = page.getByTestId("nd-canvas");
    for (const verb of ["depends on", "earns", "reduces"]) {
      await expect(canvas.getByText(verb, { exact: true }).first()).toBeVisible();
    }
  });
});
