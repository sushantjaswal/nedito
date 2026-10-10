// Share-slimming: strip everything a *viewer* of the diagram will never need, so the payload
// that has to survive inside a URL is as small as we can honestly make it.
//
// Most of what a share link could drop here — undo history, transient UI state,
// per-level viewport memory — is not in the document at all. It lives in the Zustand store
// alongside `doc` and never reaches `.nedito` either (session state stays out of the document), so there is
// nothing to strip. That leaves two things that really are in the document.
import type { DiagramDocument, Diagram } from "../model/types";

function isEmpty(diagram: Diagram | undefined): boolean {
  return !diagram || (diagram.nodes.length === 0 && diagram.edges.length === 0);
}

/**
 * Every diagram reachable from `roots`, following nested nodes down. A child diagram is kept
 * even when it is empty: its nested box is still on a parent canvas and still opens into it, so
 * dropping it would turn a working box into a dangling reference and fail validation.
 */
function reachableFrom(doc: DiagramDocument, roots: string[]): Set<string> {
  const seen = new Set<string>();
  const queue = [...roots];
  while (queue.length > 0) {
    const id = queue.shift()!;
    if (seen.has(id)) continue;
    seen.add(id);
    for (const node of doc.diagrams[id]?.nodes ?? []) {
      if (node.type === "nested") queue.push(node.childDiagramId);
    }
  }
  return seen;
}

/**
 * Returns a slimmed **copy**; the caller's document is never touched. The round trip through
 * JSON is deliberate as well as convenient: it deep-copies and, in the same pass, drops any
 * `undefined`-valued keys, so what comes back is exactly what will survive serialisation.
 *
 * Two things actually get removed:
 *
 * 1. **Empty pages.** A blank page carries no information to a reader but still costs its
 *    diagram record in the payload. The last page always survives — a document with no pages
 *    is not a document.
 * 2. **Unreachable diagrams.** Deleting a nested node can detach its child "to an unused pool"
 *    (the delete prompt), leaving a diagram in the map that nothing points at. It is
 *    worth keeping in the user's own file; it is dead weight in a link.
 */
export function slimDocForShare(doc: DiagramDocument): DiagramDocument {
  const copy: DiagramDocument = JSON.parse(JSON.stringify(doc));

  const withContent = copy.rootDiagramIds.filter((id) => !isEmpty(copy.diagrams[id]));
  // Falling back to the first page rather than to `rootDiagramIds` wholesale: if every page is
  // blank the user still shared *something*, and one blank page is the honest representation.
  const roots = withContent.length > 0 ? withContent : copy.rootDiagramIds.slice(0, 1);

  const keep = reachableFrom(copy, roots);
  const diagrams: Record<string, Diagram> = {};
  for (const id of Object.keys(copy.diagrams)) {
    if (keep.has(id)) diagrams[id] = copy.diagrams[id];
  }

  return { ...copy, rootDiagramIds: roots, diagrams };
}
