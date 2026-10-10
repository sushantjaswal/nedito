import type { Page } from "@playwright/test";

// Builds a share link the way an *outside* implementation would: plain Node APIs, following
// only what docs/FORMAT.md and src/share/urlCodec.ts describe. Deliberately not importing the
// app's own encoder — that would make these tests agree with whatever the app happens to do,
// where the point of an open format is that someone else can produce a readable link.

function base64url(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function gzip(text: string): Promise<Uint8Array> {
  const source = new ReadableStream<BufferSource>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(text));
      controller.close();
    },
  });
  const compressed = source.pipeThrough(new CompressionStream("gzip"));
  return new Uint8Array(await new Response(compressed).arrayBuffer());
}

const FORMAT_VERSION = 2;

function shape(id: string, x: number, y: number, label: string) {
  return {
    id,
    type: "shape",
    shapeRef: "general/rect",
    position: { x, y },
    size: { w: 160, h: 70 },
    z: 1,
    style: { fill: "#ffffff", stroke: "#1e2733", strokeWidth: 1 },
    label: { text: label },
  };
}

/** Two levels: a root page holding a shape and a nested block, and the child behind it. */
export function sharedDoc() {
  return {
    format: "nedito",
    formatVersion: FORMAT_VERSION,
    meta: {
      title: "Shared Architecture",
      created: "2026-09-02T00:00:00.000Z",
      modified: "2026-09-02T00:00:00.000Z",
      appVersion: "0.0.1",
    },
    rootDiagramIds: ["root"],
    diagrams: {
      root: {
        id: "root",
        title: "Main",
        nodes: [
          shape("gateway", 60, 80, "API Gateway"),
          {
            id: "svc",
            type: "nested",
            childDiagramId: "child",
            position: { x: 320, y: 60 },
            size: { w: 240, h: 150 },
            z: 2,
            style: {},
            label: { text: "Payment Service" },
            collapsed: { icons: [] },
            ports: [],
          },
        ],
        edges: [],
      },
      child: {
        id: "child",
        title: "Payment Service",
        nodes: [shape("ledger", 80, 90, "Ledger")],
        edges: [],
      },
    },
  };
}

export async function shareUrlFor(doc: unknown, openAtDiagramId?: string): Promise<string> {
  const payload = base64url(await gzip(JSON.stringify(doc, null, 2)));
  const path = openAtDiagramId ? `&p=${encodeURIComponent(openAtDiagramId)}` : "";
  return `/#d=${payload}&v=${FORMAT_VERSION}${path}`;
}

/** Opens a share link on a clean profile, with the first-visit sample suppressed. */
export async function gotoShareLink(page: Page, url: string): Promise<void> {
  await page.goto("/");
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem("nedito:collapsedSections", "[]");
    localStorage.setItem("nedito:collapsedGroups", '["cloud"]'); // see helpers.ts
    localStorage.setItem("nedito:demoDismissed", "true");
  });
  await openShareLink(page, url);
}

/**
 * Navigates to a share link and forces a real document load.
 *
 * Going from "/" to "/#d=..." differs only in the fragment, which the browser treats as a
 * same-document navigation: no reload, no remount, so the app would still be sitting in the
 * editor it booted into. The reload is what makes this the fresh page load a recipient
 * clicking the link in their mail client actually gets.
 */
export async function openShareLink(page: Page, url: string): Promise<void> {
  await page.goto(url);
  await page.reload();
}
