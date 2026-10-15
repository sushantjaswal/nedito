// Moving between notes, and what a reader needs to know about one before opening it.
import { findDiagramPath } from "../model/nesting";
import { MAX_NESTING_DEPTH } from "../model/validate";
import { noteTitle } from "../model/notes";
import type { DiagramDocument, Note } from "../model/types";

export interface NoteEntry {
  note: Note;
  /** 1-based, as the pager counts them. */
  number: number;
  /** How many levels below the page this note's level sits; 0 for a note on the page itself. */
  depth: number;
  title: string;
  /** The level's own name, for the card's first line. */
  levelTitle: string;
  /** The note names nothing in particular, so it is about the level as a whole. */
  wholeLevel: boolean;
}

/**
 * Every note in reading order, with what the pager and the card need alongside it. A note whose
 * level has gone keeps its place rather than disappearing from the count: it is dropped when the
 * document is written, and until then the reader should not watch the numbering shuffle.
 */
export function noteEntries(doc: DiagramDocument): NoteEntry[] {
  return (doc.notes ?? []).map((note, i) => {
    const diagram = doc.diagrams[note.focus.diagramId];
    const path = findDiagramPath(doc, note.focus.diagramId);
    return {
      note,
      number: i + 1,
      depth: path ? path.length - 1 : 0,
      title: noteTitle(note),
      levelTitle: diagram?.title ?? "A level that is no longer here",
      wholeLevel: (note.focus.nodeIds?.length ?? 0) === 0 && (note.focus.edgeIds?.length ?? 0) === 0,
    };
  });
}

/** The depth mark the pager and the list draw: one chevron per level below the page. */
export function depthMark(depth: number): string {
  return "›".repeat(Math.min(depth, 4));
}

/**
 * The note before or after `noteId`, wrapping round at either end so stepping never dead-ends.
 * Returns null when there is nothing to step to.
 */
export function stepNote(doc: DiagramDocument, noteId: string | null, by: 1 | -1): Note | null {
  const notes = doc.notes ?? [];
  if (notes.length === 0) return null;
  const at = noteId ? notes.findIndex((n) => n.id === noteId) : -1;
  // Nothing open yet: stepping forward starts at the first note, back at the last.
  if (at === -1) return by === 1 ? notes[0] : notes[notes.length - 1];
  return notes[(at + by + notes.length) % notes.length];
}

/**
 * The notes that name a shape or line, on the level it is on. What a marker counts: a bare dot on
 * a shape three notes talk about would be a lie.
 */
export function notesNaming(notes: Note[] | undefined, diagramId: string, id: string): Note[] {
  return (notes ?? []).filter(
    (n) => n.focus.diagramId === diagramId && (n.focus.nodeIds?.includes(id) || n.focus.edgeIds?.includes(id)),
  );
}

/**
 * The notes written anywhere beneath a Nested Block — its own level and every level under that —
 * so a parent can advertise the writing inside it rather than hiding it. Bounded by the same depth
 * limit the format enforces, and each level counted once however many blocks point at it.
 */
export function notesBelow(doc: DiagramDocument, childDiagramId: string): Note[] {
  const levels = new Set<string>();
  const walk = (id: string, depth: number) => {
    if (depth > MAX_NESTING_DEPTH || levels.has(id) || !doc.diagrams[id]) return;
    levels.add(id);
    for (const node of doc.diagrams[id].nodes) {
      if (node.type === "nested") walk(node.childDiagramId, depth + 1);
    }
  };
  walk(childDiagramId, 0);
  return (doc.notes ?? []).filter((n) => levels.has(n.focus.diagramId));
}

/** The first line or so of a note, for the hover peek. */
export function notePeek(note: Note, max = 90): string {
  const body = note.body.replace(/\s+/g, " ").trim();
  return body.length > max ? `${body.slice(0, max).trimEnd()}…` : body;
}
