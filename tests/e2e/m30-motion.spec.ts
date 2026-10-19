// Diagram motion, A1 (D116), in a real browser: Flow and Pulse authored from the context bar and
// the line toolbar, every off switch, the reader's own switch in the viewer, and the resting state
// a still export draws.
import { expect, test, type Page } from "@playwright/test";
import { getDoc, gotoFresh, reloadApp } from "./helpers";

interface MotionStore {
  addShapeNode: (r: string, p: { x: number; y: number }, z: { w: number; h: number }) => string;
  setNodeLabel: (id: string, l: { text: string }) => void;
  connect: (a: { sourceNodeId: string; sourceHandleId: string; targetNodeId: string; targetHandleId: string }) => string;
  setSelection: (n: string[], e: string[]) => void;
  clearSelection: () => void;
  setEdgeMotion: (ids: string[], m: { kind: string; speed?: string } | null) => void;
  setNodeMotion: (ids: string[], p: Record<string, unknown>) => void;
  setMotionEnabled: (on: boolean) => void;
}

async function build(page: Page) {
  return page.evaluate(() => {
    const s = window.__ddStore!.getState() as unknown as MotionStore;
    const a = s.addShapeNode("general/rect", { x: 100, y: 200 }, { w: 150, h: 64 });
    const b = s.addShapeNode("general/rect", { x: 450, y: 200 }, { w: 150, h: 64 });
    s.setNodeLabel(a, { text: "Gateway" });
    s.setNodeLabel(b, { text: "Payments" });
    const e = s.connect({ sourceNodeId: a, sourceHandleId: "right", targetNodeId: b, targetHandleId: "left" });
    s.clearSelection();
    return { a, b, e };
  });
}

const animation = (page: Page, selector: string) => page.locator(selector).first().evaluate((el) => getComputedStyle(el).animationName);

test.beforeEach(async ({ page }) => gotoFresh(page));

test("Flow is chosen from the line's own toolbar, marches, and is saved on that line only", async ({ page }) => {
  const { e } = await build(page);
  await page.evaluate((id) => (window.__ddStore!.getState() as unknown as MotionStore).setSelection([], [id]), e);
  await page.getByTestId("nd-edge-toolbar").getByRole("button", { name: "Motion" }).click();
  await page.getByRole("radiogroup", { name: "Line motion" }).getByRole("radio", { name: "Flow" }).click();
  await page.getByRole("radiogroup", { name: "Speed" }).getByRole("radio", { name: "Fast" }).click();

  const doc = await getDoc(page);
  const page1 = doc.diagrams[doc.rootDiagramIds[0]];
  expect(page1.edges[0].motion).toEqual({ kind: "flow", speed: "fast" });
  expect(await animation(page, ".nd-flow")).toBe("nd-flow");
  const dash = await page.locator(".nd-flow").first().evaluate((el) => getComputedStyle(el).strokeDasharray);
  expect(dash).toBe("8px, 6px");

  await page.getByRole("radiogroup", { name: "Line motion" }).getByRole("radio", { name: "Off" }).click();
  const after = await getDoc(page);
  expect("motion" in after.diagrams[after.rootDiagramIds[0]].edges[0]).toBe(false);
  await expect(page.locator(".nd-flow")).toHaveCount(0);
});

test("Pulse is chosen from the shape's context bar, with a ripple, and glows", async ({ page }) => {
  const { a } = await build(page);
  await page.evaluate((id) => (window.__ddStore!.getState() as unknown as MotionStore).setSelection([id], []), a);
  await page.getByTestId("nd-bar-motion").click();
  await page.getByTestId("nd-motion-pulse").check();
  await page.getByTestId("nd-motion-ripple").check();
  const doc = await getDoc(page);
  expect(doc.diagrams[doc.rootDiagramIds[0]].nodes.find((n) => n.id === a)!.motion).toEqual({ pulse: { ripple: true } });
  const node = `.react-flow__node[data-id="${a}"]`;
  // The glow layer carries the pulse (only its opacity animates, D116).
  expect(await animation(page, `${node} :is(.nd-glow, .nd-glow-shape)`)).toBe("nd-glow");
  expect(await animation(page, `${node} :is(.nd-ripple, .nd-ripple-shape)`)).toBe("nd-ripple");
});

test("every off switch stops it: Preferences, reduced motion, and low detail far out", async ({ page }) => {
  const { a, e } = await build(page);
  await page.evaluate(({ a, e }) => {
    const s = window.__ddStore!.getState() as unknown as MotionStore;
    s.setEdgeMotion([e], { kind: "flow" });
    s.setNodeMotion([a], { pulse: {} });
  }, { a, e });
  const both = async () => [await animation(page, ".nd-flow"), await animation(page, ":is(.nd-glow, .nd-glow-shape)")];
  expect(await both()).toEqual(["nd-flow", "nd-glow"]);

  // Preferences.
  await page.getByTestId("nd-app-menu-trigger").click();
  await page.getByText("Preferences").click();
  await page.getByTestId("nd-pref-motion").uncheck();
  await page.keyboard.press("Escape");
  expect(await both()).toEqual(["none", "none"]);
  // Still drawn at rest: the dashes stand.
  expect(await page.locator(".nd-flow").first().evaluate((el) => getComputedStyle(el).strokeDasharray)).toBe("8px, 6px");
  // Remembered by this browser. Let the diagram's motion reach the autosave first (it waits 800ms
  // after the last change), or the reload brings back a still diagram and checks nothing (D120).
  await expect.poll(() => page.evaluate(() => (localStorage.getItem("nedito:autosave") ?? "").includes('"pulse"'))).toBe(true);
  await reloadApp(page);
  await expect(page.locator(".nd-flow")).toHaveCount(1);
  expect(await both()).toEqual(["none", "none"]);
  await page.evaluate(() => (window.__ddStore!.getState() as unknown as MotionStore).setMotionEnabled(true));
  expect(await both()).toEqual(["nd-flow", "nd-glow"]);

  // The reader's system setting.
  await page.emulateMedia({ reducedMotion: "reduce" });
  expect(await both()).toEqual(["none", "none"]);
  await page.emulateMedia({ reducedMotion: "no-preference" });

  // Low detail, far out (P1).
  await page.evaluate(() => (window.__rf as unknown as { setViewport: (v: object) => void }).setViewport({ x: 0, y: 0, zoom: 0.3 }));
  await expect.poll(both).toEqual(["none", "none"]);
});

test("in the share-link viewer the reader has their own Motion switch; a still diagram shows none", async ({ page }) => {
  const { a } = await build(page);
  const link = async () =>
    page.evaluate(async () => {
      const m = await import("/src/share/urlCodec.ts" as string);
      return (await m.createShareLink(window.__ddStore!.getState().doc, `${location.origin}/`)).url as string;
    });
  // No motion: no switch.
  const still = await link();
  await page.goto("about:blank");
  await page.goto(still);
  await expect(page.getByTestId("nd-viewer-shell")).toBeVisible();
  await expect(page.getByTestId("nd-viewer-motion")).toHaveCount(0);

  // With motion: the switch, and the version the link says is 6.
  await gotoFresh(page);
  const again = await build(page);
  await page.evaluate((id) => (window.__ddStore!.getState() as unknown as MotionStore).setNodeMotion([id], { pulse: {} }), again.a);
  const moving = await link();
  expect(moving).toMatch(/[#&]v=6(&|$)/);
  await page.goto("about:blank");
  await page.goto(moving);
  const button = page.getByTestId("nd-viewer-motion");
  await expect(button).toHaveText("Motion on");
  expect(await animation(page, ":is(.nd-glow, .nd-glow-shape)")).toBe("nd-glow");
  await button.click();
  await expect(button).toHaveText("Motion off");
  expect(await animation(page, ":is(.nd-glow, .nd-glow-shape)")).toBe("none");
  void a;
});

test("a still SVG export draws a Flow line at rest — its dashes — and no trace of Pulse", async ({ page }) => {
  const { a, e } = await build(page);
  await page.evaluate(({ a, e }) => {
    const s = window.__ddStore!.getState() as unknown as MotionStore;
    s.setEdgeMotion([e], { kind: "flow" });
    s.setNodeMotion([a], { pulse: { ripple: true } });
  }, { a, e });
  const svg = await page.evaluate(async () => {
    const m = await import("/src/file/svgExport.ts" as string);
    const s = window.__ddStore!.getState();
    return m.diagramToSvg(s.doc.diagrams[s.currentDiagramId()]) as string;
  });
  expect(svg).toContain('stroke-dasharray="8 6"');
  expect(svg).not.toMatch(/nd-pulse|nd-glow|nd-ripple|nd-flow|animation/);
});

test("a flowing line's direction: along, reversed or both ways (A1b, D118)", async ({ page }) => {
  const { e } = await build(page);
  await page.evaluate((id) => {
    const s = window.__ddStore!.getState() as unknown as MotionStore;
    s.setEdgeMotion([id], { kind: "flow" });
    s.setSelection([], [id]);
  }, e);
  await page.getByTestId("nd-edge-toolbar").getByRole("button", { name: "Motion" }).click();
  const direction = page.getByRole("radiogroup", { name: "Direction" });
  await expect(direction.getByRole("radio", { name: "Along the line" })).toHaveAttribute("aria-checked", "true");
  const vars = () => page.locator(".nd-flow").first().evaluate((el) => ({ shift: el.style.getPropertyValue("--nd-flow-shift"), turn: getComputedStyle(el).animationDirection }));
  expect(await vars()).toEqual({ shift: "-14px", turn: "normal" });

  await direction.getByRole("radio", { name: "Reversed" }).click();
  expect(await vars()).toEqual({ shift: "14px", turn: "normal" });
  let doc = await getDoc(page);
  expect(doc.diagrams[doc.rootDiagramIds[0]].edges[0].motion).toEqual({ kind: "flow", direction: "reverse" });

  await direction.getByRole("radio", { name: "Both ways" }).click();
  expect(await vars()).toEqual({ shift: "-56px", turn: "alternate" });

  await direction.getByRole("radio", { name: "Along the line" }).click();
  doc = await getDoc(page);
  expect(doc.diagrams[doc.rootDiagramIds[0]].edges[0].motion).toEqual({ kind: "flow" });
});

test("Packets send a dot along the line, resting part of the way along when still (A3, D119)", async ({ page }) => {
  const { e } = await build(page);
  await page.evaluate((id) => (window.__ddStore!.getState() as unknown as MotionStore).setSelection([], [id]), e);
  await page.getByTestId("nd-edge-toolbar").getByRole("button", { name: "Motion" }).click();
  await page.getByRole("radiogroup", { name: "Line motion" }).getByRole("radio", { name: "Packets" }).click();
  const doc = await getDoc(page);
  expect(doc.diagrams[doc.rootDiagramIds[0]].edges[0].motion).toEqual({ kind: "packets" });

  const packet = page.getByTestId("nd-packet");
  await expect(packet.locator("animateMotion")).toHaveCount(1);
  const shown = () =>
    packet.evaluate((g) => ({
      moving: getComputedStyle(g.querySelector(".nd-packet-moving")!).display !== "none",
      rest: getComputedStyle(g.querySelector(".nd-packet-rest")!).display !== "none",
    }));
  expect(await shown()).toEqual({ moving: true, rest: false });
  await page.evaluate(() => (window.__ddStore!.getState() as unknown as MotionStore).setMotionEnabled(false));
  expect(await shown()).toEqual({ moving: false, rest: true });
  await page.evaluate(() => (window.__ddStore!.getState() as unknown as MotionStore).setMotionEnabled(true));
  await page.emulateMedia({ reducedMotion: "reduce" });
  expect(await shown()).toEqual({ moving: false, rest: true });
  await page.emulateMedia({ reducedMotion: "no-preference" });

  // A still export draws the resting dot.
  const svg = await page.evaluate(async () => {
    const m = await import("/src/file/svgExport.ts" as string);
    const s = window.__ddStore!.getState();
    return m.diagramToSvg(s.doc.diagrams[s.currentDiagramId()]) as string;
  });
  expect(svg).toMatch(/<circle cx="[\d.]+" cy="[\d.]+" r="4"/);
  expect(svg).not.toContain("animateMotion");
});

test("Throughput's volume is the line's weight, on screen and in a still export (A3, D119)", async ({ page }) => {
  const { e } = await build(page);
  await page.evaluate((id) => (window.__ddStore!.getState() as unknown as MotionStore).setSelection([], [id]), e);
  await page.getByTestId("nd-edge-toolbar").getByRole("button", { name: "Motion" }).click();
  await page.getByRole("radiogroup", { name: "Line motion" }).getByRole("radio", { name: "Throughput" }).click();
  await page.getByRole("radiogroup", { name: "Volume" }).getByRole("radio", { name: "Volume 5" }).click();
  const doc = await getDoc(page);
  expect(doc.diagrams[doc.rootDiagramIds[0]].edges[0].motion).toEqual({ kind: "throughput", volume: 5 });
  // Selected lines draw at least 2.5 wide, so deselect to read the line's own weight.
  await page.evaluate(() => (window.__ddStore!.getState() as unknown as MotionStore).clearSelection());
  const width = await page.locator(".nd-flow").first().evaluate((el) => parseFloat(getComputedStyle(el).strokeWidth));
  // 2.35× the line's own width (1px by default) at volume 5.
  expect(width).toBeCloseTo(2.35, 2);
  const svg = await page.evaluate(async () => {
    const m = await import("/src/file/svgExport.ts" as string);
    const s = window.__ddStore!.getState();
    return m.diagramToSvg(s.doc.diagrams[s.currentDiagramId()]) as string;
  });
  expect(svg).toContain('stroke-width="2.35"');
});

test("Health puts a status badge on a shape that says it is set by hand; degraded blinks until motion is off (A4, D120)", async ({ page }) => {
  const { a } = await build(page);
  await page.evaluate((id) => (window.__ddStore!.getState() as unknown as MotionStore).setSelection([id], []), a);
  await page.getByTestId("nd-bar-motion").click();
  await page.getByTestId("nd-motion-health-degraded").click();
  const badge = page.locator(`.react-flow__node[data-id="${a}"]`).getByTestId("nd-health");
  await expect(badge).toBeVisible();
  await expect(badge).toHaveAttribute("title", /set by the author, not live/);
  await expect(badge).toHaveAttribute("aria-label", "Status: Degraded (set by the author)");
  expect(await badge.evaluate((el) => getComputedStyle(el).animationName)).toBe("nd-health-blink");
  await page.evaluate(() => (window.__ddStore!.getState() as unknown as MotionStore).setMotionEnabled(false));
  expect(await badge.evaluate((el) => getComputedStyle(el).animationName)).toBe("none");
  // Still drawn, fully — the status itself is never hidden.
  expect(await badge.evaluate((el) => getComputedStyle(el).opacity)).toBe("1");

  // Healthy holds still; a still export carries the badge.
  await page.getByTestId("nd-motion-health-healthy").click();
  expect(await badge.evaluate((el) => getComputedStyle(el).animationName)).toBe("none");
  const svg = await page.evaluate(async () => {
    const m = await import("/src/file/svgExport.ts" as string);
    const s = window.__ddStore!.getState();
    return m.diagramToSvg(s.doc.diagrams[s.currentDiagramId()]) as string;
  });
  expect(svg).toContain('fill="#1e8e5a"');
});

test("Draw in traces a share link's lines once, in the viewer only; set from the Page popover (A5, D121)", async ({ page }) => {
  await build(page);
  await page.getByTestId("nd-page-button").click();
  await page.getByTestId("nd-page-draw-in").check();
  const doc = await getDoc(page);
  expect(doc.diagrams[doc.rootDiagramIds[0]].motion).toEqual({ drawIn: true });
  // Not in the editor.
  await expect(page.locator(".nd-drawin")).toHaveCount(0);

  const url = await page.evaluate(async () => {
    const m = await import("/src/share/urlCodec.ts" as string);
    return (await m.createShareLink(window.__ddStore!.getState().doc, `${location.origin}/`)).url as string;
  });
  // Record whether any line was drawing in, frame by frame, from the start.
  await page.addInitScript(() => {
    (window as unknown as { __drew: boolean }).__drew = false;
    const tick = () => {
      if (document.querySelector(".nd-drawin")) (window as unknown as { __drew: boolean }).__drew = true;
      if (performance.now() < 10000) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  await page.goto("about:blank");
  await page.goto(url);
  await expect(page.getByTestId("nd-viewer-shell")).toBeVisible();
  await expect.poll(() => page.evaluate(() => (window as unknown as { __drew: boolean }).__drew)).toBe(true);
  // Then it lets go, and the lines are themselves again.
  await expect(page.locator(".nd-drawin")).toHaveCount(0, { timeout: 4000 });
});

test("Peek stirs a Nested Block the first time it is seen, then never again (A5, D121)", async ({ page }) => {
  const block = await page.evaluate(() => {
    const s = window.__ddStore!.getState() as unknown as { addNestedNode: (p: object, z: object, t: string) => { nestedNodeId: string }; setSelection: (n: string[], e: string[]) => void };
    const id = s.addNestedNode({ x: 200, y: 200 }, { w: 180, h: 110 }, "Payments").nestedNodeId;
    s.setSelection([id], []);
    return id;
  });
  await page.getByTestId("nd-bar-motion").click();
  await page.getByTestId("nd-motion-peek").check();
  const doc = await getDoc(page);
  expect((doc.diagrams[doc.rootDiagramIds[0]].nodes.find((n) => n.id === block) as { peek?: boolean }).peek).toBe(true);

  // A fresh page: the first sight of it stirs.
  await expect.poll(() => page.evaluate(() => (localStorage.getItem("nedito:autosave") ?? "").includes('"peek": true'))).toBe(true);
  await reloadApp(page);
  const preview = page.locator(`.react-flow__node[data-id="${block}"] [data-peeking]`);
  await expect(preview).toHaveCount(1);
  expect(await preview.evaluate((el) => getComputedStyle(el).animationName)).toBe("nd-peek");
  // Into the block and back out: seen already, so still.
  await page.getByTestId(`nd-nested-open-${block}`).click();
  await expect(page.getByTestId("nd-breadcrumb-1")).toBeVisible();
  await page.getByTestId("nd-breadcrumb-0").click();
  await expect(page.locator(`.react-flow__node[data-id="${block}"]`)).toBeVisible();
  await expect(page.locator(`.react-flow__node[data-id="${block}"] [data-peeking]`)).toHaveCount(0);
});

// ---- Presentation (A6, D123).

async function choosePresentation(page: Page, mode: "Build" | "Walkthrough" | "Spotlight") {
  await page.getByTestId("nd-page-button").click();
  await page.getByTestId("nd-presentation").selectOption({ label: mode });
}

test("Walkthrough numbers the steps in reading order, a dot walks them, and a step is moved from Motion (A6, D123)", async ({ page }) => {
  const { a, b, e } = await build(page);
  await choosePresentation(page, "Walkthrough");
  await expect(page.getByTestId("nd-presentation-order")).toContainText("2 steps, in reading order");
  await expect(page.locator(`.react-flow__node[data-id="${a}"] .nd-step`)).toHaveText("1");
  await expect(page.locator(`.react-flow__node[data-id="${b}"] .nd-step`)).toHaveText("2");
  await expect(page.getByTestId("nd-walk")).toHaveCount(1);
  // Beneath the shapes, so it never sits on a label.
  expect(await page.getByTestId("nd-walk").evaluate((el) => getComputedStyle(el).zIndex)).toBe("0");
  await page.keyboard.press("Escape");

  // Payments to step 1, from its own Motion popover.
  await page.evaluate((id) => (window.__ddStore!.getState() as unknown as MotionStore).setSelection([id], []), b);
  await page.getByTestId("nd-bar-motion").click();
  await expect(page.getByTestId("nd-step-status")).toHaveText("Step 2 of 2");
  await page.getByTestId("nd-step-earlier").click();
  await expect(page.getByTestId("nd-step-status")).toHaveText("Step 1 of 2");
  await expect(page.locator(`.react-flow__node[data-id="${a}"] .nd-step`)).toHaveText("2");

  // The line can be a step too, from the line toolbar's Motion.
  await page.evaluate((id) => (window.__ddStore!.getState() as unknown as MotionStore).setSelection([], [id]), e);
  await page.getByTestId("nd-edge-toolbar").getByRole("button", { name: "Motion" }).click();
  await page.getByTestId("nd-step-add").click();
  await expect(page.getByTestId("nd-step-status")).toHaveText("Step 3 of 3");

  const doc = await getDoc(page);
  expect(doc.diagrams[doc.rootDiagramIds[0]].motion).toEqual({ presentation: { mode: "walkthrough", order: [b, a, e] } });

  // Motion off: the numbers stay — they are the rest state — and the dot goes.
  await page.evaluate(() => (window.__ddStore!.getState() as unknown as MotionStore).setMotionEnabled(false));
  await expect(page.locator(".nd-walk-dot")).toBeHidden();
  await expect(page.locator(".nd-step-walkthrough")).toHaveCount(3);
});

test("Build plays once in a share link's viewer; the editor shows the whole diagram (A6, D123)", async ({ page }) => {
  const { b } = await build(page);
  await choosePresentation(page, "Build");
  // The editor never hides anything; the order shows as outline numbers.
  await expect(page.locator(".nd-build-hidden")).toHaveCount(0);
  await expect(page.locator(".nd-step-draft")).toHaveCount(2);

  const url = await page.evaluate(async () => {
    const m = await import("/src/share/urlCodec.ts" as string);
    return (await m.createShareLink(window.__ddStore!.getState().doc, `${location.origin}/`)).url as string;
  });
  await page.goto("about:blank");
  await page.goto(url);
  await expect(page.getByTestId("nd-viewer-shell")).toBeVisible();
  // Payments arrives second: hidden at first, then there.
  const payments = page.locator(`.react-flow__node[data-id="${b}"]`);
  await expect(payments).toHaveClass(/nd-build-hidden/);
  await expect(payments).toHaveClass(/nd-build-shown/, { timeout: 4000 });
  // Then the build lets go, and readers never see an author's outline numbers.
  await expect(page.locator(".nd-build-hidden, .nd-build-shown")).toHaveCount(0, { timeout: 5000 });
  await expect(page.locator(".nd-step")).toHaveCount(0);
});

test("Spotlight is previewed from the Page popover, cycles, and Esc stops it (A6, D123)", async ({ page }) => {
  const { a, b } = await build(page);
  await choosePresentation(page, "Spotlight");
  await page.getByTestId("nd-presentation-preview").click();
  await expect(page.getByTestId("nd-preview-hint")).toContainText("Previewing Spotlight");
  await expect(page.locator(`.react-flow__node[data-id="${a}"]`)).toHaveClass(/nd-trace-focus/);
  await expect(page.locator(`.react-flow__node[data-id="${b}"]`)).toHaveClass(/nd-trace-dim/);
  await expect(page.locator(`.react-flow__node[data-id="${b}"]`)).toHaveClass(/nd-trace-focus/, { timeout: 5000 });
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("nd-preview-hint")).toHaveCount(0);
  await expect(page.locator(".nd-trace-dim, .nd-trace-focus")).toHaveCount(0);
  // And None takes it off the level entirely.
  await page.getByTestId("nd-page-button").click();
  await page.getByTestId("nd-presentation").selectOption({ label: "None" });
  const doc = await getDoc(page);
  expect(doc.diagrams[doc.rootDiagramIds[0]].motion).toBeUndefined();
});

// ---- The shape's own outline (D130): selection, a trace's focus and Pulse follow the shape.

test("a selected or pulsing diamond is outlined as a diamond, not as its box", async ({ page }) => {
  const ids = await page.evaluate(() => {
    const s = window.__ddStore!.getState() as unknown as MotionStore;
    const d = s.addShapeNode("general/diamond", { x: 120, y: 120 }, { w: 160, h: 100 });
    const r = s.addShapeNode("general/rect", { x: 380, y: 120 }, { w: 160, h: 80 });
    s.setNodeMotion([d], { pulse: { ripple: true } });
    s.setSelection([d, r], []);
    return { d, r };
  });
  const diamond = page.locator(`.react-flow__node[data-id="${ids.d}"]`);
  // The selection outline is the diamond's own path, in the accent, and it shows.
  const halo = diamond.locator(".nd-outline").last();
  await expect(halo).toBeVisible();
  expect(await halo.evaluate((el) => getComputedStyle(el).opacity)).toBe("1");
  expect(await halo.locator("polygon, path").first().evaluate((el) => getComputedStyle(el).fill)).toBe("none");
  // No box: the resizer's line is invisible (its corners stay to resize by) …
  for (const line of await diamond.locator(".react-flow__resize-control.line").all()) expect(await line.evaluate((el) => getComputedStyle(el).opacity)).toBe("0");
  // … and the selection of several is not painted over as one tinted rectangle.
  const rect = page.locator(".react-flow__nodesselection-rect");
  if (await rect.count()) expect(await rect.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe("rgba(0, 0, 0, 0)");
  // Pulse glows and ripples on the outline too.
  expect(await animation(page, `.react-flow__node[data-id="${ids.d}"] .nd-glow-shape`)).toBe("nd-glow");
  expect(await animation(page, `.react-flow__node[data-id="${ids.d}"] .nd-ripple-shape`)).toBe("nd-ripple");
  await expect(diamond.locator(".nd-glow, .nd-ripple")).toHaveCount(0);
  // Unselected, the outline is gone.
  await page.evaluate(() => (window.__ddStore!.getState() as unknown as MotionStore).clearSelection());
  await expect.poll(() => halo.evaluate((el) => getComputedStyle(el).opacity)).toBe("0");
});
