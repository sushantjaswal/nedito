import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { gotoFresh } from "./helpers";

// Render parity: the canvas and the export must draw the same diagram.
//
// They have disagreed three separate times, and each time only a screenshot caught it. In D67
// curved edges exported straight, Nested Blocks exported blank and text exported in serif. In
// D69 filled containers painted over their own links and vendor icons became blank tiles in
// thumbnails. In D70 `align` was inert on the canvas while the export honoured it. Every one of
// those passed its unit tests, because each test looked at one renderer on its own.
//
// So this sweep renders every template, and every diagram nested inside one, through both
// paths. It lines the elements up by the model id they were drawn from and compares what a
// reader would see: label text, line breaks, alignment, font, colour, fill, translucency,
// strokes, markers, dashes, vendor icons, the Nested Block's title, miniature and ports, and
// where each edge actually starts and ends. A single extra document covers what no template
// happens to use (rotation, bold italic, a group, corner handles, an unmapped port).
//
// A failure lists every disagreement at once, as `template › diagram › id › property`, so the
// report says which side moved rather than only that something did.

const MODULES = { svg: "/src/file/svgExport.ts", registry: "/src/templates/registry.ts", layers: "/src/model/layers.ts" };

const TEMPLATE_IDS = [
  ...readFileSync(join(process.cwd(), "src/templates/registry.ts"), "utf8").matchAll(/^ {4}id: "([a-z0-9-]+)",/gm),
].map((m) => m[1]);

// ---------------------------------------------------------------------------------- summaries

interface LabelSummary {
  text: string;
  align?: string;
  size: number;
  weight: number;
  style: string | null;
  color: string;
  family: string;
}

interface NodeSummary {
  kind: string;
  opacity?: number;
  rotation?: number;
  glyph?: { raw: boolean; fill?: string; fillOpacity?: number; stroke?: string; strokeWidth?: number };
  /** A picture of the user's own (D79): drawn or an empty frame, its border, and where its label starts. */
  image?: { picture: boolean; border: string; borderWidth: number; labelTop?: number };
  label?: LabelSummary;
  nested?: {
    title: string;
    summary?: string | null;
    summaryTexts?: string[];
    miniature: boolean;
    empty: boolean;
    ports: number;
    dashedPorts: number;
  };
}

interface EdgeSummary {
  markerStart: string | null;
  markerEnd: string | null;
  stroke: string;
  width: number;
  dash: number[];
  start: [number, number];
  end: [number, number];
  label?: LabelSummary;
}

interface Rendering {
  nodes: Record<string, NodeSummary>;
  edges: Record<string, EdgeSummary>;
}

interface Collected {
  title: string;
  canvas: Rendering;
  exported: Rendering;
  /** The shapeRef (or node type) each id was drawn from, for readable messages. */
  refs: Record<string, string>;
}

// ---------------------------------------------------------------------------------- in the page

/**
 * Reads the diagram on screen twice: once from the live canvas DOM, once from the SVG the
 * exporter produces for the same diagram. Runs in the page, so it cannot close over anything
 * in this file — every helper it needs is declared inside it.
 */
async function collect(page: Page): Promise<Collected> {
  return page.evaluate(async (mod) => {
    type Store = {
      doc: {
        diagrams: Record<string, { title: string; nodes: { id: string; type: string; shapeRef?: string }[]; edges: { id: string }[] }>;
        assets?: Record<string, unknown>;
      };
      navStack: string[];
      clearSelection: () => void;
    };
    const store = (window as unknown as { __ddStore: { getState: () => Store } }).__ddStore.getState();
    store.clearSelection();
    // The canvas renders only what is on screen (onlyRenderVisibleElements), so a large template
    // has to be fitted first or its outer nodes are simply absent from the DOM.
    document.querySelector<HTMLElement>(".react-flow__controls-fitview")?.click();

    const diagramId = store.navStack[store.navStack.length - 1];
    const diagram = store.doc.diagrams[diagramId];

    // Wait until React Flow has drawn every node and every edge the model has. Edges appear only
    // once the handles have been measured, so they lag the nodes by a frame or two.
    const wanted = new Set(diagram.nodes.map((n) => n.id));
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline) {
      const nodes = new Set(Array.from(document.querySelectorAll(".react-flow__node")).map((n) => n.getAttribute("data-id")));
      const edges = document.querySelectorAll(".react-flow__edge").length;
      if ([...wanted].every((id) => nodes.has(id)) && edges >= diagram.edges.length) break;
      await new Promise((r) => setTimeout(r, 50));
    }
    await new Promise((r) => setTimeout(r, 150));

    const { renderDiagramSvg } = (await import(/* @vite-ignore */ mod.svg)) as {
      renderDiagramSvg: (d: unknown, o: unknown) => Promise<string>;
    };
    const svgText = await renderDiagramSvg(diagram, {
      background: "#ffffff",
      diagrams: store.doc.diagrams,
      assets: store.doc.assets,
      annotateIds: true,
    });

    const probe = document.createElement("div");
    document.body.appendChild(probe);
    const colour = (c: string | null | undefined): string => {
      if (!c || c === "none") return "none";
      probe.style.color = "";
      probe.style.color = c;
      return getComputedStyle(probe).color;
    };
    const nums = (s: string | null | undefined): number[] =>
      (String(s ?? "").match(/-?\d*\.?\d+(?:e-?\d+)?/g) ?? []).map(Number);
    const num = (v: string | null | undefined, d = NaN): number => {
      const n = parseFloat(String(v));
      return Number.isFinite(n) ? n : d;
    };
    const family = (f: string | null | undefined): string =>
      String(f ?? "")
        .split(",")[0]
        .trim()
        .replace(/^["']|["']$/g, "")
        .toLowerCase();
    const fromJustify: Record<string, string> = {
      "flex-start": "left",
      start: "left",
      center: "center",
      "flex-end": "right",
      end: "right",
    };
    const fromAnchor: Record<string, string> = { start: "left", middle: "center", end: "right" };
    /** The marker a url(#…) reference resolves to in `scope`, or a note saying it resolves to nothing. */
    const marker = (raw: string | null, scope: ParentNode): string | null => {
      if (!raw) return null;
      const m = raw.match(/^url\(\s*['"]?#([^'")]+)['"]?\s*\)$/);
      if (!m) return `unparseable ${raw}`;
      return scope.querySelector(`[id="${m[1]}"]`) ? m[1] : `nothing (${raw})`;
    };

    // ---- the canvas
    const canvas: { nodes: Record<string, unknown>; edges: Record<string, unknown> } = { nodes: {}, edges: {} };
    for (const el of Array.from(document.querySelectorAll<HTMLElement>(".react-flow__node"))) {
      const id = el.getAttribute("data-id")!;
      const kind = el.classList.contains("react-flow__node-nested")
        ? "nested"
        : el.classList.contains("react-flow__node-group")
          ? "group"
          : "shape";
      const n: Record<string, unknown> = { kind };
      if (kind === "shape") {
        const body = el.querySelector<HTMLElement>('[class*="_body_"]');
        n.opacity = num(body ? getComputedStyle(body).opacity : "1", 1);
        n.rotation = num((body?.style.transform.match(/rotate\((-?[\d.]+)deg\)/) ?? [])[1], 0);
        const glyphSvg = el.querySelector('svg[viewBox="0 0 100 100"][preserveAspectRatio="none"]');
        if (glyphSvg) {
          const g = glyphSvg.querySelector("g[fill]")!;
          const cs = getComputedStyle(g);
          n.glyph = {
            raw: false,
            fill: g.getAttribute("fill") === "none" ? "none" : colour(cs.fill),
            fillOpacity: num(g.getAttribute("fill-opacity"), 1),
            stroke: g.getAttribute("stroke") === "none" ? "none" : colour(cs.stroke),
            strokeWidth: num(g.getAttribute("stroke-width"), 1),
          };
        } else if (el.querySelector("svg")) {
          n.glyph = { raw: true };
        }
        const pic = el.querySelector('img[class*="_image_"]');
        if (pic || el.querySelector('[class*="_imageMissing_"]')) {
          const border = el.querySelector<HTMLElement>('[class*="_imageBorder_"]');
          n.image = {
            picture: !!pic,
            border: border ? colour(getComputedStyle(border).borderTopColor) : "none",
            borderWidth: border ? num(getComputedStyle(border).borderTopWidth) : 0,
          };
        }
        const label = el.querySelector<HTMLElement>('[class*="_label_"], [class*="_labelBelow_"]');
        // Below an image the label's top is set inline in model units, so it compares directly.
        if (label && n.image) (n.image as { labelTop?: number }).labelTop = num(label.style.top);
        if (label?.textContent) {
          const cs = getComputedStyle(label);
          n.label = {
            text: label.textContent,
            align: fromJustify[cs.justifyContent] ?? cs.justifyContent,
            size: num(cs.fontSize),
            weight: num(cs.fontWeight),
            style: cs.fontStyle,
            color: colour(cs.color),
            family: family(cs.fontFamily),
          };
        }
      } else if (kind === "nested") {
        const ports = Array.from(el.querySelectorAll('.react-flow__handle[data-handleid^="port:"]'));
        n.nested = {
          title: el.querySelector('[class*="_name_"]')?.textContent ?? "",
          summary: el.querySelector('[class*="_summary_"]')?.textContent ?? null,
          miniature: !!el.querySelector('[class*="_preview_"] svg'),
          empty: !!el.querySelector('[class*="_emptyNote_"]'),
          ports: ports.length,
          dashedPorts: ports.filter((h) => /_unmapped_/.test(h.className)).length,
        };
      }
      canvas.nodes[id] = n;
    }
    for (const el of Array.from(document.querySelectorAll(".react-flow__edge"))) {
      const id = el.getAttribute("data-id")!;
      const path = el.querySelector("path.react-flow__edge-path")!;
      const cs = getComputedStyle(path);
      const d = nums(path.getAttribute("d"));
      const e: Record<string, unknown> = {
        markerStart: marker(path.getAttribute("marker-start"), document),
        markerEnd: marker(path.getAttribute("marker-end"), document),
        stroke: colour(cs.stroke),
        width: num(cs.strokeWidth),
        dash: cs.strokeDasharray === "none" ? [] : nums(cs.strokeDasharray),
        start: [d[0], d[1]],
        end: [d[d.length - 2], d[d.length - 1]],
      };
      const pill = document.querySelector<HTMLElement>(`[data-testid="nd-edge-label-${CSS.escape(id)}"]`);
      if (pill) {
        const ls = getComputedStyle(pill);
        e.label = {
          text: pill.textContent ?? "",
          size: num(ls.fontSize),
          weight: num(ls.fontWeight),
          style: ls.fontStyle,
          color: colour(ls.color),
          family: family(ls.fontFamily),
        };
      }
      canvas.edges[id] = e;
    }

    // ---- the export
    const root = new DOMParser().parseFromString(svgText, "image/svg+xml").documentElement;
    const exported: { nodes: Record<string, unknown>; edges: Record<string, unknown> } = { nodes: {}, edges: {} };
    for (const g of Array.from(root.querySelectorAll(":scope > g[data-node-id]"))) {
      const id = g.getAttribute("data-node-id")!;
      const model = diagram.nodes.find((x) => x.id === id)!;
      const n: Record<string, unknown> = { kind: model.type };
      if (model.type === "shape") {
        n.opacity = num(g.getAttribute("opacity"), 1);
        n.rotation = num((g.getAttribute("transform")?.match(/rotate\((-?[\d.]+)/) ?? [])[1], 0);
        const glyph = g.querySelector(':scope > g[transform^="scale("]');
        if (glyph) {
          n.glyph = {
            raw: false,
            fill: glyph.getAttribute("fill") === "none" ? "none" : colour(glyph.getAttribute("fill")),
            fillOpacity: num(glyph.getAttribute("fill-opacity"), 1),
            stroke: glyph.getAttribute("stroke") === "none" ? "none" : colour(glyph.getAttribute("stroke")),
            strokeWidth: num(glyph.getAttribute("stroke-width"), 1),
          };
        } else if (g.querySelector(":scope > svg")) {
          n.glyph = { raw: true };
        }
        const pic = g.querySelector(":scope > image");
        if (pic || model.shapeRef === "image") {
          const border = g.querySelector(":scope > rect:not([stroke-dasharray])");
          n.image = {
            picture: !!pic,
            border: border ? colour(border.getAttribute("stroke")) : "none",
            borderWidth: border ? num(border.getAttribute("stroke-width")) : 0,
          };
          const first = g.querySelector(":scope > text > tspan");
          const size = num(g.querySelector(":scope > text")?.getAttribute("font-size"), 12);
          // The first line is centred on its line box, which starts half a line height above it.
          if (first) (n.image as { labelTop?: number }).labelTop = num(first.getAttribute("y")) - (size * 1.25) / 2;
        }
        const text = g.querySelector(":scope > text");
        if (text) {
          n.label = {
            text: Array.from(text.querySelectorAll("tspan"))
              .map((t) => t.textContent)
              .join("\n"),
            align: fromAnchor[text.getAttribute("text-anchor") ?? ""],
            size: num(text.getAttribute("font-size")),
            weight: num(text.getAttribute("font-weight")),
            style: text.getAttribute("font-style"),
            color: colour(text.getAttribute("fill")),
            family: family(text.getAttribute("font-family")),
          };
        }
      } else if (model.type === "nested") {
        const texts = Array.from(g.querySelectorAll(":scope > text")).map((t) => t.textContent ?? "");
        const circles = Array.from(g.querySelectorAll(":scope > circle"));
        n.nested = {
          title: texts[1] ?? "",
          summaryTexts: texts.slice(2),
          miniature: !!g.querySelector(":scope > svg"),
          empty: texts.includes("Empty"),
          ports: circles.length,
          dashedPorts: circles.filter((c) => c.hasAttribute("stroke-dasharray")).length,
        };
      }
      exported.nodes[id] = n;
    }
    // A group's frame is invisible on both sides, so it exports as nothing; record it so the
    // presence check does not flag it.
    for (const m of diagram.nodes) if (m.type === "group" && !exported.nodes[m.id]) exported.nodes[m.id] = { kind: "group" };
    for (const g of Array.from(root.querySelectorAll(":scope > g[data-edge-id]"))) {
      const id = g.getAttribute("data-edge-id")!;
      const path = g.querySelector(":scope > path")!;
      const d = nums(path.getAttribute("d"));
      const e: Record<string, unknown> = {
        markerStart: marker(path.getAttribute("marker-start"), root),
        markerEnd: marker(path.getAttribute("marker-end"), root),
        stroke: colour(path.getAttribute("stroke")),
        width: num(path.getAttribute("stroke-width")),
        dash: nums(path.getAttribute("stroke-dasharray")),
        start: [d[0], d[1]],
        end: [d[d.length - 2], d[d.length - 1]],
      };
      const text = root.querySelector(`:scope > g[data-edge-label-id="${CSS.escape(id)}"] > text`);
      if (text) {
        e.label = {
          text: text.textContent ?? "",
          size: num(text.getAttribute("font-size")),
          weight: num(text.getAttribute("font-weight")),
          style: text.getAttribute("font-style"),
          color: colour(text.getAttribute("fill")),
          family: family(text.getAttribute("font-family")),
        };
      }
      exported.edges[id] = e;
    }
    probe.remove();
    const refs = Object.fromEntries(diagram.nodes.map((n) => [n.id, n.shapeRef ?? n.type]));
    // Plain data crosses back to Node; its shape is Collected.
    return { title: diagram.title, canvas, exported, refs } as unknown as never;
  }, MODULES) as Promise<Collected>;
}

// ---------------------------------------------------------------------------------- comparison

const close = (a: number | undefined, b: number | undefined, tol = 0.01) =>
  a === b || (a !== undefined && b !== undefined && Math.abs(a - b) <= tol);

function compareLabel(where: string, c: LabelSummary | undefined, e: LabelSummary | undefined, out: string[]) {
  if (!c && !e) return;
  if (!c || !e) {
    out.push(`${where} label: canvas=${c ? JSON.stringify(c.text) : "none"} export=${e ? JSON.stringify(e.text) : "none"}`);
    return;
  }
  if (c.text !== e.text) out.push(`${where} label text: canvas=${JSON.stringify(c.text)} export=${JSON.stringify(e.text)}`);
  if (c.align !== undefined && e.align !== undefined && c.align !== e.align)
    out.push(`${where} label align: canvas=${c.align} export=${e.align}`);
  if (!close(c.size, e.size)) out.push(`${where} label size: canvas=${c.size} export=${e.size}`);
  if (!close(c.weight, e.weight)) out.push(`${where} label weight: canvas=${c.weight} export=${e.weight}`);
  if ((c.style ?? "normal") !== (e.style ?? "normal")) out.push(`${where} label style: canvas=${c.style} export=${e.style}`);
  if (c.color !== e.color) out.push(`${where} label colour: canvas=${c.color} export=${e.color}`);
  if (c.family !== e.family) out.push(`${where} label font: canvas=${c.family} export=${e.family}`);
}

function compare(where: string, got: Collected): string[] {
  const out: string[] = [];
  const at = `${where} › ${got.title}`;
  const { canvas, exported } = got;

  for (const id of new Set([...Object.keys(canvas.nodes), ...Object.keys(exported.nodes)])) {
    const c = canvas.nodes[id];
    const e = exported.nodes[id];
    const w = `${at} › node ${id} (${got.refs[id] ?? "?"})`;
    if (!c || !e) {
      out.push(`${w}: drawn only on the ${c ? "canvas" : "export"}`);
      continue;
    }
    if (c.kind !== e.kind) out.push(`${w} kind: canvas=${c.kind} export=${e.kind}`);
    if (c.kind === "shape") {
      if (!close(c.opacity, e.opacity)) out.push(`${w} opacity: canvas=${c.opacity} export=${e.opacity}`);
      if (!close(c.rotation, e.rotation)) out.push(`${w} rotation: canvas=${c.rotation} export=${e.rotation}`);
      const cg = c.glyph;
      const eg = e.glyph;
      if (!cg !== !eg) out.push(`${w} glyph: canvas=${cg ? "drawn" : "none"} export=${eg ? "drawn" : "none"}`);
      else if (cg && eg) {
        if (cg.raw !== eg.raw) out.push(`${w} glyph kind: canvas=${cg.raw ? "vendor" : "authored"} export=${eg.raw ? "vendor" : "authored"}`);
        else if (!cg.raw) {
          if (cg.fill !== eg.fill) out.push(`${w} fill: canvas=${cg.fill} export=${eg.fill}`);
          if (!close(cg.fillOpacity, eg.fillOpacity)) out.push(`${w} fill opacity: canvas=${cg.fillOpacity} export=${eg.fillOpacity}`);
          if (cg.stroke !== eg.stroke) out.push(`${w} stroke: canvas=${cg.stroke} export=${eg.stroke}`);
          if (!close(cg.strokeWidth, eg.strokeWidth)) out.push(`${w} stroke width: canvas=${cg.strokeWidth} export=${eg.strokeWidth}`);
        }
      }
      compareLabel(w, c.label, e.label, out);
      const ci = c.image;
      const ei = e.image;
      if (!ci !== !ei) out.push(`${w} picture: canvas=${ci ? "image" : "none"} export=${ei ? "image" : "none"}`);
      else if (ci && ei) {
        if (ci.picture !== ei.picture) out.push(`${w} picture drawn: canvas=${ci.picture} export=${ei.picture}`);
        if (ci.border !== ei.border) out.push(`${w} image border: canvas=${ci.border} export=${ei.border}`);
        if (!close(ci.borderWidth, ei.borderWidth)) out.push(`${w} image border width: canvas=${ci.borderWidth} export=${ei.borderWidth}`);
        if (!close(ci.labelTop, ei.labelTop, 0.5)) out.push(`${w} label below image: canvas top=${ci.labelTop} export top=${ei.labelTop}`);
      }
    }
    if (c.kind === "nested" && c.nested && e.nested) {
      const cn = c.nested;
      const en = e.nested;
      if (cn.title !== en.title) out.push(`${w} title: canvas=${JSON.stringify(cn.title)} export=${JSON.stringify(en.title)}`);
      if (cn.summary && !(en.summaryTexts ?? []).includes(cn.summary))
        out.push(`${w} summary: canvas=${JSON.stringify(cn.summary)} export has ${JSON.stringify(en.summaryTexts)}`);
      if (cn.miniature !== en.miniature) out.push(`${w} miniature: canvas=${cn.miniature} export=${en.miniature}`);
      if (cn.empty !== en.empty) out.push(`${w} "Empty" note: canvas=${cn.empty} export=${en.empty}`);
      if (cn.ports !== en.ports) out.push(`${w} ports: canvas=${cn.ports} export=${en.ports}`);
      if (cn.dashedPorts !== en.dashedPorts) out.push(`${w} unmapped ports: canvas=${cn.dashedPorts} export=${en.dashedPorts}`);
    }
  }

  // Every exported coordinate is the canvas coordinate plus one translation: the padding offset
  // computed from the bounds. So the start-to-start difference must be the same for every edge,
  // and the same again end to end. An edge that disagrees has had its handle resolved to a
  // different point by the exporter than by React Flow.
  let offset: [number, number] | null = null;
  for (const id of new Set([...Object.keys(canvas.edges), ...Object.keys(exported.edges)])) {
    const c = canvas.edges[id];
    const e = exported.edges[id];
    const w = `${at} › edge ${id}`;
    if (!c || !e) {
      out.push(`${w}: drawn only on the ${c ? "canvas" : "export"}`);
      continue;
    }
    if (c.markerStart !== e.markerStart) out.push(`${w} start marker: canvas=${c.markerStart} export=${e.markerStart}`);
    if (c.markerEnd !== e.markerEnd) out.push(`${w} end marker: canvas=${c.markerEnd} export=${e.markerEnd}`);
    if (c.stroke !== e.stroke) out.push(`${w} stroke: canvas=${c.stroke} export=${e.stroke}`);
    if (!close(c.width, e.width)) out.push(`${w} width: canvas=${c.width} export=${e.width}`);
    if (JSON.stringify(c.dash) !== JSON.stringify(e.dash)) out.push(`${w} dash: canvas=[${c.dash}] export=[${e.dash}]`);
    compareLabel(w, c.label, e.label, out);

    const ds: [number, number] = [e.start[0] - c.start[0], e.start[1] - c.start[1]];
    const de: [number, number] = [e.end[0] - c.end[0], e.end[1] - c.end[1]];
    offset ??= ds;
    for (const [end, d] of [
      ["start", ds],
      ["end", de],
    ] as const) {
      if (!close(d[0], offset[0], 0.75) || !close(d[1], offset[1], 0.75)) {
        const dx = (d[0] - offset[0]).toFixed(1);
        const dy = (d[1] - offset[1]).toFixed(1);
        out.push(`${w} ${end} point: export is off from the canvas by (${dx}, ${dy})`);
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------------- navigation

/** Every chain of nested blocks from the page down to each child diagram. */
async function nestedPaths(page: Page): Promise<string[][]> {
  return page.evaluate(() => {
    type D = { nodes: { id: string; type: string; childDiagramId?: string }[] };
    const store = (window as unknown as {
      __ddStore: { getState: () => { doc: { diagrams: Record<string, D> }; navStack: string[] } };
    }).__ddStore.getState();
    const paths: string[][] = [];
    const walk = (diagramId: string, trail: string[]) => {
      for (const n of store.doc.diagrams[diagramId].nodes) {
        if (n.type !== "nested" || !n.childDiagramId) continue;
        paths.push([...trail, n.id]);
        walk(n.childDiagramId, [...trail, n.id]);
      }
    };
    walk(store.navStack[0], []);
    return paths;
  });
}

async function openPath(page: Page, path: string[]) {
  await page.evaluate(async (trail) => {
    const get = () =>
      (window as unknown as {
        __ddStore: {
          getState: () => { navStack: string[]; navigateInto: (id: string) => void; navigateToLevel: (i: number) => void };
        };
      }).__ddStore.getState();
    get().navigateToLevel(0);
    for (const id of trail) {
      const depth = get().navStack.length;
      get().navigateInto(id);
      const deadline = Date.now() + 3000;
      while (get().navStack.length === depth && Date.now() < deadline) await new Promise((r) => setTimeout(r, 25));
    }
  }, path);
  // The zoom-in transition finishes before React Flow settles the new diagram's handles.
  await page.waitForTimeout(700);
}

/** Collects and compares the page and every diagram nested beneath it. */
async function sweepDocument(page: Page, name: string): Promise<string[]> {
  const out = compare(name, await collect(page));
  for (const path of await nestedPaths(page)) {
    await openPath(page, path);
    out.push(...compare(name, await collect(page)));
  }
  return out;
}

// ---------------------------------------------------------------------------------- the sweep

test.describe("Render parity — every template, canvas against export", () => {
  test("finds every template in the registry", () => {
    // If the regex stops matching, the sweep below silently shrinks to nothing.
    expect(TEMPLATE_IDS.length).toBeGreaterThan(30);
  });

  for (const id of TEMPLATE_IDS) {
    test(id, async ({ page }) => {
      await gotoFresh(page);
      await page.evaluate(async ({ mod, id }) => {
        const { loadTemplate } = (await import(/* @vite-ignore */ mod.registry)) as {
          loadTemplate: (id: string) => Promise<{ doc: unknown } | null>;
        };
        const def = await loadTemplate(id);
        const store = (window as unknown as {
          __ddStore: { getState: () => { applyTemplate: (doc: unknown, mode: string) => string } };
        }).__ddStore.getState();
        store.applyTemplate(def!.doc, "into-current");
      }, { mod: MODULES, id });

      const mismatches = await sweepDocument(page, id);
      expect(mismatches, mismatches.join("\n")).toEqual([]);
    });
  }
});

/**
 * What no template exercises, in one document: rotation, whole-node opacity, fill opacity, a
 * bold italic right-aligned label, an icon-style stencil, two animated icons, a vendor icon, a group, corner and side
 * handles, dashed and dotted lines, the crow's-foot marks, and a Nested Block with one mapped and
 * one unmapped port. Written as plain data; the page adds each diagram's layers when it applies it.
 */
const KS_PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==";

const KITCHEN_SINK = {
  formatVersion: 3,
  meta: { title: "Parity kitchen sink", created: "2026-09-25T00:00:00.000Z", modified: "2026-09-25T00:00:00.000Z", appVersion: "0.0.1" },
  rootDiagramIds: ["ksPage_______________"],
  diagrams: {
    ksPage_______________: {
      id: "ksPage_______________",
      title: "Kitchen sink",
      nodes: [
        {
          id: "ksLabel______________",
          type: "shape",
          shapeRef: "general/rect",
          position: { x: 60, y: 60 },
          size: { w: 200, h: 80 },
          z: 1,
          style: { fill: "#FBF0F3", stroke: "#B4426A", strokeWidth: 2 },
          label: { text: "Right, bold\nand italic", align: "right", bold: true, italic: true, fontSize: 14, color: "#B4426A" },
        },
        {
          id: "ksRotated____________",
          type: "shape",
          shapeRef: "general/rounded-rect",
          position: { x: 360, y: 60 },
          size: { w: 160, h: 70 },
          z: 2,
          rotation: 30,
          style: { opacity: 0.6 },
          label: { text: "Rotated, faded", align: "left" },
        },
        {
          id: "ksVenn_______________",
          type: "shape",
          shapeRef: "general/ellipse",
          position: { x: 600, y: 40 },
          size: { w: 180, h: 140 },
          z: 3,
          style: { fill: "#6D5AE6", fillOpacity: 0.4, stroke: "#4B3BC4", strokeWidth: 2 },
          label: { text: "Translucent" },
        },
        {
          id: "ksIcon_______________",
          type: "shape",
          shapeRef: "misc/star",
          position: { x: 80, y: 260 },
          size: { w: 60, h: 60 },
          z: 4,
          style: {},
        },
        {
          id: "ksVendor_____________",
          type: "shape",
          shapeRef: "azure/networking/firewalls",
          position: { x: 220, y: 260 },
          size: { w: 60, h: 60 },
          z: 5,
          style: {},
        },
        // Animated icons (D124): one as placed, one recoloured — the export draws each at rest.
        {
          id: "ksAnimated___________",
          type: "shape",
          shapeRef: "animated/processing",
          position: { x: 80, y: 360 },
          size: { w: 48, h: 48 },
          z: 20,
          style: {},
        },
        {
          id: "ksAnimatedColour_____",
          type: "shape",
          shapeRef: "animated/running",
          position: { x: 220, y: 360 },
          size: { w: 48, h: 48 },
          z: 21,
          style: { fill: "#B4426A" },
        },
        {
          id: "ksGroup______________",
          type: "group",
          position: { x: 360, y: 240 },
          size: { w: 340, h: 110 },
          z: 6,
          style: {},
          childIds: ["ksGroupA_____________", "ksGroupB_____________"],
        },
        {
          id: "ksGroupA_____________",
          type: "shape",
          shapeRef: "general/rect",
          position: { x: 370, y: 260 },
          size: { w: 130, h: 70 },
          z: 7,
          style: {},
          label: { text: "In a group" },
        },
        {
          id: "ksGroupB_____________",
          type: "shape",
          shapeRef: "general/rect",
          position: { x: 560, y: 260 },
          size: { w: 130, h: 70 },
          z: 8,
          style: {},
          label: { text: "Also grouped" },
        },
        // A picture of the user's own (D79): bordered, rotated, faded, with a two-line label below.
        {
          id: "ksPicture____________",
          type: "shape",
          shapeRef: "image",
          imageId: "ksAsset______________",
          position: { x: 820, y: 280 },
          size: { w: 160, h: 80 },
          z: 9,
          rotation: 10,
          style: { stroke: "#B4426A", strokeWidth: 3, opacity: 0.8 },
          label: { text: "Our logo\nsecond line", fontSize: 13 },
        },
        {
          id: "ksNested_____________",
          type: "nested",
          childDiagramId: "ksChild______________",
          position: { x: 300, y: 440 },
          size: { w: 260, h: 150 },
          z: 9,
          style: {},
          label: { text: "Nested with ports" },
          collapsed: { icons: [], summary: "one mapped · one not" },
          ports: [
            { id: "ksPortMapped_________", side: "left", offset: 0.5, innerNodeId: "ksInner______________", label: "in" },
            { id: "ksPortOpen___________", side: "right", offset: 0.3 },
          ],
        },
      ],
      edges: [
        {
          id: "ksDashed_____________",
          source: { nodeId: "ksLabel______________" },
          target: { nodeId: "ksRotated____________" },
          style: { edgeStyle: "straight", dash: "dashed", endArrow: "classic", sourceHandle: "right", targetHandle: "left" },
          label: { text: "dashed, bold", bold: true, fontSize: 12 },
        },
        {
          id: "ksCorner_____________",
          source: { nodeId: "ksRotated____________" },
          target: { nodeId: "ksVenn_______________" },
          style: { edgeStyle: "curved", endArrow: "triangle", sourceHandle: "top-right", targetHandle: "bottom-left" },
        },
        {
          id: "ksDotted_____________",
          source: { nodeId: "ksIcon_______________" },
          target: { nodeId: "ksVendor_____________" },
          style: { edgeStyle: "orthogonal", dash: "dotted", startArrow: "er-one", endArrow: "er-zero-or-many", sourceHandle: "right", targetHandle: "left" },
        },
        {
          id: "ksGrouped____________",
          source: { nodeId: "ksGroupA_____________" },
          target: { nodeId: "ksGroupB_____________" },
          style: { edgeStyle: "straight", endArrow: "open", sourceHandle: "right", targetHandle: "left", stroke: "#1E8E5A", strokeWidth: 3 },
        },
        {
          id: "ksIntoPort___________",
          source: { nodeId: "ksLabel______________" },
          target: { nodeId: "ksNested_____________", portId: "ksPortMapped_________" },
          style: { edgeStyle: "orthogonal", endArrow: "classic", sourceHandle: "bottom", targetHandle: "port:ksPortMapped_________" },
        },
        {
          id: "ksDefault____________",
          source: { nodeId: "ksVendor_____________" },
          target: { nodeId: "ksNested_____________" },
          style: {},
        },
      ],
    },
    ksChild______________: {
      id: "ksChild______________",
      title: "Inside",
      nodes: [
        {
          id: "ksInner______________",
          type: "shape",
          shapeRef: "general/rect",
          position: { x: 60, y: 60 },
          size: { w: 140, h: 60 },
          z: 1,
          style: {},
          label: { text: "Mapped" },
        },
        {
          id: "ksInner2_____________",
          type: "shape",
          shapeRef: "general/diamond",
          position: { x: 300, y: 50 },
          size: { w: 120, h: 80 },
          z: 2,
          style: {},
          label: { text: "Diamond" },
        },
        // The same picture inside a nested diagram, so the parent's miniature has to draw it too.
        {
          id: "ksInnerPicture_______",
          type: "shape",
          shapeRef: "image",
          imageId: "ksAsset______________",
          position: { x: 480, y: 50 },
          size: { w: 80, h: 40 },
          z: 3,
          style: {},
        },
      ],
      edges: [
        {
          id: "ksInnerEdge__________",
          source: { nodeId: "ksInner______________" },
          target: { nodeId: "ksInner2_____________" },
          style: { edgeStyle: "curved", endArrow: "classic", sourceHandle: "right", targetHandle: "left" },
        },
      ],
    },
  },
  assets: {
    ksAsset______________: { mime: "image/png", data: KS_PNG, width: 160, height: 80, name: "logo.png" },
  },
};

test.describe("Render parity — what no template covers", () => {
  test("kitchen sink", async ({ page }) => {
    await gotoFresh(page);
    await page.evaluate(async ({ mod, doc }) => {
      const { createDefaultLayers } = (await import(/* @vite-ignore */ mod.layers)) as { createDefaultLayers: () => unknown };
      const withLayers = structuredClone(doc) as { diagrams: Record<string, { layers?: unknown }> };
      for (const d of Object.values(withLayers.diagrams)) d.layers = createDefaultLayers();
      const store = (window as unknown as {
        __ddStore: { getState: () => { applyTemplate: (doc: unknown, mode: string) => string } };
      }).__ddStore.getState();
      store.applyTemplate(withLayers, "into-current");
    }, { mod: MODULES, doc: KITCHEN_SINK });

    const mismatches = await sweepDocument(page, "kitchen-sink");
    expect(mismatches, mismatches.join("\n")).toEqual([]);
  });
});
