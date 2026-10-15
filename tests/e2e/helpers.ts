import { expect, type Page } from "@playwright/test";
import type { DiagramDocument } from "../../src/model/types";

// window.__ddStore is a dev-only debug hook (see src/canvas/DiagramCanvas.tsx, gated by
// import.meta.env.DEV) exposing the Zustand store outside React — used here for reliable
// state assertions instead of brittle DOM-id scraping (node/edge ids are nanoid-random).
declare global {
  interface Window {
    __ddStore?: { getState: () => { doc: DiagramDocument; currentDiagramId: () => string; navStack: string[] } };
    __rf?: {
      fitView?: (options?: { padding?: number }) => void;
      getViewport?: () => { x: number; y: number; zoom: number };
    };
  }
}

let freshToken = 0;

/**
 * Opens the app on storage seeded with `items` and nothing else — cleared *before any app code
 * runs*, by a one-shot init script. Clearing from a live app page and then reloading (as this used
 * to) races that page's own debounced autosave: it could write the old diagram back in between,
 * and since silent restore (R5, D94) the reload brought it back (found flaky 2026-10-05). Each
 * call has its own token, so calling this twice in one test clears both times, while an ordinary
 * reload later in the test keeps what the test saved.
 */
export async function gotoWithStorage(page: Page, items: Record<string, string>): Promise<void> {
  const token = `nd-fresh-${++freshToken}-${Date.now()}`;
  await page.addInitScript(
    ({ token, items }) => {
      if (sessionStorage.getItem(token)) return;
      sessionStorage.setItem(token, "1");
      localStorage.clear();
      for (const [k, v] of Object.entries(items)) localStorage.setItem(k, v);
    },
    { token, items },
  );
  await page.goto("/");
}

export async function gotoFresh(page: Page): Promise<void> {
  await gotoWithStorage(page, {
    // Sections default to collapsed on a genuinely first-ever visit (D31, collapsedSections.ts)
    // — these specs are about other features and want the sidebar's shapes immediately
    // clickable, so seed the "already expanded everything" state a returning user would have...
    "nedito:collapsedSections": "[]",
    // ...except the Cloud group: its 1,064 vendor icons are drawn on every page load when open,
    // which no spec here needs and which made long runs slow enough to time out (2026-10-05).
    "nedito:collapsedGroups": '["cloud"]',
    // Suppress the first-visit sample diagram: every spec other than the onboarding one is
    // about a feature, not about onboarding, and expects to start on an empty canvas. Use
    // gotoFirstVisit() below to exercise the sample deliberately.
    "nedito:demoDismissed": "true",
    // A returning visitor's startup screen (N3): gone as soon as the canvas is, not held for
    // the first-visit 1.8s. m26 exercises the first-visit one deliberately.
    "nedito:splashSeen": "1",
  });
}

/** A genuinely first-ever visit: no autosave, no onboarding flags, so the sample loads. */
export async function gotoFirstVisit(page: Page): Promise<void> {
  await gotoWithStorage(page, {
    "nedito:collapsedSections": "[]",
    "nedito:collapsedGroups": '["cloud"]',
  });
}

export async function getDoc(page: Page): Promise<DiagramDocument> {
  return page.evaluate(() => window.__ddStore!.getState().doc);
}

/** Opens the command palette from its top-bar button, optionally typing a query (R2, D91). */
export async function openPalette(page: Page, query = ""): Promise<void> {
  await page.getByTestId("nd-command-button").click();
  if (query) await page.getByTestId("nd-command-input").fill(query);
}

/** Runs a command from the palette by its id — where the Edit, View, Arrange and Extras menus' items went. */
export async function runCommand(page: Page, id: string, query = ""): Promise<void> {
  await openPalette(page, query);
  await page.getByTestId(`nd-command-${id}`).click();
}

export async function currentDiagramId(page: Page): Promise<string> {
  return page.evaluate(() => window.__ddStore!.getState().currentDiagramId());
}

/**
 * Waits for a template to land on the page being viewed. Applying one loads its module first, and
 * a dev server compiling it on first request has taken over 10s under load — past the 5s default
 * of an ordinary expect, and long enough for a second template to land first (D110, D111).
 */
export async function templateLanded(page: Page): Promise<void> {
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const s = window.__ddStore!.getState();
          return (s.doc.diagrams[s.currentDiagramId()]?.nodes.length ?? 0) > 0;
        }),
      { timeout: 20_000 },
    )
    .toBe(true);
}
