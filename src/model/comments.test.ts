// Comments, and the one rule here that runs the opposite way to the rest of the model: a comment is
// never lost because something it named was deleted. These are the four things NT1 has to prove.
import { describe, expect, it } from "vitest";
import { CURRENT_FORMAT_VERSION, decodeDoc, encodeDoc, writtenVersion } from "../file/documentFormat";
import { commentInsertionIndex, commentTitle, pruneComments, resolveComments } from "./comments";
import type { DiagramDocument, DEdge, DNode, DComment, ShapeNode } from "./types";
import { useDocStore } from "./store";
import { validateDoc } from "./validate";

const shape = (id: string): ShapeNode => ({
  id,
  type: "shape",
  shapeRef: "general/rect",
  position: { x: 0, y: 0 },
  size: { w: 120, h: 60 },
  z: 1,
  style: {},
});

const edge = (id: string, from: string, to: string): DEdge => ({
  id,
  source: { nodeId: from },
  target: { nodeId: to },
  style: {},
});

function doc(nodes: DNode[], edges: DEdge[] = [], comments?: DComment[]): DiagramDocument {
  return {
    formatVersion: CURRENT_FORMAT_VERSION,
    meta: { title: "Untitled", created: "2026-10-14T00:00:00Z", modified: "2026-10-14T00:00:00Z", appVersion: "0.1.0" },
    rootDiagramIds: ["d1"],
    diagrams: { d1: { id: "d1", title: "Page 1", nodes, edges } },
    ...(comments ? { comments } : {}),
  };
}

const comment = (id: string, focus: DComment["focus"], body = "Why this is here."): DComment => ({ id, body, focus });

/** A document as it comes back from a file, which is where the load-time rules run. */
function roundTrip(d: DiagramDocument): DiagramDocument {
  const result = decodeDoc(encodeDoc(d));
  if (!result.ok) throw new Error(`decode failed: ${result.error}`);
  return result.doc;
}

/** A document that genuinely writes version 6 — motion is what v6 is for. */
function v6(comments?: DComment[]): DiagramDocument {
  const d = doc([shape("a"), shape("b")], [{ ...edge("e1", "a", "b"), motion: { kind: "flow" } }], comments);
  return d;
}

describe("a document with no comments", () => {
  it("is written exactly as it was, and still reports the version it always did", () => {
    const plain = v6();
    const before = encodeDoc(plain);
    expect(before).not.toContain("comments");
    expect(writtenVersion(plain)).toBe(6);
    expect(JSON.parse(before).formatVersion).toBe(6);

    // An empty array, and one left behind by deleting the last comment, are the same document.
    expect(encodeDoc({ ...plain, comments: [] })).toBe(before);
    expect(writtenVersion({ ...plain, comments: [] })).toBe(6);

    // And a document that was never v6 is not dragged up to it either.
    const plainer = doc([shape("a")]);
    expect(writtenVersion({ ...plainer, comments: [] })).toBe(writtenVersion(plainer));
    expect(encodeDoc({ ...plainer, comments: [] })).toBe(encodeDoc(plainer));
  });

  it("still reports version 6 once every comment's level is gone", () => {
    // The comment is kept in memory for undo; the file it is written to has no comments at all.
    const orphaned = v6([comment("n1", { diagramId: "gone" })]);
    expect(pruneComments(orphaned)).toBeUndefined();
    expect(writtenVersion(orphaned)).toBe(6);
    expect(encodeDoc(orphaned)).toBe(encodeDoc(v6()));
  });

  it("goes to 7 when a comment is added and back to 6 when it is taken away", () => {
    const withComment = v6([comment("n1", { diagramId: "d1" })]);
    expect(writtenVersion(withComment)).toBe(7);
    expect(writtenVersion({ ...withComment, comments: undefined })).toBe(6);
    expect(encodeDoc({ ...withComment, comments: undefined })).toBe(encodeDoc(v6()));
  });
});

describe("a comment whose shapes were deleted", () => {
  const withDeleted = doc(
    [shape("a")],
    [],
    // "b" and the line "e1" were deleted; "a" is still there.
    [comment("n1", { diagramId: "d1", nodeIds: ["a", "b"], edgeIds: ["e1"] }, "Keep this writing.")],
  );

  it("is valid: a deleted shape must never make a document refuse to open", () => {
    expect(validateDoc(withDeleted)).toEqual([]);
  });

  it("loses the dangling ids on load and keeps its text", () => {
    const loaded = roundTrip(withDeleted);
    expect(loaded.comments).toHaveLength(1);
    expect(loaded.comments?.[0].body).toBe("Keep this writing.");
    expect(loaded.comments?.[0].focus).toEqual({ diagramId: "d1", nodeIds: ["a"] });
  });

  it("becomes a comment about the level when every id it named is gone, rather than vanishing", () => {
    const all = doc([shape("a")], [], [comment("n1", { diagramId: "d1", nodeIds: ["gone"], edgeIds: ["also-gone"] })]);
    const loaded = roundTrip(all);
    expect(loaded.comments).toHaveLength(1);
    expect(loaded.comments?.[0].focus).toEqual({ diagramId: "d1" });
  });

  it("leaves a comment alone when nothing it names has gone", () => {
    const intact = doc([shape("a"), shape("b")], [edge("e1", "a", "b")], [comment("n1", { diagramId: "d1", nodeIds: ["a", "b"], edgeIds: ["e1"] })]);
    // The same array, not a copy: nothing was dropped, so nothing was rebuilt.
    expect(resolveComments(intact)).toBe(intact.comments);
  });

  it("drops a comment whose whole level is gone when the document is written, not before", () => {
    const orphaned = doc([shape("a")], [], [comment("n1", { diagramId: "gone" })]);
    expect(validateDoc(orphaned)).toEqual([]);
    expect(resolveComments(orphaned)).toHaveLength(1);
    expect(pruneComments(orphaned)).toBeUndefined();
    expect(roundTrip(orphaned).comments).toBeUndefined();
  });
});

describe("a document with comments", () => {
  const comments = [
    comment("n1", { diagramId: "d1", nodeIds: ["a"] }, "First."),
    { ...comment("n2", { diagramId: "d1" }, "Second.\nOn two lines."), title: "A title" },
    comment("n3", { diagramId: "d1", edgeIds: ["e1"] }, "Third."),
  ];
  const written = doc([shape("a"), shape("b")], [edge("e1", "a", "b")], comments);

  it("round-trips with its comments and their order unchanged, and reports version 7", () => {
    expect(writtenVersion(written)).toBe(7);
    const text = encodeDoc(written);
    expect(JSON.parse(text).formatVersion).toBe(7);

    const loaded = roundTrip(written);
    expect(loaded.comments).toEqual(comments);
    expect(loaded.comments?.map((n) => n.id)).toEqual(["n1", "n2", "n3"]);
    // Saving what was loaded gives the same file back.
    expect(encodeDoc(loaded)).toBe(text);
  });

  it("writes comments after the diagrams they are about and before the pictures", () => {
    const keys = Object.keys(JSON.parse(encodeDoc(written)));
    expect(keys.indexOf("comments")).toBeGreaterThan(keys.indexOf("diagrams"));
  });

  it("writes a comment's keys in one order, however the comment was built in memory", () => {
    const sameCommentOtherOrder: DComment = { focus: { nodeIds: ["a"], diagramId: "d1" }, body: "First.", id: "n1" } as DComment;
    expect(encodeDoc(doc([shape("a")], [], [sameCommentOtherOrder]))).toBe(
      encodeDoc(doc([shape("a")], [], [comment("n1", { diagramId: "d1", nodeIds: ["a"] }, "First.")])),
    );
  });

  it("gives a comment its title, or the first line it actually says", () => {
    expect(commentTitle(comments[1])).toBe("A title");
    expect(commentTitle(comments[0])).toBe("First.");
    expect(commentTitle({ ...comments[0], body: "\n\n  Indented first line\nmore" })).toBe("Indented first line");
    expect(commentTitle({ ...comments[0], body: "" })).toBe("Untitled comment");
  });

  it("refuses a file written by a newer app than this one", () => {
    const text = encodeDoc(written).replace('"formatVersion": 7', `"formatVersion": ${CURRENT_FORMAT_VERSION + 1}`);
    const result = decodeDoc(text);
    expect(result.ok).toBe(false);
  });
});

describe("a comment from a document that may come from anyone", () => {
  it("is dropped when it is not shaped like a comment, and kept when it is", () => {
    const hostile = JSON.stringify({
      format: "nedito",
      formatVersion: 7,
      meta: { title: "x", created: "x", modified: "x", appVersion: "0.1.0" },
      rootDiagramIds: ["d1"],
      diagrams: { d1: { id: "d1", title: "P", nodes: [shape("a")], edges: [] } },
      comments: [
        "not a comment",
        { id: "n1", body: { not: "text" }, focus: { diagramId: "d1" } },
        { id: "n2", body: "fine", focus: "not a focus" },
        { id: "n3", body: "kept", focus: { diagramId: "d1", nodeIds: ["a", 7, null] } },
      ],
    });
    const result = decodeDoc(hostile);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // n1 keeps its id and level but loses a body that was never text; n2 named no level at all.
    expect(result.doc.comments?.map((n) => n.id)).toEqual(["n1", "n3"]);
    expect(result.doc.comments?.[0].body).toBe("");
    expect(result.doc.comments?.[1].focus.nodeIds).toEqual(["a"]);
  });

  it("is rejected when two comments, or a comment and a shape, share an id", () => {
    const clash = doc([shape("a")], [], [comment("n1", { diagramId: "d1" }), comment("n1", { diagramId: "d1" })]);
    expect(validateDoc(clash).map((e) => e.code)).toContain("DUPLICATE_ID");
    expect(validateDoc(doc([shape("a")], [], [comment("a", { diagramId: "d1" })])).map((e) => e.code)).toContain("DUPLICATE_ID");
  });
});

describe("the open comment is session state", () => {
  /** An empty document in the store, as store.test.ts sets one up. */
  const freshStore = () => {
    const initial = useDocStore.getState();
    const rootId = initial.doc.rootDiagramIds[0];
    useDocStore.setState({
      doc: { ...initial.doc, rootDiagramIds: [rootId], diagrams: { [rootId]: { id: rootId, title: "Page 1", nodes: [], edges: [] } }, comments: undefined },
      navStack: [rootId],
      selection: { nodeIds: [], edgeIds: [] },
      ui: { ...initial.ui, openCommentId: null, viewerMode: false },
    });
    useDocStore.temporal.getState().clear();
    return useDocStore.getState;
  };

  it("opens with a new comment, closes through one place, and never reaches the document", () => {
    const store = freshStore();
    const diagramId = store().currentDiagramId();

    const id = store().addComment({ diagramId }, "Why this is here.");
    expect(id).not.toBeNull();
    expect(store().ui.openCommentId).toBe(id);

    store().closeComment();
    expect(store().ui.openCommentId).toBeNull();
    // Closing a comment that is already closed is not a change, so nothing re-renders for it.
    const before = store().ui;
    store().closeComment();
    expect(store().ui).toBe(before);

    // Deleting the open comment closes it, through closeComment rather than by clearing the id itself.
    store().openComment(id as string);
    store().deleteComment(id as string);
    expect(store().ui.openCommentId).toBeNull();

    // Which comment is open is not a property of the document, so it is not written to one.
    expect(encodeDoc(store().doc)).not.toContain("openCommentId");
  });

  it("is outside the undo history: the history records the document alone", () => {
    const store = freshStore();
    const id = store().addComment({ diagramId: store().currentDiagramId() }, "Text.") as string;
    store().closeComment();

    // Undoing the comment's creation must not bring back the fact that it was open.
    useDocStore.temporal.getState().undo();
    expect(store().doc.comments).toBeUndefined();
    expect(store().ui.openCommentId).toBeNull();
    expect(id).toBeTruthy();
  });
});

describe("where a new comment goes in the reading order", () => {
  const about = (ids: string[]) => ({ diagramId: "d1", nodeIds: ids });

  it("joins the comments about the same shape instead of landing at the end", () => {
    const comments = [comment("n1", about(["a"])), comment("n2", about(["b"])), comment("n3", about(["c"]))];
    // A second comment about "a" belongs beside the first, not after everything else: a walk through
    // a diagram does not visit the same box twice.
    expect(commentInsertionIndex(comments, about(["a"]))).toBe(1);
    expect(commentInsertionIndex(comments, about(["b"]))).toBe(2);
    expect(commentInsertionIndex(comments, about(["c"]))).toBe(3);
  });

  it("goes after the last of them when a shape already has several", () => {
    const comments = [comment("n1", about(["a"])), comment("n2", about(["a"])), comment("n3", about(["b"]))];
    expect(commentInsertionIndex(comments, about(["a"]))).toBe(2);
  });

  it("goes at the end when nothing it names has been written about", () => {
    const comments = [comment("n1", about(["a"]))];
    expect(commentInsertionIndex(comments, about(["new"]))).toBe(1);
  });

  it("puts a comment about the whole level at the end, having no shape to join", () => {
    const comments = [comment("n1", about(["a"])), comment("n2", about(["b"]))];
    expect(commentInsertionIndex(comments, { diagramId: "d1" })).toBe(2);
  });

  it("does not join a comment on another level that happens to share an id", () => {
    const comments = [comment("n1", { diagramId: "elsewhere", nodeIds: ["a"] })];
    expect(commentInsertionIndex(comments, about(["a"]))).toBe(1);
  });

  it("joins the run when a comment names several shapes and one of them is already written about", () => {
    const comments = [comment("n1", about(["a"])), comment("n2", about(["z"]))];
    expect(commentInsertionIndex(comments, about(["a", "b"]))).toBe(1);
  });
});
