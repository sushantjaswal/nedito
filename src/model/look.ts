// Nedito's own default look, and the classic one it replaced.
//
// New shapes and edges are drawn in Nedito's look whenever their style leaves a colour, corner
// or arrowhead unset. Everything made before R6 — every saved document, autosave, share link and
// .nedito.png, and every template — keeps the look it had, through a marker on each shape and
// edge: `style.look = "classic"`. The renderer resolves unset values from the classic table for a
// marked element and from the new one otherwise.
//
// A marker rather than writing today's colours into old documents, because an old edge's colour
// is a theme variable (lighter in dark mode): no literal written into the file could keep that.
// And per element rather than per document, so a shape copied out of an old diagram keeps its look
// in a new one.
import type { DiagramDocument, StyleMap } from "./types";

export const CLASSIC_LOOK = "classic";

/** Whether an element is drawn in the classic (pre-R6) look. */
export function isClassicLook(style: StyleMap | undefined): boolean {
  return style?.look === CLASSIC_LOOK;
}

function stamp(style: StyleMap): StyleMap {
  return style.look === CLASSIC_LOOK ? style : { ...style, look: CLASSIC_LOOK };
}

/** Every shape and edge marked classic. Groups and Nested Blocks draw their own way and are left alone. */
export function stampClassicLook(doc: DiagramDocument): DiagramDocument {
  const diagrams = Object.fromEntries(
    Object.entries(doc.diagrams).map(([id, d]) => [
      id,
      {
        ...d,
        nodes: d.nodes.map((n) => (n.type === "shape" ? { ...n, style: stamp(n.style) } : n)),
        edges: d.edges.map((e) => ({ ...e, style: stamp(e.style) })),
      },
    ]),
  );
  return { ...doc, diagrams };
}

/** True when anything in the document is drawn in Nedito's own look, which only a v5 reader knows. */
export function hasOwnLook(doc: Pick<DiagramDocument, "diagrams">): boolean {
  return Object.values(doc.diagrams).some(
    (d) => d.nodes.some((n) => n.type === "shape" && !isClassicLook(n.style)) || d.edges.some((e) => !isClassicLook(e.style)),
  );
}
