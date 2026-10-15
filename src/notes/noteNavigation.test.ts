// Moving between notes, and the events that close one.
import { beforeEach, describe, expect, it } from "vitest";
import { useDocStore } from "../model/store";
import type { DiagramDocument, Note, ShapeNode } from "../model/types";
import { depthMark, noteEntries, notePeek, notesBelow, notesNaming, stepNote } from "./noteNavigation";

const shape = (id: string): ShapeNode => ({
  id,
  type: "shape",
  shapeRef: "general/rect",
  position: { x: 0, y: 0 },
  size: { w: 100, h: 50 },
  z: 1,
  style: {},
});

const note = (id: string, focus: Note["focus"], body = "Body text."): Note => ({ id, body, focus });

/** A page, a Nested Block, and the level inside it — enough to have a depth to mark. */
function nestedDoc(notes: Note[]): DiagramDocument {
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
    notes,
  };
}

describe("what the pager knows about each note", () => {
  const doc = nestedDoc([note("n1", { diagramId: "page", nodeIds: ["a"] }), note("n2", { diagramId: "inside" })]);

  it("numbers them in reading order and names the level each is on", () => {
    const entries = noteEntries(doc);
    expect(entries.map((e) => e.number)).toEqual([1, 2]);
    expect(entries.map((e) => e.levelTitle)).toEqual(["Page 1", "Inside"]);
  });

  it("marks how deep a note sits, so reading order and nesting are one picture", () => {
    expect(noteEntries(doc).map((e) => e.depth)).toEqual([0, 1]);
    expect(depthMark(0)).toBe("");
    expect(depthMark(2)).toBe("››");
    // However deep a document goes, the mark does not grow without limit.
    expect(depthMark(40)).toHaveLength(4);
  });

  it("says which notes are about a level rather than anything on it", () => {
    expect(noteEntries(doc).map((e) => e.wholeLevel)).toEqual([false, true]);
  });

  it("keeps a note whose level has gone in the count rather than renumbering around it", () => {
    const orphan = nestedDoc([note("n1", { diagramId: "page" }), note("n2", { diagramId: "gone" })]);
    expect(noteEntries(orphan).map((e) => e.number)).toEqual([1, 2]);
    expect(noteEntries(orphan)[1].levelTitle).toContain("no longer here");
  });
});

describe("stepping", () => {
  const doc = nestedDoc([note("n1", { diagramId: "page" }), note("n2", { diagramId: "page" }), note("n3", { diagramId: "page" })]);

  it("goes forwards and backwards, and wraps round rather than dead-ending", () => {
    expect(stepNote(doc, "n1", 1)?.id).toBe("n2");
    expect(stepNote(doc, "n3", 1)?.id).toBe("n1");
    expect(stepNote(doc, "n1", -1)?.id).toBe("n3");
  });

  it("starts at the first note forwards and the last one backwards when none is open", () => {
    expect(stepNote(doc, null, 1)?.id).toBe("n1");
    expect(stepNote(doc, null, -1)?.id).toBe("n3");
  });

  it("has nowhere to go in a document with no notes", () => {
    expect(stepNote(nestedDoc([]), null, 1)).toBeNull();
  });
});

describe("the peek", () => {
  it("is the first line or so, with the line breaks taken out", () => {
    expect(notePeek(note("n", { diagramId: "page" }, "One line.\n\nAnother."))).toBe("One line. Another.");
    expect(notePeek(note("n", { diagramId: "page" }, "x".repeat(200)))).toHaveLength(91);
    expect(notePeek(note("n", { diagramId: "page" }, "x".repeat(200)))).toMatch(/…$/);
  });
});

describe("what closes an open note", () => {
  /** The store holding a document with one note, that note open. */
  function openOne() {
    const initial = useDocStore.getState();
    useDocStore.setState({
      doc: nestedDoc([note("n1", { diagramId: "page", nodeIds: ["a"] })]),
      navStack: ["page"],
      selection: { nodeIds: [], edgeIds: [] },
      trace: null,
      ui: { ...initial.ui, openNoteId: "n1", noteListOpen: false, viewerMode: false },
    });
    return useDocStore.getState;
  }

  it("closes when the reader sets a trace of their own", () => {
    const store = openOne();
    store().setTrace(["a"]);
    expect(store().ui.openNoteId).toBeNull();
    // The trace they asked for is still set: closing the note did not undo their action.
    expect(store().trace?.focus).toEqual(["a"]);
  });

  it("closes when the reader clears the trace", () => {
    const store = openOne();
    store().setTrace(null);
    expect(store().ui.openNoteId).toBeNull();
  });

  it("stays open when the selection changes, because selecting is not lighting", () => {
    const store = openOne();
    store().setSelection(["a"]);
    // What a card claims is that the *lit* shapes are what it describes, and lighting is the
    // trace. Selecting leaves the trace alone, so the card is still telling the truth — and the
    // note has to stay open for "set to selection" to be reachable at all.
    expect(store().ui.openNoteId).toBe("n1");
    store().clearSelection();
    expect(store().ui.openNoteId).toBe("n1");
  });

  it("closes when the level changes by any route", () => {
    const store = openOne();
    store().navigateInto("block");
    expect(store().ui.openNoteId).toBeNull();

    useDocStore.setState({ ui: { ...store().ui, openNoteId: "n1" } });
    store().navigateBack();
    expect(store().ui.openNoteId).toBeNull();

    useDocStore.setState({ ui: { ...store().ui, openNoteId: "n1" } });
    store().navigateToDiagram("inside");
    expect(store().ui.openNoteId).toBeNull();
  });

  it("takes the list with it, but leaves the card's side where it was", () => {
    const store = openOne();
    store().setCardSide("left");
    store().setNoteListOpen(true);
    store().closeNote();
    expect(store().ui.noteListOpen).toBe(false);
    // Sticky on purpose: the next note opens where the last card was, which is the whole point
    // of the side-switch rule.
    expect(store().ui.cardSide).toBe("left");
  });
});

beforeEach(() => {
  useDocStore.temporal.getState().clear();
});

describe("writing a note", () => {
  function withNote() {
    const initial = useDocStore.getState();
    useDocStore.setState({
      doc: nestedDoc([note("n1", { diagramId: "page", nodeIds: ["a"] }, "First text.")]),
      navStack: ["page"],
      selection: { nodeIds: [], edgeIds: [] },
      trace: null,
      ui: { ...initial.ui, openNoteId: "n1", viewerMode: false },
    });
    useDocStore.temporal.getState().clear();
    return useDocStore.getState;
  }

  it("changes the text, and an emptied title goes back to the first line of the body", () => {
    const store = withNote();
    store().updateNote("n1", { title: "A title" });
    expect(store().doc.notes?.[0].title).toBe("A title");

    // Blank is not a title, so it is removed rather than stored empty: the note falls back to its
    // first line, as a note that never had one does.
    store().updateNote("n1", { title: "   " });
    expect(store().doc.notes?.[0].title).toBeUndefined();
  });

  it("points a note at something else without touching its text", () => {
    const store = withNote();
    store().setNoteFocus("n1", { diagramId: "page", nodeIds: ["block"] });
    expect(store().doc.notes?.[0].focus.nodeIds).toEqual(["block"]);
    expect(store().doc.notes?.[0].body).toBe("First text.");
  });

  it("refuses to point a note at a level that is not there", () => {
    const store = withNote();
    store().setNoteFocus("n1", { diagramId: "gone" });
    expect(store().doc.notes?.[0].focus.diagramId).toBe("page");
  });

  it("reorders, which is the reading order and nothing else", () => {
    const initial = useDocStore.getState();
    useDocStore.setState({
      doc: nestedDoc([note("n1", { diagramId: "page" }), note("n2", { diagramId: "page" }), note("n3", { diagramId: "page" })]),
      ui: { ...initial.ui, openNoteId: null },
    });
    const store = useDocStore.getState;
    store().reorderNotes(2, 0);
    expect(store().doc.notes?.map((n) => n.id)).toEqual(["n3", "n1", "n2"]);
    // Out of range, and a move to where it already is, change nothing rather than scrambling it.
    const before = store().doc.notes;
    store().reorderNotes(1, 1);
    store().reorderNotes(9, 0);
    expect(store().doc.notes).toBe(before);
  });

  it("is one undo step for an editing session, not one per keystroke", () => {
    const store = withNote();
    const history = useDocStore.temporal.getState();

    // What useEditSession does around a field: pause after the first change, resume on blur.
    store().updateNote("n1", { body: "T" });
    history.pause();
    store().updateNote("n1", { body: "Ty" });
    store().updateNote("n1", { body: "Typed." });
    history.resume();

    expect(store().doc.notes?.[0].body).toBe("Typed.");
    useDocStore.temporal.getState().undo();
    // One press puts back the text as it was before the session, not one letter of it.
    expect(useDocStore.getState().doc.notes?.[0].body).toBe("First text.");
  });

  it("arms the title of a note just added, and disarms it once another is opened", () => {
    const store = withNote();
    const id = store().addNote({ diagramId: "page" }, "") as string;
    expect(store().ui.noteAwaitingTitle).toBe(true);
    expect(store().ui.openNoteId).toBe(id);

    store().openNote("n1");
    expect(store().ui.noteAwaitingTitle).toBe(false);
  });
});

describe("what a marker counts", () => {
  const doc = nestedDoc([
    note("n1", { diagramId: "page", nodeIds: ["a"] }),
    note("n2", { diagramId: "page", nodeIds: ["a", "block"] }),
    note("n3", { diagramId: "inside", nodeIds: ["b"] }),
  ]);

  it("counts the notes naming a shape on this level, and nothing from another", () => {
    expect(notesNaming(doc.notes, "page", "a").map((n) => n.id)).toEqual(["n1", "n2"]);
    expect(notesNaming(doc.notes, "page", "block").map((n) => n.id)).toEqual(["n2"]);
    // "b" is named by a note, but on a different level: this level's marker says nothing about it.
    expect(notesNaming(doc.notes, "page", "b")).toEqual([]);
    expect(notesNaming(doc.notes, "inside", "b").map((n) => n.id)).toEqual(["n3"]);
  });

  it("counts a line the same way a shape is counted", () => {
    const withEdge = nestedDoc([note("e", { diagramId: "page", edgeIds: ["edge1"] })]);
    expect(notesNaming(withEdge.notes, "page", "edge1")).toHaveLength(1);
  });

  it("counts everything written beneath a Nested Block, however deep", () => {
    // A parent advertises the writing inside it; "inside" holds one note.
    expect(notesBelow(doc, "inside").map((n) => n.id)).toEqual(["n3"]);
    // And the page's own notes are not beneath it.
    expect(notesBelow(doc, "page").map((n) => n.id)).toEqual(["n1", "n2", "n3"]);
  });

  it("does not spin on levels that point at each other, and counts a shared level once", () => {
    const loop: DiagramDocument = {
      ...nestedDoc([note("n1", { diagramId: "inside" })]),
      diagrams: {
        page: { id: "page", title: "Page 1", nodes: [{ id: "block", type: "nested", childDiagramId: "inside", position: { x: 0, y: 0 }, size: { w: 10, h: 10 }, z: 1, style: {}, collapsed: { icons: [] }, ports: [] }], edges: [] },
        inside: { id: "inside", title: "Inside", nodes: [{ id: "back", type: "nested", childDiagramId: "page", position: { x: 0, y: 0 }, size: { w: 10, h: 10 }, z: 1, style: {}, collapsed: { icons: [] }, ports: [] }], edges: [] },
      },
    };
    expect(notesBelow(loop, "inside")).toHaveLength(1);
  });

  it("finds nothing beneath a block whose level is gone", () => {
    expect(notesBelow(doc, "never-existed")).toEqual([]);
  });
});
