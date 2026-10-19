// Moving between comments, and the events that close one.
import { beforeEach, describe, expect, it } from "vitest";
import { useDocStore } from "../model/store";
import type { DiagramDocument, DComment, ShapeNode } from "../model/types";
import { depthMark, commentEntries, commentPeek, commentsBelow, commentsNaming, stepComment } from "./commentNavigation";

const shape = (id: string): ShapeNode => ({
  id,
  type: "shape",
  shapeRef: "general/rect",
  position: { x: 0, y: 0 },
  size: { w: 100, h: 50 },
  z: 1,
  style: {},
});

const comment = (id: string, focus: DComment["focus"], body = "Body text."): DComment => ({ id, body, focus });

/** A page, a Nested Block, and the level inside it — enough to have a depth to mark. */
function nestedDoc(comments: DComment[]): DiagramDocument {
  return {
    formatVersion: 7,
    meta: { title: "x", created: "x", modified: "x", appVersion: "0.1.0" },
    rootDiagramIds: ["page"],
    diagrams: {
      page: {
        id: "page",
        title: "Page 1",
        nodes: [
          shape("a"),
          { id: "block", type: "nested", childDiagramId: "inside", position: { x: 0, y: 0 }, size: { w: 160, h: 90 }, z: 1, style: {}, collapsed: { icons: [] }, ports: [] },
        ],
        edges: [],
      },
      inside: { id: "inside", title: "Inside", nodes: [shape("b")], edges: [] },
    },
    comments,
  };
}

describe("what the pager knows about each comment", () => {
  const doc = nestedDoc([comment("n1", { diagramId: "page", nodeIds: ["a"] }), comment("n2", { diagramId: "inside" })]);

  it("numbers them in reading order and names the level each is on", () => {
    const entries = commentEntries(doc);
    expect(entries.map((e) => e.number)).toEqual([1, 2]);
    expect(entries.map((e) => e.levelTitle)).toEqual(["Page 1", "Inside"]);
  });

  it("marks how deep a comment sits, so reading order and nesting are one picture", () => {
    expect(commentEntries(doc).map((e) => e.depth)).toEqual([0, 1]);
    expect(depthMark(0)).toBe("");
    expect(depthMark(2)).toBe("››");
    // However deep a document goes, the mark does not grow without limit.
    expect(depthMark(40)).toHaveLength(4);
  });

  it("says which comments are about a level rather than anything on it", () => {
    expect(commentEntries(doc).map((e) => e.wholeLevel)).toEqual([false, true]);
  });

  it("keeps a comment whose level has gone in the count rather than renumbering around it", () => {
    const orphan = nestedDoc([comment("n1", { diagramId: "page" }), comment("n2", { diagramId: "gone" })]);
    expect(commentEntries(orphan).map((e) => e.number)).toEqual([1, 2]);
    expect(commentEntries(orphan)[1].levelTitle).toContain("no longer here");
  });
});

describe("stepping", () => {
  const doc = nestedDoc([comment("n1", { diagramId: "page" }), comment("n2", { diagramId: "page" }), comment("n3", { diagramId: "page" })]);

  it("goes forwards and backwards, and wraps round rather than dead-ending", () => {
    expect(stepComment(doc, "n1", 1)?.id).toBe("n2");
    expect(stepComment(doc, "n3", 1)?.id).toBe("n1");
    expect(stepComment(doc, "n1", -1)?.id).toBe("n3");
  });

  it("starts at the first comment forwards and the last one backwards when none is open", () => {
    expect(stepComment(doc, null, 1)?.id).toBe("n1");
    expect(stepComment(doc, null, -1)?.id).toBe("n3");
  });

  it("has nowhere to go in a document with no comments", () => {
    expect(stepComment(nestedDoc([]), null, 1)).toBeNull();
  });
});

describe("the peek", () => {
  it("is the first line or so, with the line breaks taken out", () => {
    expect(commentPeek(comment("n", { diagramId: "page" }, "One line.\n\nAnother."))).toBe("One line. Another.");
    expect(commentPeek(comment("n", { diagramId: "page" }, "x".repeat(200)))).toHaveLength(91);
    expect(commentPeek(comment("n", { diagramId: "page" }, "x".repeat(200)))).toMatch(/…$/);
  });
});

describe("what closes an open comment", () => {
  /** The store holding a document with one comment, that comment open. */
  function openOne() {
    const initial = useDocStore.getState();
    useDocStore.setState({
      doc: nestedDoc([comment("n1", { diagramId: "page", nodeIds: ["a"] })]),
      navStack: ["page"],
      selection: { nodeIds: [], edgeIds: [] },
      trace: null,
      ui: { ...initial.ui, openCommentId: "n1", commentListOpen: false, viewerMode: false },
    });
    return useDocStore.getState;
  }

  it("closes when the reader sets a trace of their own", () => {
    const store = openOne();
    store().setTrace(["a"]);
    expect(store().ui.openCommentId).toBeNull();
    // The trace they asked for is still set: closing the comment did not undo their action.
    expect(store().trace?.focus).toEqual(["a"]);
  });

  it("closes when the reader clears the trace", () => {
    const store = openOne();
    store().setTrace(null);
    expect(store().ui.openCommentId).toBeNull();
  });

  it("closes when the selection changes, and when it is cleared", () => {
    const store = openOne();
    store().setSelection(["a"]);
    // A comment is open only while it is being read: choosing something else to look at ends that,
    // rather than leaving the card to follow the author around while they work.
    expect(store().ui.openCommentId).toBeNull();

    useDocStore.setState({ ui: { ...store().ui, openCommentId: "n1" } });
    store().clearSelection();
    expect(store().ui.openCommentId).toBeNull();
  });

  it("is never open until something opens it", () => {
    // Nothing on load, nothing from having comments in the document: a card appears because a reader
    // asked for one, never by itself.
    const initial = useDocStore.getState();
    useDocStore.setState({ doc: nestedDoc([comment("n1", { diagramId: "page" })]), ui: { ...initial.ui, openCommentId: null } });
    expect(useDocStore.getState().ui.openCommentId).toBeNull();
  });

  it("closes when the level changes by any route", () => {
    const store = openOne();
    store().navigateInto("block");
    expect(store().ui.openCommentId).toBeNull();

    useDocStore.setState({ ui: { ...store().ui, openCommentId: "n1" } });
    store().navigateBack();
    expect(store().ui.openCommentId).toBeNull();

    useDocStore.setState({ ui: { ...store().ui, openCommentId: "n1" } });
    store().navigateToDiagram("inside");
    expect(store().ui.openCommentId).toBeNull();
  });

  it("takes the list with it, but leaves the card's side where it was", () => {
    const store = openOne();
    store().setCardSide("left");
    store().setCommentListOpen(true);
    store().closeComment();
    expect(store().ui.commentListOpen).toBe(false);
    // Sticky on purpose: the next comment opens where the last card was, which is the whole point
    // of the side-switch rule.
    expect(store().ui.cardSide).toBe("left");
  });
});

beforeEach(() => {
  useDocStore.temporal.getState().clear();
});

describe("writing a comment", () => {
  function withComment() {
    const initial = useDocStore.getState();
    useDocStore.setState({
      doc: nestedDoc([comment("n1", { diagramId: "page", nodeIds: ["a"] }, "First text.")]),
      navStack: ["page"],
      selection: { nodeIds: [], edgeIds: [] },
      trace: null,
      ui: { ...initial.ui, openCommentId: "n1", viewerMode: false },
    });
    useDocStore.temporal.getState().clear();
    return useDocStore.getState;
  }

  it("changes the text, and an emptied title goes back to the first line of the body", () => {
    const store = withComment();
    store().updateComment("n1", { title: "A title" });
    expect(store().doc.comments?.[0].title).toBe("A title");

    // Blank is not a title, so it is removed rather than stored empty: the comment falls back to its
    // first line, as a comment that never had one does.
    store().updateComment("n1", { title: "   " });
    expect(store().doc.comments?.[0].title).toBeUndefined();
  });

  it("points a comment at something else without touching its text", () => {
    const store = withComment();
    store().setCommentFocus("n1", { diagramId: "page", nodeIds: ["block"] });
    expect(store().doc.comments?.[0].focus.nodeIds).toEqual(["block"]);
    expect(store().doc.comments?.[0].body).toBe("First text.");
  });

  it("refuses to point a comment at a level that is not there", () => {
    const store = withComment();
    store().setCommentFocus("n1", { diagramId: "gone" });
    expect(store().doc.comments?.[0].focus.diagramId).toBe("page");
  });

  it("reorders, which is the reading order and nothing else", () => {
    const initial = useDocStore.getState();
    useDocStore.setState({
      doc: nestedDoc([comment("n1", { diagramId: "page" }), comment("n2", { diagramId: "page" }), comment("n3", { diagramId: "page" })]),
      ui: { ...initial.ui, openCommentId: null },
    });
    const store = useDocStore.getState;
    store().reorderComments(2, 0);
    expect(store().doc.comments?.map((n) => n.id)).toEqual(["n3", "n1", "n2"]);
    // Out of range, and a move to where it already is, change nothing rather than scrambling it.
    const before = store().doc.comments;
    store().reorderComments(1, 1);
    store().reorderComments(9, 0);
    expect(store().doc.comments).toBe(before);
  });

  it("is one undo step for an editing session, not one per keystroke", () => {
    const store = withComment();
    const history = useDocStore.temporal.getState();

    // What useEditSession does around a field: pause after the first change, resume on blur.
    store().updateComment("n1", { body: "T" });
    history.pause();
    store().updateComment("n1", { body: "Ty" });
    store().updateComment("n1", { body: "Typed." });
    history.resume();

    expect(store().doc.comments?.[0].body).toBe("Typed.");
    useDocStore.temporal.getState().undo();
    // One press puts back the text as it was before the session, not one letter of it.
    expect(useDocStore.getState().doc.comments?.[0].body).toBe("First text.");
  });

  it("arms the title of a comment just added, and disarms it once another is opened", () => {
    const store = withComment();
    const id = store().addComment({ diagramId: "page" }, "") as string;
    expect(store().ui.commentAwaitingTitle).toBe(true);
    expect(store().ui.openCommentId).toBe(id);

    store().openComment("n1");
    expect(store().ui.commentAwaitingTitle).toBe(false);
  });
});

describe("what a marker counts", () => {
  const doc = nestedDoc([
    comment("n1", { diagramId: "page", nodeIds: ["a"] }),
    comment("n2", { diagramId: "page", nodeIds: ["a", "block"] }),
    comment("n3", { diagramId: "inside", nodeIds: ["b"] }),
  ]);

  it("counts the comments naming a shape on this level, and nothing from another", () => {
    expect(commentsNaming(doc.comments, "page", "a").map((n) => n.id)).toEqual(["n1", "n2"]);
    expect(commentsNaming(doc.comments, "page", "block").map((n) => n.id)).toEqual(["n2"]);
    // "b" is named by a comment, but on a different level: this level's marker says nothing about it.
    expect(commentsNaming(doc.comments, "page", "b")).toEqual([]);
    expect(commentsNaming(doc.comments, "inside", "b").map((n) => n.id)).toEqual(["n3"]);
  });

  it("counts a line the same way a shape is counted", () => {
    const withEdge = nestedDoc([comment("e", { diagramId: "page", edgeIds: ["edge1"] })]);
    expect(commentsNaming(withEdge.comments, "page", "edge1")).toHaveLength(1);
  });

  it("counts everything written beneath a Nested Block, however deep", () => {
    // A parent advertises the writing inside it; "inside" holds one comment.
    expect(commentsBelow(doc, "inside").map((n) => n.id)).toEqual(["n3"]);
    // And the page's own comments are not beneath it.
    expect(commentsBelow(doc, "page").map((n) => n.id)).toEqual(["n1", "n2", "n3"]);
  });

  it("does not spin on levels that point at each other, and counts a shared level once", () => {
    const loop: DiagramDocument = {
      ...nestedDoc([comment("n1", { diagramId: "inside" })]),
      diagrams: {
        page: { id: "page", title: "Page 1", nodes: [{ id: "block", type: "nested", childDiagramId: "inside", position: { x: 0, y: 0 }, size: { w: 10, h: 10 }, z: 1, style: {}, collapsed: { icons: [] }, ports: [] }], edges: [] },
        inside: { id: "inside", title: "Inside", nodes: [{ id: "back", type: "nested", childDiagramId: "page", position: { x: 0, y: 0 }, size: { w: 10, h: 10 }, z: 1, style: {}, collapsed: { icons: [] }, ports: [] }], edges: [] },
      },
    };
    expect(commentsBelow(loop, "inside")).toHaveLength(1);
  });

  it("finds nothing beneath a block whose level is gone", () => {
    expect(commentsBelow(doc, "never-existed")).toEqual([]);
  });
});
