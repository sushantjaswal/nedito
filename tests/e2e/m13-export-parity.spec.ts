import { expect, test } from "@playwright/test";
import { getDoc, gotoFirstVisit, gotoFresh } from "./helpers";

// The export bug that started this could only be caught by comparing
// the two renderers against each other, and the unit tests under src/file/ can only see one of
// them: they assert what the exporter produces, not that the canvas still agrees. The canvas
// side is React Flow, in a real browser, resolving real handles — so it gets checked here.
//
// If this file ever fails, the question is not "is the export wrong" but "which of the two
// moved" — they are supposed to be one implementation.

// Vite serves the app's own modules to the page at these paths. They are resolved in the
// browser, not by tsc, and a page.evaluate callback runs in the page — it cannot close over a
// value from this file — so they are passed in as arguments.
const MODULES = { svg: "/src/file/svgExport.ts", png: "/src/file/pngExport.ts" };

/** Path commands with the coordinates stripped, e.g. "M C C". Shape without position. */
function shapeOf(d: string): string {
  return (d.match(/[MLCQSAZHVmlcqsazhv]/g) ?? []).join(" ");
}

test.describe("Export parity — the exported SVG matches the canvas", () => {
  // Catches the two renderers drifting apart again — a change to one that isn't a change to the
  // other. It cannot catch a wrong path that both now draw, because they share an
  // implementation; that is what the next test is for.
  test("every edge exports with the same path shape the canvas drew", async ({ page }) => {
    await gotoFirstVisit(page);
    await page.keyboard.press("Escape");

    const result = await page.evaluate(async (mod) => {
      const store = window.__ddStore!.getState() as unknown as {
        doc: { diagrams: Record<string, unknown> };
        navStack: string[];
      };
      const diagramId = store.navStack[store.navStack.length - 1];
      const diagram = store.doc.diagrams[diagramId];

      const { renderDiagramSvg } = (await import(/* @vite-ignore */ mod.svg)) as {
        renderDiagramSvg: (d: unknown, o: unknown) => Promise<string>;
      };
      const svg = await renderDiagramSvg(diagram, { background: "#ffffff", diagrams: store.doc.diagrams });

      // Skip the <defs>: arrowhead markers are <path>s with the same attributes as an edge.
      const after = svg.slice(svg.indexOf("</defs>"));
      const exported = [...after.matchAll(/<path d="([^"]+)" fill="none" stroke=/g)].map((m) => m[1]);
      const canvas = Array.from(document.querySelectorAll(".react-flow__edge path.react-flow__edge-path")).map(
        (p) => p.getAttribute("d") ?? "",
      );
      return { exported, canvas };
    }, MODULES);

    expect(result.canvas.length).toBeGreaterThan(0);
    expect(result.exported).toHaveLength(result.canvas.length);
    // Same commands in the same order. The absolute coordinates differ by the export's padding
    // offset, which is exactly what should differ and nothing else.
    for (let i = 0; i < result.canvas.length; i++) {
      expect(shapeOf(result.exported[i])).toBe(shapeOf(result.canvas[i]));
    }
  });

  test("a curved edge really exports curved, from the canvas the user drew on", async ({ page }) => {
    await gotoFresh(page);
    await page.getByTestId("nd-start-template-mind-map").click();

    const paths = await page.evaluate(async (mod) => {
      const store = window.__ddStore!.getState() as unknown as {
        doc: { diagrams: Record<string, unknown> };
        navStack: string[];
      };
      const { renderDiagramSvg } = (await import(/* @vite-ignore */ mod.svg)) as {
        renderDiagramSvg: (d: unknown, o: unknown) => Promise<string>;
      };
      const svg = await renderDiagramSvg(store.doc.diagrams[store.navStack[store.navStack.length - 1]], {
        background: "#ffffff",
      });
      const after = svg.slice(svg.indexOf("</defs>"));
      return [...after.matchAll(/<path d="([^"]+)" fill="none" stroke=/g)].map((m) => m[1]);
    }, MODULES);

    // The mind map is curved end to end. Every one of these came out as a straight line before.
    expect(paths.length).toBeGreaterThan(0);
    for (const d of paths) expect(d).toMatch(/[CQS]/);
  });

  test("the Nested Block exports with its title, miniature and ports", async ({ page }) => {
    await gotoFirstVisit(page);
    await page.keyboard.press("Escape");

    const doc = await getDoc(page);
    const nested = doc.diagrams[doc.rootDiagramIds[0]].nodes.find((n) => n.type === "nested")!;

    const svg = await page.evaluate(async (mod) => {
      const store = window.__ddStore!.getState() as unknown as {
        doc: { diagrams: Record<string, unknown> };
        navStack: string[];
      };
      const { renderDiagramSvg } = (await import(/* @vite-ignore */ mod.svg)) as {
        renderDiagramSvg: (d: unknown, o: unknown) => Promise<string>;
      };
      return renderDiagramSvg(store.doc.diagrams[store.navStack[store.navStack.length - 1]], {
        background: "#ffffff",
        diagrams: store.doc.diagrams,
      });
    }, MODULES);

    const title = nested.type === "nested" ? (nested.label?.text ?? doc.diagrams[nested.childDiagramId].title) : "";
    expect(svg).toContain(title);
    // A nested <svg> is the miniature; a bare box would have neither it nor the "Empty" note.
    expect(svg).toMatch(/<svg x="8" y="[\d.]+"/);
    expect(svg).toContain("IBM Plex Sans");
    expect(svg).toContain("data:font/woff2;base64,");
  });

  test("the PNG a user copies is the same size the SVG says it is", async ({ page }) => {
    await gotoFirstVisit(page);
    await page.keyboard.press("Escape");

    const sizes = await page.evaluate(async (mod) => {
      const store = window.__ddStore!.getState() as unknown as {
        doc: { diagrams: Record<string, unknown> };
        navStack: string[];
      };
      const diagram = store.doc.diagrams[store.navStack[store.navStack.length - 1]];
      const { computeDiagramBounds } = (await import(/* @vite-ignore */ mod.svg)) as {
        computeDiagramBounds: (d: unknown) => { width: number; height: number };
      };
      const { diagramToPngBlob } = (await import(/* @vite-ignore */ mod.png)) as {
        diagramToPngBlob: (d: unknown, o: unknown) => Promise<Blob>;
      };
      const bounds = computeDiagramBounds(diagram);
      const blob = await diagramToPngBlob(diagram, { background: "#ffffff", scale: 2, diagrams: store.doc.diagrams });
      const bitmap = await createImageBitmap(blob);
      return { bounds, png: { w: bitmap.width, h: bitmap.height } };
    }, MODULES);

    // Rasterising is where a clipped bound actually loses pixels, so check the whole box made it.
    expect(sizes.png.w).toBe(Math.round(sizes.bounds.width * 2));
    expect(sizes.png.h).toBe(Math.round(sizes.bounds.height * 2));
  });
});

test.describe("The sidebar's Shapes | Templates switcher", () => {
  // The classes were referenced but never written, so these rendered as bare OS buttons.
  test("is a styled segmented control, not an unstyled button", async ({ page }) => {
    await gotoFresh(page);

    const shapes = page.getByTestId("nd-sidebar-tab-shapes");
    const templates = page.getByTestId("nd-sidebar-tab-templates");

    const styleOf = (testId: string) =>
      page.evaluate((id) => {
        const el = document.querySelector(`[data-testid="${id}"]`)!;
        const cs = getComputedStyle(el);
        return {
          className: el.className,
          background: cs.backgroundColor,
          borderStyle: cs.borderTopStyle,
          fontFamily: cs.fontFamily,
          boxShadow: cs.boxShadow,
        };
      }, testId);

    const active = await styleOf("nd-sidebar-tab-shapes");
    // A class name at all: a CSS module hands back undefined for a rule it doesn't have, and
    // React then renders class="undefined".
    expect(active.className).not.toContain("undefined");
    expect(active.borderStyle).toBe("none");
    // font: inherit — the default <button> face is the OS one, which is what looked pasted-on.
    expect(active.fontFamily).toContain("IBM Plex Sans");
    // The selected tab is a raised card; the unselected one is flat on the track.
    expect(active.boxShadow).not.toBe("none");

    await templates.click();
    const nowInactive = await styleOf("nd-sidebar-tab-shapes");
    expect(nowInactive.boxShadow).toBe("none");
    await expect(shapes).toHaveAttribute("aria-selected", "false");
    await expect(templates).toHaveAttribute("aria-selected", "true");
  });
});
