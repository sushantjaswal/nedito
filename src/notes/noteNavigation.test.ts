// Moving between notes, and the events that close one.
import { beforeEach, describe, expect, it } from "vitest";
import { useDocStore } from "../model/store";
import type { DiagramDocument, Note, ShapeNode } from "../model/types";
import { depthMark, noteEntries, notePeek, stepNote } from "./noteNavigation";

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

  it("closes when the selection changes, and when it is cleared", () => {
    const store = openOne();
    store().setSelection(["a"]);
    expect(store().ui.openNoteId).toBeNull();

    useDocStore.setState({ ui: { ...store().ui, openNoteId: "n1" } });
    store().clearSelection();
    expect(store().ui.openNoteId).toBeNull();
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
