import { describe, expect, it } from "vitest";
import { BRAND } from "../app/brand";
import { APP_VERSION } from "../app/version";
import { addNode, addEdge } from "../model/actions";
import { addNestedNode, addPort } from "../model/nesting";
import { addPage } from "../model/pages";
import type { DiagramDocument, ShapeNode } from "../model/types";
import { CURRENT_FORMAT_VERSION, decodeDoc, encodeDoc } from "./documentFormat";

function emptyDoc(diagramId = "root"): DiagramDocument {
  return {
    formatVersion: CURRENT_FORMAT_VERSION,
    meta: { title: "Untitled", created: "2026-08-05T00:00:00.000Z", modified: "2026-08-05T00:00:00.000Z", appVersion: APP_VERSION },
    rootDiagramIds: [diagramId],
    diagrams: { [diagramId]: { id: diagramId, title: "Page 1", nodes: [], edges: [] } },
  };
}

function shape(id: string): Omit<ShapeNode, "z"> {
  return { id, type: "shape", shapeRef: "general/rect", position: { x: 10, y: 20 }, size: { w: 100, h: 60 }, style: { fill: "#fff" } };
}

function buildRichDoc(): DiagramDocument {
  let doc = emptyDoc();
  doc = addNode(doc, "root", shape("a"));
  doc = addNode(doc, "root", shape("b"));
  doc = addEdge(doc, "root", { id: "e1", source: { nodeId: "a" }, target: { nodeId: "b" }, style: { edgeStyle: "orthogonal" }, label: { text: "flows" } });
  const nested = addNestedNode(doc, "root", { x: 200, y: 200 }, { w: 200, h: 140 }, "Nested Diagram");
  doc = nested.doc;
  doc = addNode(doc, nested.childDiagramId, shape("inner1"));
  doc = addPort(doc, "root", nested.nestedNodeId, { side: "left", offset: 0.5, innerNodeId: "inner1" });
  const page2 = addPage(doc, "Page 2");
  doc = page2.doc;
  doc = addNode(doc, page2.pageId, shape("c"));
  doc = { ...doc, diagrams: { ...doc.diagrams, root: { ...doc.diagrams.root, background: "#eeeeee" } } };
  return doc;
}

describe("encodeDoc", () => {
  it("puts format and formatVersion first", () => {
    const text = encodeDoc(emptyDoc());
    const parsed = JSON.parse(text);
    expect(Object.keys(parsed).slice(0, 2)).toEqual(["format", "formatVersion"]);
    expect(parsed.format).toBe(BRAND.formatId);
    // The lowest version that describes the document: v2 without images (D79). Images and v3
    // are covered in model/assets.test.ts.
    expect(parsed.formatVersion).toBe(2);
    // Notes made the newest version 7 (model/notes.ts); an empty document still says 2.
    expect(CURRENT_FORMAT_VERSION).toBe(7);
  });

  it("is pretty-printed", () => {
    const text = encodeDoc(emptyDoc());
    expect(text).toContain("\n");
    expect(text.startsWith("{\n")).toBe(true);
  });

  it("orders diagrams by id for diff-friendliness", () => {
    let doc = emptyDoc("b-diagram");
    doc = { ...doc, rootDiagramIds: ["b-diagram", "a-diagram"], diagrams: { ...doc.diagrams, "a-diagram": { id: "a-diagram", title: "A", nodes: [], edges: [] } } };
    const parsed = JSON.parse(encodeDoc(doc));
    expect(Object.keys(parsed.diagrams)).toEqual(["a-diagram", "b-diagram"]);
  });
});

describe("decodeDoc", () => {
  it("round-trips a simple doc exactly", () => {
    const doc = emptyDoc();
    const result = decodeDoc(encodeDoc(doc));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.doc).toEqual(doc);
  });

  it("round-trips a rich doc (multi-page, nesting, ports, edges) exactly", () => {
    const doc = buildRichDoc();
    const result = decodeDoc(encodeDoc(doc));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.doc).toEqual(doc);
  });

  it("is byte-identical across a second encode/decode cycle", () => {
    const doc = buildRichDoc();
    const first = encodeDoc(doc);
    const decoded = decodeDoc(first);
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) return;
    const second = encodeDoc(decoded.doc);
    expect(second).toBe(first);
  });

  it("rejects invalid JSON", () => {
    const result = decodeDoc("{not json");
    expect(result.ok).toBe(false);
  });

  it("rejects a file with the wrong format id", () => {
    const result = decodeDoc(JSON.stringify({ format: "drawio", formatVersion: 1 }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/isn't a/i);
  });

  it("rejects a file from a newer, unsupported format version", () => {
    const result = decodeDoc(JSON.stringify({ format: BRAND.formatId, formatVersion: 99, meta: {}, rootDiagramIds: [], diagrams: {} }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/newer version/i);
  });

  it("rejects a file that fails model validation instead of crashing", () => {
    const badDoc = {
      format: BRAND.formatId,
      formatVersion: 1,
      meta: { title: "t", created: "", modified: "", appVersion: "0" },
      rootDiagramIds: ["missing"],
      diagrams: {},
    };
    const result = decodeDoc(JSON.stringify(badDoc));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/validation/i);
  });

  it("rejects a file missing required fields", () => {
    const result = decodeDoc(JSON.stringify({ format: BRAND.formatId, formatVersion: 1 }));
    expect(result.ok).toBe(false);
  });

  it("migrates a v1 file to the current version on open, leaving its mapped ports untouched", () => {
    const v1 = {
      format: BRAND.formatId,
      formatVersion: 1,
      meta: { title: "t", created: "", modified: "", appVersion: "0" },
      rootDiagramIds: ["root"],
      diagrams: {
        root: {
          id: "root",
          title: "Page 1",
          nodes: [
            {
              id: "nested1",
              type: "nested",
              childDiagramId: "child",
              collapsed: { icons: [] },
              ports: [{ id: "p1", side: "left", offset: 0.5, innerNodeId: "inner1" }],
              position: { x: 0, y: 0 },
              size: { w: 160, h: 100 },
              z: 0,
              style: {},
            },
          ],
          edges: [],
        },
        child: { id: "child", title: "Child", nodes: [{ id: "inner1", type: "shape", shapeRef: "general/rect", position: { x: 0, y: 0 }, size: { w: 100, h: 60 }, z: 0, style: {} }], edges: [] },
      },
    };
    const result = decodeDoc(JSON.stringify(v1));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.doc.formatVersion).toBe(CURRENT_FORMAT_VERSION);
    const nested = result.doc.diagrams.root.nodes[0] as { ports: { innerNodeId?: string }[] };
    expect(nested.ports[0].innerNodeId).toBe("inner1");
  });

  it("round-trips a doc containing an unmapped port (the v2 addition)", () => {
    const doc = emptyDoc();
    doc.diagrams.root.nodes = [
      {
        id: "nested1",
        type: "nested",
        childDiagramId: "child",
        collapsed: { icons: [] },
        ports: [{ id: "p1", side: "left", offset: 0.5, label: "in-1" }],
        position: { x: 0, y: 0 },
        size: { w: 160, h: 100 },
        z: 0,
        style: {},
      },
    ];
    doc.diagrams.child = { id: "child", title: "Child", nodes: [], edges: [] };

    const result = decodeDoc(encodeDoc(doc));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.doc).toEqual(doc);
  });
});

describe("appVersion (D110)", () => {
  it("every write records the app that wrote it, from package.json; reading keeps what the file says", async () => {
    const { version } = await import("../../package.json");
    const old = { ...emptyDoc(), meta: { ...emptyDoc().meta, appVersion: "0.0.0-older-app" } };
    const written = JSON.parse(encodeDoc(old));
    expect(written.meta.appVersion).toBe(version);
    // The rest of meta is untouched, in the same key order.
    expect(Object.keys(written.meta)).toEqual(["title", "created", "modified", "appVersion"]);
    expect(written.meta.title).toBe("Untitled");

    // Opening an older app's file shows its version until it is written again...
    const raw = JSON.stringify({ ...written, meta: { ...written.meta, appVersion: "0.0.0-older-app" } });
    const opened = decodeDoc(raw);
    expect(opened.ok && opened.doc.meta.appVersion).toBe("0.0.0-older-app");
    // ...and the round trip of anything this app wrote is still exact.
    const once = encodeDoc(old);
    const decoded = decodeDoc(once);
    expect(decoded.ok && encodeDoc(decoded.doc)).toBe(once);
  });

  it("no version number is written out in the app's source: package.json is the one place", async () => {
    const { readdirSync, readFileSync, statSync } = await import("node:fs");
    const { join } = await import("node:path");
    const { version } = await import("../../package.json");
    const walk = (dir: string): string[] =>
      readdirSync(dir).flatMap((e) => (statSync(join(dir, e)).isDirectory() ? walk(join(dir, e)) : [join(dir, e)]));
    const literal = /appVersion:\s*["'`]/;
    // The guard itself works: it catches the literal this replaced.
    expect(literal.test(`meta: { appVersion: "0.0.1" }`)).toBe(true);
    expect(literal.test(`meta: { appVersion: APP_VERSION }`)).toBe(false);
    const offenders = walk("src")
      .filter((f) => /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f))
      .filter((f) => literal.test(readFileSync(f, "utf8")));
    expect(offenders).toEqual([]);
    expect(version).toMatch(/^\d+\.\d+\.\d+/);
  });
});
