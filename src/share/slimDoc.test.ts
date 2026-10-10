import { describe, expect, it } from "vitest";
import { addNode } from "../model/actions";
import { addNestedNode } from "../model/nesting";
import { validateDoc } from "../model/validate";
import { slimDocForShare } from "./slimDoc";
import { docAtDepth0, docAtDepth1, docAtDepth3, emptyDoc, shape, withBlankPage } from "./testDocs";

describe("slimDocForShare", () => {
  it("leaves a document with no slack untouched", () => {
    const doc = docAtDepth0();
    expect(slimDocForShare(doc)).toEqual(doc);
  });

  it("does not mutate the document it was given", () => {
    const { doc } = withBlankPage(docAtDepth0());
    const before = JSON.stringify(doc);
    slimDocForShare(doc);
    expect(JSON.stringify(doc)).toBe(before);
  });

  it("drops a page that was never drawn on", () => {
    const { doc, blankPageId } = withBlankPage(docAtDepth0());
    const slim = slimDocForShare(doc);
    expect(slim.rootDiagramIds).not.toContain(blankPageId);
    expect(slim.diagrams[blankPageId]).toBeUndefined();
    expect(slim.rootDiagramIds).toEqual(["root"]);
  });

  it("keeps the last page even when it is blank — a document with no pages is not a document", () => {
    const slim = slimDocForShare(emptyDoc());
    expect(slim.rootDiagramIds).toHaveLength(1);
    expect(slim.diagrams[slim.rootDiagramIds[0]]).toBeDefined();
    expect(validateDoc(slim)).toEqual([]);
  });

  it("keeps an empty CHILD diagram, because its nested box still opens into it", () => {
    let doc = docAtDepth0();
    const nested = addNestedNode(doc, "root", { x: 0, y: 0 }, { w: 200, h: 120 }, "Empty Block");
    doc = nested.doc;
    const slim = slimDocForShare(doc);
    expect(slim.diagrams[nested.childDiagramId]).toBeDefined();
    expect(validateDoc(slim)).toEqual([]);
  });

  it("drops a diagram nothing points at any more", () => {
    // The shape of a child detached "to an unused pool" when its nested node was deleted.
    const doc = docAtDepth0();
    const orphaned = {
      ...doc,
      diagrams: {
        ...doc.diagrams,
        orphan: { id: "orphan", title: "Detached", nodes: [], edges: [] },
      },
    };
    expect(slimDocForShare(orphaned).diagrams.orphan).toBeUndefined();
  });

  it("keeps every level of a deep document reachable", () => {
    const slim = slimDocForShare(docAtDepth3());
    expect(Object.keys(slim.diagrams)).toHaveLength(4);
    expect(validateDoc(slim)).toEqual([]);
  });

  it("still validates after slimming a document with both slack and nesting", () => {
    let { doc } = withBlankPage(docAtDepth1());
    doc = addNode(doc, "root", shape("extra"));
    const slim = slimDocForShare(doc);
    expect(validateDoc(slim)).toEqual([]);
  });
});
