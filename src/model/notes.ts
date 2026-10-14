// Notes: what the author wrote about a diagram, and the two moments where a note meets a document
// that has moved on under it.
//
// The rule that shapes this file, and which runs the opposite way to the rest of the model: **a
// note is never lost because something it named was deleted.** A port's `innerNodeId` must resolve
// or the document is invalid; a note's ids need not. A note is writing someone did, and throwing it
// away because a box was deleted is the worse failure by a long way. So:
//
//   - **On load**, ids that no longer resolve are dropped and the note is kept. If every id goes,
//     the note is simply a note about the level, which is a real kind of note rather than a
//     damaged one.
//   - **On write**, a note whose whole level is gone is dropped, the same way pruneOrders drops a
//     presentation step for a deleted shape. It is kept in memory until then so that undoing the
//     deletion brings the note back with it.
//
// Validation treats neither as an error. There is a test for that, because it reads like a bug.
import type { DiagramDocument, Note } from "./types";

/** Every node and edge id on one level, for resolving what a note names. */
function idsOn(doc: DiagramDocument, diagramId: string): Set<string> | null {
  const diagram = doc.diagrams[diagramId];
  if (!diagram) return null;
  return new Set([...diagram.nodes.map((n) => n.id), ...diagram.edges.map((e) => e.id)]);
}

/** The same array when nothing was dropped, so an unchanged note keeps its identity. */
function kept(ids: string[] | undefined, live: Set<string>): string[] | undefined {
  if (!ids || ids.length === 0) return undefined;
  const out = ids.filter((id) => live.has(id));
  if (out.length === 0) return undefined;
  return out.length === ids.length ? ids : out;
}

/**
 * Drops the ids a note names that no longer exist, keeping the note. A note whose level is gone is
 * left exactly as it is: loading is lenient, and `pruneNotes` is what removes it when the document
 * is written.
 */
export function resolveNotes(doc: DiagramDocument): Note[] | undefined {
  if (!doc.notes || doc.notes.length === 0) return undefined;
  let changed = false;
  const out = doc.notes.map((note) => {
    const live = idsOn(doc, note.focus.diagramId);
    if (!live) return note;
    const nodeIds = kept(note.focus.nodeIds, live);
    const edgeIds = kept(note.focus.edgeIds, live);
    if (nodeIds === note.focus.nodeIds && edgeIds === note.focus.edgeIds) return note;
    changed = true;
    return {
      ...note,
      focus: { diagramId: note.focus.diagramId, ...(nodeIds ? { nodeIds } : {}), ...(edgeIds ? { edgeIds } : {}) },
    };
  });
  return changed ? out : doc.notes;
}

/**
 * The notes a file should carry: those whose level still exists. Returns undefined when none are
 * left, so a document that has lost its last note is written exactly as a document that never had
 * one — which is what keeps a notes-free file byte for byte as it was, and still version 6.
 */
export function pruneNotes(doc: DiagramDocument): Note[] | undefined {
  if (!doc.notes || doc.notes.length === 0) return undefined;
  const out = doc.notes.filter((note) => doc.diagrams[note.focus.diagramId]).map(canonical);
  return out.length === 0 ? undefined : out;
}

/**
 * One note, with its keys in the order a file writes them. JSON.stringify follows insertion
 * order, so without this a note built as `{ body, id }` and the same note built as `{ id, body }`
 * would make different files — and loading one and saving it would rewrite every line. The format
 * promises documents that diff cleanly, which means one spelling per note. Sorted diagrams keep
 * the same promise one level up.
 */
function canonical(note: Note): Note {
  return {
    id: note.id,
    ...(note.title !== undefined ? { title: note.title } : {}),
    body: note.body,
    focus: {
      diagramId: note.focus.diagramId,
      ...(note.focus.nodeIds?.length ? { nodeIds: note.focus.nodeIds } : {}),
      ...(note.focus.edgeIds?.length ? { edgeIds: note.focus.edgeIds } : {}),
    },
  };
}

/** What a note is called in a list: its title, or the first line of what it says. */
export function noteTitle(note: Note): string {
  const title = note.title?.trim();
  if (title) return title;
  const first = note.body.split("\n").find((line) => line.trim() !== "");
  return first?.trim() ?? "Untitled note";
}
