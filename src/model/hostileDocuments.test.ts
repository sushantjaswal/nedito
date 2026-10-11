// Every document is untrusted: a share link, a .nedito file, an editable PNG, a Word export, an
// imported drawio file, and anything saved from one into the autosave or Favorites. These tests feed
// the values a hostile document can carry to every way in, and to every builder that writes markup
// as a string, and require the result to be inert. The builders are also tested on raw documents
// that skipped validation, so each defence holds on its own.
import { beforeAll, describe, expect, it } from "vitest";
import { CURRENT_FORMAT_VERSION, decodeDoc } from "../file/documentFormat";
import { decodeDrawio } from "../file/drawio/drawioImport";
import { diagramToSvg } from "../file/svgExport";
import { cacheStencils, getStencil } from "../library/stencils";
import { fitStencilBody } from "../library/stencils/fitBody";
import generalSection from "../library/stencils/general";
import linesSection from "../library/stencils/lines";
import { buildMiniatureSvg } from "../nesting/miniatureSvg";
import { readScratchpad } from "./scratchpad";
import type { Diagram } from "./types";

/** Breaks out of an attribute and of SVG into HTML, where an <img> handler runs. */
const PAYLOAD = `x"/><img src="data:," onerror="window.__pwned=1"><svg x="`;

beforeAll(() => {
  cacheStencils(generalSection.shapes);
  cacheStencils(linesSection.shapes);
});

/** What the markup does once the page parses it as HTML inside an <svg>, as innerHTML does. */
function parsedAsPage(markup: string) {
  const host = document.createElement("div");
  host.innerHTML = `<svg>${markup}</svg>`;
  const all = [...host.querySelectorAll("*")];
  return {
    executable: all.filter((el) => /^(img|script|iframe|object|embed|foreignobject)$/i.test(el.localName)).map((el) => el.localName),
    handlers: all.flatMap((el) => [...el.attributes].filter((a) => /^on/i.test(a.name)).map((a) => `${el.localName}@${a.name}`)),
  };
}

const INERT = { executable: [], handlers: [] };

function hostileDiagram(): Diagram {
  return {
    id: "d",
    title: "Hostile",
    background: PAYLOAD,
    nodes: [
      { id: "a", type: "shape", shapeRef: "general/rect", position: { x: 0, y: 0 }, size: { w: 120, h: 60 }, z: 1, style: { fill: PAYLOAD, stroke: PAYLOAD, strokeWidth: PAYLOAD as unknown as number, fillOpacity: PAYLOAD as unknown as number }, label: { text: "A", color: PAYLOAD, fontSize: PAYLOAD as unknown as number } },
      { id: "b", type: "shape", shapeRef: "lines/arrow", position: { x: PAYLOAD as unknown as number, y: 100 }, size: { w: 160, h: 40 }, z: 2, style: { stroke: PAYLOAD } },
    ],
    edges: [{ id: "e", source: { nodeId: "a" }, target: { nodeId: "b" }, style: { stroke: PAYLOAD, strokeWidth: PAYLOAD as unknown as number, opacity: PAYLOAD as unknown as number }, label: { text: "e", color: PAYLOAD } }],
  } as Diagram;
}

function hostileDocJson(): string {
  const doc = {
    format: "nedito",
    formatVersion: 1,
    meta: { title: "Hostile", created: "2026-10-11T00:00:00Z", modified: "2026-10-11T00:00:00Z", appVersion: "0.1.0" },
    rootDiagramIds: ["d"],
    diagrams: {
      d: { ...hostileDiagram(), nodes: [...hostileDiagram().nodes, { id: "n", type: "nested", childDiagramId: "c", position: { x: 0, y: 200 }, size: { w: 240, h: 160 }, z: 3, style: {}, collapsed: { icons: [] }, ports: [] }] },
      c: { id: "c", title: "Inside", nodes: [{ id: "i", type: "shape", shapeRef: "general/rect", position: { x: PAYLOAD, y: 0 }, size: { w: 120, h: PAYLOAD }, z: 1, style: { fill: PAYLOAD } }], edges: [] },
    },
  };
  return JSON.stringify(doc);
}

describe("decoding a hostile document", () => {
  it("opens it, with every hostile value dropped or replaced by a safe default", () => {
    const r = decodeDoc(hostileDocJson());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const text = JSON.stringify(r.doc);
    expect(text).not.toContain("onerror");
    expect(text).not.toContain("<img");
    const a = r.doc.diagrams.d.nodes.find((n) => n.id === "a")!;
    expect(a.style.fill).toBeUndefined();
    expect(a.style.stroke).toBeUndefined();
    expect(a.style.strokeWidth).toBeUndefined();
    expect(a.label?.color).toBeUndefined();
    expect(a.label?.fontSize).toBeUndefined();
    expect(a.label?.text).toBe("A");
    const inner = r.doc.diagrams.c.nodes[0];
    expect(Number.isFinite(inner.position.x)).toBe(true);
    expect(Number.isFinite(inner.size.h)).toBe(true);
    expect(r.doc.diagrams.d.background).toBeUndefined();
  });

  it("keeps every legitimate value exactly as it was", () => {
    // At the current version, so no migration adds anything: the result must be the input.
    const fine = {
      format: "nedito",
      formatVersion: CURRENT_FORMAT_VERSION,
      meta: { title: "Fine", created: "2026-10-11T00:00:00Z", modified: "2026-10-11T00:00:00Z", appVersion: "0.1.0" },
      rootDiagramIds: ["d"],
      diagrams: { d: { id: "d", title: "Fine", background: "#F6F7F9", edges: [], nodes: [
        { id: "a", type: "shape", shapeRef: "general/rect", position: { x: -10.5, y: 848 }, size: { w: 1660, h: 2 }, rotation: -8, z: -1000, style: { fill: "#EEEBFC", stroke: "none", strokeWidth: 2, fillOpacity: 0.4, dash: "dashed", look: "classic" }, label: { text: "A", color: "rgba(30, 39, 51, 0.8)", fontSize: 16 } },
        { id: "b", type: "shape", shapeRef: "general/rect", position: { x: 0, y: 0 }, size: { w: 10, h: 10 }, z: 1, style: { fill: "steelblue", stroke: "#abc" } },
      ] } },
    };
    const r = decodeDoc(JSON.stringify(fine));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.doc.diagrams.d.nodes).toEqual(fine.diagrams.d.nodes);
    expect(r.doc.diagrams.d.background).toBe("#F6F7F9");
  });
});

describe("the string-built markup is inert even for a document that skipped validation", () => {
  it("a Nested Block's miniature", () => {
    const mini = buildMiniatureSvg(hostileDiagram());
    expect(mini).not.toBeNull();
    expect(parsedAsPage(mini!.body)).toEqual(INERT);
  });

  it("a line stencil's arrowheads (the canvas glyph and Favorites)", () => {
    const arrow = getStencil("lines/arrow")!;
    expect(parsedAsPage(fitStencilBody(arrow.svgBody, 160, 40, { stroke: PAYLOAD, strokeWidth: 1 }))).toEqual(INERT);
  });

  it("the SVG export, in a page and as a file", () => {
    const svg = diagramToSvg(hostileDiagram(), { background: PAYLOAD });
    expect(parsedAsPage(svg)).toEqual(INERT);
    const file = new DOMParser().parseFromString(svg, "image/svg+xml");
    expect(file.querySelector("parsererror")).toBeNull();
    const all = [...file.querySelectorAll("*")];
    expect(all.filter((el) => /^(img|script|iframe|object|embed|foreignobject)$/i.test(el.localName))).toEqual([]);
    expect(all.flatMap((el) => [...el.attributes].filter((a) => /^on/i.test(a.name)))).toEqual([]);
  });
});

describe("colours from outside are checked", () => {
  it("the drawio importer drops a hostile fill, stroke and font colour", async () => {
    const attr = (s: string) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const xml = `<mxfile><diagram id="p" name="P"><mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/>
      <mxCell id="2" value="A" style="${attr(`rounded=0;fillColor=${PAYLOAD};strokeColor=${PAYLOAD};fontColor=${PAYLOAD}`)}" vertex="1" parent="1"><mxGeometry x="10" y="10" width="120" height="60" as="geometry"/></mxCell>
      </root></mxGraphModel></diagram></mxfile>`;
    const r = await decodeDrawio(xml, "p.drawio");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(JSON.stringify(r.doc)).not.toContain("onerror");
  });

  it("a Favorite saved from a hostile shape is cleaned when it is read back", () => {
    localStorage.setItem("nedito:scratchpad", JSON.stringify([{ id: "f", shapeRef: "lines/arrow", size: { w: 160, h: 40 }, style: { stroke: PAYLOAD, fill: "#FFFFFF" } }]));
    const [item] = readScratchpad();
    expect(item.style.stroke).toBeUndefined();
    expect(item.style.fill).toBe("#FFFFFF");
    localStorage.removeItem("nedito:scratchpad");
  });
});
