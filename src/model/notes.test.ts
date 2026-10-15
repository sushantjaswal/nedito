// Notes, and the one rule here that runs the opposite way to the rest of the model: a note is
// never lost because something it named was deleted. These are the four things NT1 has to prove.
import { describe, expect, it } from "vitest";
import { CURRENT_FORMAT_VERSION, decodeDoc, encodeDoc, writtenVersion } from "../file/documentFormat";
import { noteTitle, pruneNotes, resolveNotes } from "./notes";
import type { DiagramDocument, DEdge, DNode, Note, ShapeNode } from "./types";
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

function doc(nodes: DNode[], edges: DEdge[] = [], notes?: Note[]): DiagramDocument {
  return {
    formatVersion: CURRENT_FORMAT_VERSION,
    meta: { title: "Untitled", created: "2026-10-14T00:00:00Z", modified: "2026-10-14T00:00:00Z", appVersion: "0.1.0" },
    rootDiagramIds: ["d1"],
    diagrams: { d1: { id: "d1", title: "Page 1", nodes, edges } },
    ...(notes ? { notes } : {}),
  };
}

const note = (id: string, focus: Note["focus"], body = "Why this is here."): Note => ({ id, body, focus });

/** A document as it comes back from a file, which is where the load-time rules run. */
function roundTrip(d: DiagramDocument): DiagramDocument {
  const result = decodeDoc(encodeDoc(d));
  if (!result.ok) throw new Error(`decode failed: ${result.error}`);
  return result.doc;
}

/** A document that genuinely writes version 6 — motion is what v6 is for. */
function v6(notes?: Note[]): DiagramDocument {
  const d = doc([shape("a"), shape("b")], [{ ...edge("e1", "a", "b"), motion: { kind: "flow" } }], notes);
  return d;
}

describe("a document with no notes", () => {
  it("is written exactly as it was, and still reports the version it always did", () => {
    const plain = v6();
    const before = encodeDoc(plain);
    expect(before).not.toContain("notes");
    expect(writtenVersion(plain)).toBe(6);
    expect(JSON.parse(before).formatVersion).toBe(6);

    // An empty array, and one left behind by deleting the last note, are the same document.
    expect(encodeDoc({ ...plain, notes: [] })).toBe(before);
    expect(writtenVersion({ ...plain, notes: [] })).toBe(6);

    // And a document that was never v6 is not dragged up to it either.
    const plainer = doc([shape("a")]);
    expect(writtenVersion({ ...plainer, notes: [] })).toBe(writtenVersion(plainer));
    expect(encodeDoc({ ...plainer, notes: [] })).toBe(encodeDoc(plainer));
  });

  it("still reports version 6 once every note's level is gone", () => {
    // The note is kept in memory for undo; the file it is written to has no notes at all.
    const orphaned = v6([note("n1", { diagramId: "gone" })]);
    expect(pruneNotes(orphaned)).toBeUndefined();
    expect(writtenVersion(orphaned)).toBe(6);
    expect(encodeDoc(orphaned)).toBe(encodeDoc(v6()));
  });

  it("goes to 7 when a note is added and back to 6 when it is taken away", () => {
    const withNote = v6([note("n1", { diagramId: "d1" })]);
    expect(writtenVersion(withNote)).toBe(7);
    expect(writtenVersion({ ...withNote, notes: undefined })).toBe(6);
    expect(encodeDoc({ ...withNote, notes: undefined })).toBe(encodeDoc(v6()));
  });
});

describe("a note whose shapes were deleted", () => {
  const withDeleted = doc(
    [shape("a")],
    [],
    // "b" and the line "e1" were deleted; "a" is still there.
    [note("n1", { diagramId: "d1", nodeIds: ["a", "b"], edgeIds: ["e1"] }, "Keep this writing.")],
  );

  it("is valid: a deleted shape must never make a document refuse to open", () => {
    expect(validateDoc(withDeleted)).toEqual([]);
  });

  it("loses the dangling ids on load and keeps its text", () => {
    const loaded = roundTrip(withDeleted);
    expect(loaded.notes).toHaveLength(1);
    expect(loaded.notes?.[0].body).toBe("Keep this writing.");
    expect(loaded.notes?.[0].focus).toEqual({ diagramId: "d1", nodeIds: ["a"] });
  });

  it("becomes a note about the level when every id it named is gone, rather than vanishing", () => {
    const all = doc([shape("a")], [], [note("n1", { diagramId: "d1", nodeIds: ["gone"], edgeIds: ["also-gone"] })]);
    const loaded = roundTrip(all);
    expect(loaded.notes).toHaveLength(1);
    expect(loaded.notes?.[0].focus).toEqual({ diagramId: "d1" });
  });

  it("leaves a note alone when nothing it names has gone", () => {
    const intact = doc([shape("a"), shape("b")], [edge("e1", "a", "b")], [note("n1", { diagramId: "d1", nodeIds: ["a", "b"], edgeIds: ["e1"] })]);
    // The same array, not a copy: nothing was dropped, so nothing was rebuilt.
    expect(resolveNotes(intact)).toBe(intact.notes);
  });

  it("drops a note whose whole level is gone when the document is written, not before", () => {
    const orphaned = doc([shape("a")], [], [note("n1", { diagramId: "gone" })]);
    expect(validateDoc(orphaned)).toEqual([]);
    expect(resolveNotes(orphaned)).toHaveLength(1);
    expect(pruneNotes(orphaned)).toBeUndefined();
    expect(roundTrip(orphaned).notes).toBeUndefined();
  });
});

describe("a document with notes", () => {
  const notes = [
    note("n1", { diagramId: "d1", nodeIds: ["a"] }, "First."),
    { ...note("n2", { diagramId: "d1" }, "Second.\nOn two lines."), title: "A title" },
    note("n3", { diagramId: "d1", edgeIds: ["e1"] }, "Third."),
  ];
  const written = doc([shape("a"), shape("b")], [edge("e1", "a", "b")], notes);

  it("round-trips with its notes and their order unchanged, and reports version 7", () => {
    expect(writtenVersion(written)).toBe(7);
    const text = encodeDoc(written);
    expect(JSON.parse(text).formatVersion).toBe(7);

    const loaded = roundTrip(written);
    expect(loaded.notes).toEqual(notes);
    expect(loaded.notes?.map((n) => n.id)).toEqual(["n1", "n2", "n3"]);
    // Saving what was loaded gives the same file back.
    expect(encodeDoc(loaded)).toBe(text);
  });

  it("writes notes after the diagrams they are about and before the pictures", () => {
    const keys = Object.keys(JSON.parse(encodeDoc(written)));
    expect(keys.indexOf("notes")).toBeGreaterThan(keys.indexOf("diagrams"));
  });

  it("writes a note's keys in one order, however the note was built in memory", () => {
    const sameNoteOtherOrder: Note = { focus: { nodeIds: ["a"], diagramId: "d1" }, body: "First.", id: "n1" } as Note;
    expect(encodeDoc(doc([shape("a")], [], [sameNoteOtherOrder]))).toBe(
      encodeDoc(doc([shape("a")], [], [note("n1", { diagramId: "d1", nodeIds: ["a"] }, "First.")])),
    );
  });

  it("gives a note its title, or the first line it actually says", () => {
    expect(noteTitle(notes[1])).toBe("A title");
    expect(noteTitle(notes[0])).toBe("First.");
    expect(noteTitle({ ...notes[0], body: "\n\n  Indented first line\nmore" })).toBe("Indented first line");
    expect(noteTitle({ ...notes[0], body: "" })).toBe("Untitled note");
  });

  it("refuses a file written by a newer app than this one", () => {
    const text = encodeDoc(written).replace('"formatVersion": 7', `"formatVersion": ${CURRENT_FORMAT_VERSION + 1}`);
    const result = decodeDoc(text);
    expect(result.ok).toBe(false);
  });
});

describe("a note from a document that may come from anyone", () => {
  it("is dropped when it is not shaped like a note, and kept when it is", () => {
    const hostile = JSON.stringify({
      format: "nedito",
      formatVersion: 7,
      meta: { title: "x", created: "x", modified: "x", appVersion: "0.1.0" },
      rootDiagramIds: ["d1"],
      diagrams: { d1: { id: "d1", title: "P", nodes: [shape("a")], edges: [] } },
      notes: [
        "not a note",
        { id: "n1", body: { not: "text" }, focus: { diagramId: "d1" } },
        { id: "n2", body: "fine", focus: "not a focus" },
        { id: "n3", body: "kept", focus: { diagramId: "d1", nodeIds: ["a", 7, null] } },
      ],
    });
    const result = decodeDoc(hostile);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // n1 keeps its id and level but loses a body that was never text; n2 named no level at all.
    expect(result.doc.notes?.map((n) => n.id)).toEqual(["n1", "n3"]);
    expect(result.doc.notes?.[0].body).toBe("");
    expect(result.doc.notes?.[1].focus.nodeIds).toEqual(["a"]);
  });

  it("is rejected when two notes, or a note and a shape, share an id", () => {
    const clash = doc([shape("a")], [], [note("n1", { diagramId: "d1" }), note("n1", { diagramId: "d1" })]);
    expect(validateDoc(clash).map((e) => e.code)).toContain("DUPLICATE_ID");
    expect(validateDoc(doc([shape("a")], [], [note("a", { diagramId: "d1" })])).map((e) => e.code)).toContain("DUPLICATE_ID");
  });
});

describe("the open note is session state", () => {
  /** An empty document in the store, as store.test.ts sets one up. */
  const freshStore = () => {
    const initial = useDocStore.getState();
    const rootId = initial.doc.rootDiagramIds[0];
    useDocStore.setState({
      doc: { ...initial.doc, rootDiagramIds: [rootId], diagrams: { [rootId]: { id: rootId, title: "Page 1", nodes: [], edges: [] } }, notes: undefined },
      navStack: [rootId],
      selection: { nodeIds: [], edgeIds: [] },
      ui: { ...initial.ui, openNoteId: null, viewerMode: false },
    });
    useDocStore.temporal.getState().clear();
    return useDocStore.getState;
  };

  it("opens with a new note, closes through one place, and never reaches the document", () => {
    const store = freshStore();
    const diagramId = store().currentDiagramId();

    const id = store().addNote({ diagramId }, "Why this is here.");
    expect(id).not.toBeNull();
    expect(store().ui.openNoteId).toBe(id);

    store().closeNote();
    expect(store().ui.openNoteId).toBeNull();
    // Closing a note that is already closed is not a change, so nothing re-renders for it.
    const before = store().ui;
    store().closeNote();
    expect(store().ui).toBe(before);

    // Deleting the open note closes it, through closeNote rather than by clearing the id itself.
    store().openNote(id as string);
    store().deleteNote(id as string);
    expect(store().ui.openNoteId).toBeNull();

    // Which note is open is not a property of the document, so it is not written to one.
    expect(encodeDoc(store().doc)).not.toContain("openNoteId");
  });

  it("is outside the undo history: the history records the document alone", () => {
    const store = freshStore();
    const id = store().addNote({ diagramId: store().currentDiagramId() }, "Text.") as string;
    store().closeNote();

    // Undoing the note's creation must not bring back the fact that it was open.
    useDocStore.temporal.getState().undo();
    expect(store().doc.notes).toBeUndefined();
    expect(store().ui.openNoteId).toBeNull();
    expect(id).toBeTruthy();
  });
});
