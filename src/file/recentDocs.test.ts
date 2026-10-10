// Recent diagrams, against the in-memory backend.
import { describe, expect, it } from "vitest";
import { createEmptyDoc } from "../model/store";
import type { DiagramDocument } from "../model/types";
import { hasContent, listRecent, loadRecent, memoryBackend, RECENT_LIMIT, rememberDocument } from "./recentDocs";

let clock = 0;
/** A document with one shape, made distinct by its creation stamp. */
function docWithShape(title: string): DiagramDocument {
  const doc = createEmptyDoc();
  const root = doc.rootDiagramIds[0];
  doc.meta = { ...doc.meta, title, created: new Date(Date.UTC(2026, 0, 1) + clock++ * 1000).toISOString() };
  doc.diagrams[root].nodes.push({
    id: `n-${title}`,
    type: "shape",
    shapeRef: "general/rect",
    position: { x: 0, y: 0 },
    size: { w: 100, h: 60 },
    z: 0,
    style: {},
  });
  return doc;
}

describe("recent diagrams", () => {
  it("skips a document with nothing in it", async () => {
    const backend = memoryBackend();
    const empty = createEmptyDoc();
    expect(hasContent(empty)).toBe(false);
    await rememberDocument(empty, backend);
    expect(await listRecent(backend)).toEqual([]);
  });

  it("lists entries newest first with their title and shape count", async () => {
    const backend = memoryBackend();
    await rememberDocument(docWithShape("First"), backend);
    await new Promise((r) => setTimeout(r, 2));
    await rememberDocument(docWithShape("Second"), backend);
    const list = await listRecent(backend);
    expect(list.map((e) => e.title)).toEqual(["Second", "First"]);
    expect(list[0].shapeCount).toBe(1);
  });

  it("replaces the entry for a document remembered again, rather than adding a second", async () => {
    const backend = memoryBackend();
    const doc = docWithShape("Same");
    await rememberDocument(doc, backend);
    await rememberDocument({ ...doc, meta: { ...doc.meta, title: "Same, renamed" } }, backend);
    const list = await listRecent(backend);
    expect(list).toHaveLength(1);
    expect(list[0].title).toBe("Same, renamed");
  });

  it(`keeps at most ${RECENT_LIMIT}, dropping the oldest`, async () => {
    const backend = memoryBackend();
    for (let i = 0; i < RECENT_LIMIT + 2; i++) {
      await rememberDocument(docWithShape(`Doc ${i}`), backend);
      await new Promise((r) => setTimeout(r, 2));
    }
    const list = await listRecent(backend);
    expect(list).toHaveLength(RECENT_LIMIT);
    expect(list.map((e) => e.title)).not.toContain("Doc 0");
    expect(list.map((e) => e.title)).not.toContain("Doc 1");
    expect(list[0].title).toBe(`Doc ${RECENT_LIMIT + 1}`);
  });

  it("reopens an entry as the same document, through the file validation", async () => {
    const backend = memoryBackend();
    const doc = docWithShape("Round trip");
    await rememberDocument(doc, backend);
    const [entry] = await listRecent(backend);
    const loaded = await loadRecent(entry.key, backend);
    expect(loaded.ok).toBe(true);
    if (loaded.ok) expect(loaded.doc).toEqual(doc);
  });

  it("reports a damaged or missing entry instead of loading it", async () => {
    const backend = memoryBackend();
    expect((await loadRecent("nope", backend)).ok).toBe(false);
    await backend.put({ key: "bad", title: "Bad", savedAt: 1, shapeCount: 0, file: "{ not json" });
    expect((await loadRecent("bad", backend)).ok).toBe(false);
  });
});
