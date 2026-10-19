// A small mark on a shape that somebody has written about, so the writing is findable from the
// diagram rather than only from the pager.
//
// Muted ink, not a status colour: a comment is not a warning. It sits in the corner opposite the
// Health badge so the two never argue over the same space, and it disappears with every other
// per-shape ornament once the canvas is zoomed too far out to read them.
import { useMemo } from "react";
import { useDocStore } from "../model/store";
import { commentPeek, commentsBelow, commentsNaming } from "./commentNavigation";
import { commentTitle } from "../model/comments";
import { openCommentAndReveal } from "./revealComment";
import type { DComment } from "../model/types";
import styles from "./CommentMarker.module.css";

/** What the hover shows: the titles, and the first line of the one comment when there is only one. */
function peekOf(comments: DComment[]): string {
  if (comments.length === 1) {
    const body = commentPeek(comments[0]);
    return body ? `${commentTitle(comments[0])}\n${body}` : commentTitle(comments[0]);
  }
  return comments.map((n, i) => `${i + 1}. ${commentTitle(n)}`).join("\n");
}

/** A speech bubble, which is all a marker has to say: somebody wrote about this shape. */
function Bubble() {
  return (
    <svg viewBox="0 0 16 16" width="11" height="11" aria-hidden="true">
      {/* The ordinary comment mark, drawn rather than lettered: it says "there is a comment here"
          and nothing else, so it needs no number to be read. */}
      <path
        d="M2.25 4.25a2 2 0 012-2h7.5a2 2 0 012 2v4.5a2 2 0 01-2 2H7l-3.25 2.75V10.75h-1.5z"
        fill="currentColor"
        opacity="0.18"
      />
      <path
        d="M2.25 4.25a2 2 0 012-2h7.5a2 2 0 012 2v4.5a2 2 0 01-2 2H7l-3.25 2.75V10.75h-1.5z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** The mark on a shape or line that comments on this level name. */
export function CommentMarker({ nodeId }: { nodeId: string }) {
  const diagramId = useDocStore((s) => s.currentDiagramId());
  // The comments array, not a filtered one: a selector that builds a list returns a new array every
  // call, which a store compares by identity and reads as a change — one marker on the canvas was
  // enough to re-render the editor until React gave up. Filter after selecting, memoised.
  const all = useDocStore((s) => s.doc.comments);
  const show = useDocStore((s) => s.ui.commentMarkers);
  const comments = useMemo(() => commentsNaming(all, diagramId, nodeId), [all, diagramId, nodeId]);
  if (!show || comments.length === 0) return null;

  return (
    <button
      type="button"
      className={`${styles.marker} nd-comment-marker nodrag`}
      title={peekOf(comments)}
      aria-label="Comment about this"
      onClick={(e) => {
        e.stopPropagation();
        openCommentAndReveal(comments[0].id);
      }}
      data-testid={`nd-comment-marker-${nodeId}`}
    >
      <Bubble />
    </button>
  );
}

/**
 * The mark on a Nested Block whose child levels hold comments: `N↓`, dashed, so a parent advertises
 * the writing beneath it instead of hiding it. Clicking opens the first, which drills down.
 */
export function NestedCommentMarker({ childDiagramId }: { childDiagramId: string }) {
  // Counting what is below needs the diagram graph as well as the comments, so this one selects the
  // document and memoises on it — same reason as above: never return a fresh array from a selector.
  const doc = useDocStore((s) => s.doc);
  const show = useDocStore((s) => s.ui.commentMarkers);
  const comments = useMemo(() => commentsBelow(doc, childDiagramId), [doc, childDiagramId]);
  if (!show || comments.length === 0) return null;

  return (
    <button
      type="button"
      className={`${styles.marker} ${styles.below} nd-comment-marker nodrag`}
      title={peekOf(comments)}
      aria-label={comments.length === 1 ? "1 comment inside this block" : `${comments.length} comments inside this block`}
      onClick={(e) => {
        e.stopPropagation();
        openCommentAndReveal(comments[0].id);
      }}
      data-testid={`nd-comment-marker-below-${childDiagramId}`}
    >
      {comments.length}
      <span className={styles.down} aria-hidden="true">
        ↓
      </span>
    </button>
  );
}
