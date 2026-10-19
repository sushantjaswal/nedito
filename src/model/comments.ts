// Comments: what the author wrote about a diagram, and the two moments where a comment meets a document
// that has moved on under it.
//
// The rule that shapes this file, and which runs the opposite way to the rest of the model: **a
// comment is never lost because something it named was deleted.** A port's `innerNodeId` must resolve
// or the document is invalid; a comment's ids need not. A comment is writing someone did, and throwing it
// away because a box was deleted is the worse failure by a long way. So:
//
//   - **On load**, ids that no longer resolve are dropped and the comment is kept. If every id goes,
//     the comment is simply a comment about the level, which is a real kind of comment rather than a
//     damaged one.
//   - **On write**, a comment whose whole level is gone is dropped, the same way pruneOrders drops a
//     presentation step for a deleted shape. It is kept in memory until then so that undoing the
//     deletion brings the comment back with it.
//
// Validation treats neither as an error. There is a test for that, because it reads like a bug.
import type { DiagramDocument, DComment, CommentFocus } from "./types";

/** Every node and edge id on one level, for resolving what a comment names. */
function idsOn(doc: DiagramDocument, diagramId: string): Set<string> | null {
  const diagram = doc.diagrams[diagramId];
  if (!diagram) return null;
  return new Set([...diagram.nodes.map((n) => n.id), ...diagram.edges.map((e) => e.id)]);
}

/** The same array when nothing was dropped, so an unchanged comment keeps its identity. */
function kept(ids: string[] | undefined, live: Set<string>): string[] | undefined {
  if (!ids || ids.length === 0) return undefined;
  const out = ids.filter((id) => live.has(id));
  if (out.length === 0) return undefined;
  return out.length === ids.length ? ids : out;
}

/**
 * Drops the ids a comment names that no longer exist, keeping the comment. A comment whose level is gone is
 * left exactly as it is: loading is lenient, and `pruneComments` is what removes it when the document
 * is written.
 */
export function resolveComments(doc: DiagramDocument): DComment[] | undefined {
  if (!doc.comments || doc.comments.length === 0) return undefined;
  let changed = false;
  const out = doc.comments.map((comment) => {
    const live = idsOn(doc, comment.focus.diagramId);
    if (!live) return comment;
    const nodeIds = kept(comment.focus.nodeIds, live);
    const edgeIds = kept(comment.focus.edgeIds, live);
    if (nodeIds === comment.focus.nodeIds && edgeIds === comment.focus.edgeIds) return comment;
    changed = true;
    return {
      ...comment,
      focus: { diagramId: comment.focus.diagramId, ...(nodeIds ? { nodeIds } : {}), ...(edgeIds ? { edgeIds } : {}) },
    };
  });
  return changed ? out : doc.comments;
}

/**
 * The comments a file should carry: those whose level still exists. Returns undefined when none are
 * left, so a document that has lost its last comment is written exactly as a document that never had
 * one — which is what keeps a comments-free file byte for byte as it was, and still version 6.
 */
export function pruneComments(doc: DiagramDocument): DComment[] | undefined {
  if (!doc.comments || doc.comments.length === 0) return undefined;
  const out = doc.comments
    .filter((comment) => doc.diagrams[comment.focus.diagramId] && !isBlank(comment))
    .map(canonical);
  return out.length === 0 ? undefined : out;
}

/**
 * A comment with nothing written in it yet — no title and no text.
 *
 * Asking for a comment creates one before there is anything to say, so the card has something to
 * bind to while it is being written. Such a comment is not writing anybody did: it wears no marker,
 * is not counted and is not listed, it is discarded when its card closes, and the line above keeps
 * it out of every file and share link, in case the document is written while one is still open.
 * So a blank comment exists only while its own card is open, which is the only place it means
 * anything.
 */
export function isBlank(comment: DComment): boolean {
  return !comment.title?.trim() && !comment.body.trim();
}

/**
 * One comment, with its keys in the order a file writes them. JSON.stringify follows insertion
 * order, so without this a comment built as `{ body, id }` and the same comment built as `{ id, body }`
 * would make different files — and loading one and saving it would rewrite every line. The format
 * promises documents that diff cleanly, which means one spelling per comment. Sorted diagrams keep
 * the same promise one level up.
 */
function canonical(comment: DComment): DComment {
  return {
    id: comment.id,
    ...(comment.title !== undefined ? { title: comment.title } : {}),
    body: comment.body,
    focus: {
      diagramId: comment.focus.diagramId,
      ...(comment.focus.nodeIds?.length ? { nodeIds: comment.focus.nodeIds } : {}),
      ...(comment.focus.edgeIds?.length ? { edgeIds: comment.focus.edgeIds } : {}),
    },
  };
}

/**
 * Where a new comment belongs in the reading order: **beside the comments about the same thing**, not at
 * the end of the document.
 *
 * Appending looked right until a shape had two comments. The second one landed wherever the document
 * happened to end — a shape with comments 1 and 8, with six unrelated comments between them — and the
 * reading order stopped meaning anything, because a walk through a diagram does not visit the same
 * box twice. A comment about something joins the run of comments about that same something.
 *
 * A comment about the level as a whole has no shape to join, so it goes at the end.
 */
export function commentInsertionIndex(comments: DComment[], focus: CommentFocus): number {
  const named = new Set([...(focus.nodeIds ?? []), ...(focus.edgeIds ?? [])]);
  if (named.size === 0) return comments.length;
  let after = -1;
  comments.forEach((comment, i) => {
    if (comment.focus.diagramId !== focus.diagramId) return;
    const theirs = [...(comment.focus.nodeIds ?? []), ...(comment.focus.edgeIds ?? [])];
    if (theirs.some((id) => named.has(id))) after = i;
  });
  return after === -1 ? comments.length : after + 1;
}

/** What a comment is called in a list: its title, or the first line of what it says. */
export function commentTitle(comment: DComment): string {
  const title = comment.title?.trim();
  if (title) return title;
  const first = comment.body.split("\n").find((line) => line.trim() !== "");
  return first?.trim() ?? "Untitled comment";
}
