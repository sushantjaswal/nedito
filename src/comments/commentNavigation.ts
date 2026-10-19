// Moving between comments, and what a reader needs to know about one before opening it.
import { findDiagramPath } from "../model/nesting";
import { MAX_NESTING_DEPTH } from "../model/validate";
import { commentTitle } from "../model/comments";
import type { DiagramDocument, DComment } from "../model/types";

export interface CommentEntry {
  comment: DComment;
  /** 1-based, as the pager counts them. */
  number: number;
  /** How many levels below the page this comment's level sits; 0 for a comment on the page itself. */
  depth: number;
  title: string;
  /** The level's own name, for the card's first line. */
  levelTitle: string;
  /** The comment names nothing in particular, so it is about the level as a whole. */
  wholeLevel: boolean;
}

/**
 * Every comment in reading order, with what the pager and the card need alongside it. A comment whose
 * level has gone keeps its place rather than disappearing from the count: it is dropped when the
 * document is written, and until then the reader should not watch the numbering shuffle.
 */
export function commentEntries(doc: DiagramDocument): CommentEntry[] {
  return (doc.comments ?? []).map((comment, i) => {
    const diagram = doc.diagrams[comment.focus.diagramId];
    const path = findDiagramPath(doc, comment.focus.diagramId);
    return {
      comment,
      number: i + 1,
      depth: path ? path.length - 1 : 0,
      title: commentTitle(comment),
      levelTitle: diagram?.title ?? "A level that is no longer here",
      wholeLevel: (comment.focus.nodeIds?.length ?? 0) === 0 && (comment.focus.edgeIds?.length ?? 0) === 0,
    };
  });
}

/** The depth mark the pager and the list draw: one chevron per level below the page. */
export function depthMark(depth: number): string {
  return "›".repeat(Math.min(depth, 4));
}

/**
 * The comment before or after `commentId`, wrapping round at either end so stepping never dead-ends.
 * Returns null when there is nothing to step to.
 */
export function stepComment(doc: DiagramDocument, commentId: string | null, by: 1 | -1): DComment | null {
  const comments = doc.comments ?? [];
  if (comments.length === 0) return null;
  const at = commentId ? comments.findIndex((n) => n.id === commentId) : -1;
  // Nothing open yet: stepping forward starts at the first comment, back at the last.
  if (at === -1) return by === 1 ? comments[0] : comments[comments.length - 1];
  return comments[(at + by + comments.length) % comments.length];
}

/**
 * The comments that name a shape or line, on the level it is on. What a marker counts: a bare dot on
 * a shape three comments talk about would be a lie.
 */
export function commentsNaming(comments: DComment[] | undefined, diagramId: string, id: string): DComment[] {
  return (comments ?? []).filter(
    (n) => n.focus.diagramId === diagramId && (n.focus.nodeIds?.includes(id) || n.focus.edgeIds?.includes(id)),
  );
}

/**
 * The comments written anywhere beneath a Nested Block — its own level and every level under that —
 * so a parent can advertise the writing inside it rather than hiding it. Bounded by the same depth
 * limit the format enforces, and each level counted once however many blocks point at it.
 */
export function commentsBelow(doc: DiagramDocument, childDiagramId: string): DComment[] {
  const levels = new Set<string>();
  const walk = (id: string, depth: number) => {
    if (depth > MAX_NESTING_DEPTH || levels.has(id) || !doc.diagrams[id]) return;
    levels.add(id);
    for (const node of doc.diagrams[id].nodes) {
      if (node.type === "nested") walk(node.childDiagramId, depth + 1);
    }
  };
  walk(childDiagramId, 0);
  return (doc.comments ?? []).filter((n) => levels.has(n.focus.diagramId));
}

/** The first line or so of a comment, for the hover peek. */
export function commentPeek(comment: DComment, max = 90): string {
  const body = comment.body.replace(/\s+/g, " ").trim();
  return body.length > max ? `${body.slice(0, max).trimEnd()}…` : body;
}
