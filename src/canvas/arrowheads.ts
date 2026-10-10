// The arrowhead vocabulary, defined once.
//
// Three consumers have to agree exactly: the canvas (React Flow markers), the SVG export, and
// the Style panel's dropdown. They were three separate literal lists, which is how "classic"
// and "open" ended up known to the renderer but the PDF path quietly rendering neither. One
// table, and a test that walks it, is what keeps a new arrowhead from being half-added.
//
// UML is what forced the first expansion: generalization is a hollow triangle, composition a
// filled diamond, aggregation a hollow one, and none of those is expressible as "open" or
// "classic". Crow's-foot ER forced the second, and forced the shape of this file: a cardinality
// mark is often *two* marks with different paint — "zero or many" is a hollow circle and a
// stroked fork — so a head is a list of parts, not a single path.
//
// Per the templates spec these go in the Style panel first, so a user can draw them by hand:
// a template must never use something the app cannot otherwise produce.

/**
 * How a mark is painted.
 *   "stroke"     — solid, in the edge's colour (classic, composition diamond)
 *   "background" — outlined in the edge's colour, filled with the page behind it. UML's hollow
 *                  triangle and diamond are *not* transparent: the line they terminate would
 *                  show straight through the middle. Same for the crow's-foot "zero" circle.
 *   "none"       — genuinely open, just strokes (the plain "open" chevron, the crow's foot)
 */
export type ArrowheadPaint = "stroke" | "background" | "none";

export interface ArrowheadPart {
  /** SVG path in a 0 0 10 10 viewBox, pointing right (+x is along the line, toward the node). */
  d: string;
  fill: ArrowheadPaint;
}

export interface ArrowheadDef {
  id: string;
  label: string;
  /** Drawn in order, so a later part sits on top of an earlier one. */
  parts: ArrowheadPart[];
  /**
   * Where the line should stop relative to the marker box. A closed head is drawn tip-forward
   * so the line ends behind it; an open head is a pair of strokes the line runs into.
   */
  refX: number;
}

/** Shorthand for the common case: one path, one paint. */
function one(id: string, label: string, d: string, fill: ArrowheadPaint, refX: number): ArrowheadDef {
  return { id, label, parts: [{ d, fill }], refX };
}

// Crow's-foot geometry.
//
// The fork's apex is at the *back* (away from the entity) and its prongs open forward onto the
// entity's border, which is how the notation reads: "many of these attach here". A qualifier —
// the "one" bar or the "zero" ring — sits *behind* the fork, clearly clear of it. The fork
// therefore stops short of the back of the box to leave that room; drawn spanning the whole
// box, the bar landed inside the prongs and the pair read as one smudge.
const CROW = "M3.5,5 L10,0 M3.5,5 L10,5 M3.5,5 L10,10";
/** Qualifier positions for a head that also carries the fork. */
const BAR_BEHIND_CROW = "M1.2,1 L1.2,9";
const RING_BEHIND_CROW = ring(1.4);
/**
 * Qualifier positions for a head with no fork, which can sit nearer the entity.
 * Two ticks is the notation for mandatory-and-only-one; a ring plus one tick is "zero or one".
 */
const BAR_INNER = "M8,1 L8,9";
const BAR_OUTER = "M5,1 L5,9";
const RING_ALONE = ring(4.2);

/** An opaque circle of radius 1.8 centred at (cx, 5), so the line cannot run through it. */
function ring(cx: number): string {
  return `M${cx},5 m-1.8,0 a1.8,1.8 0 1,0 3.6,0 a1.8,1.8 0 1,0 -3.6,0`;
}

export const ARROWHEADS: ArrowheadDef[] = [
  one("open", "Open", "M1,1 L9,5 L1,9", "none", 8),
  one("classic", "Classic", "M0,0 L10,5 L0,10 Z", "stroke", 8),
  // UML generalization / realization.
  one("triangle", "Triangle (hollow)", "M0.5,0.5 L9.5,5 L0.5,9.5 Z", "background", 9),
  // UML composition.
  one("diamond", "Diamond (filled)", "M0,5 L5,0 L10,5 L5,10 Z", "stroke", 9),
  // UML aggregation.
  one("diamond-open", "Diamond (hollow)", "M0.5,5 L5,0.5 L9.5,5 L5,9.5 Z", "background", 9),

  // Crow's-foot ER cardinality. The names are the ones the notation itself uses, so someone
  // reading a data model can pick the mark by what it means rather than by what it looks like.
  one("crows-foot", "Crow's foot (many)", CROW, "none", 10),
  { id: "er-one", label: "ER: exactly one", parts: [{ d: `${BAR_OUTER} ${BAR_INNER}`, fill: "none" }], refX: 10 },
  {
    id: "er-zero-or-one",
    label: "ER: zero or one",
    parts: [
      { d: BAR_INNER, fill: "none" },
      { d: RING_ALONE, fill: "background" },
    ],
    refX: 10,
  },
  {
    id: "er-one-or-many",
    label: "ER: one or many",
    parts: [
      { d: CROW, fill: "none" },
      { d: BAR_BEHIND_CROW, fill: "none" },
    ],
    refX: 10,
  },
  {
    id: "er-zero-or-many",
    label: "ER: zero or many",
    parts: [
      { d: CROW, fill: "none" },
      { d: RING_BEHIND_CROW, fill: "background" },
    ],
    refX: 10,
  },
];

/** "none" is a real choice but has no marker to draw. */
export const ARROWHEAD_OPTIONS = [{ id: "none", label: "None" }, ...ARROWHEADS.map(({ id, label }) => ({ id, label }))];

export function markerDomId(kind: string): string {
  return `nd-arrow-${kind}`;
}

function paintAttrs(fill: ArrowheadPaint, background: string): string {
  const color = "context-stroke";
  if (fill === "stroke") return `fill="${color}" stroke="none"`;
  return `fill="${fill === "background" ? background : "none"}" stroke="${color}" stroke-width="1.25"`;
}

/**
 * The `<marker>` elements, shared verbatim by the canvas and the SVG export.
 *
 * `context-stroke` makes each arrowhead take the colour of the edge it terminates. The markers
 * are defined once per document, so a literal colour here means every arrowhead is that colour
 * whatever its edge — which is why a red edge used to export with a black head.
 */
export function markerDefs(background = "#FFFFFF"): string {
  return ARROWHEADS.map((a) => {
    const body = a.parts.map((p) => `<path d="${p.d}" ${paintAttrs(p.fill, background)} />`).join("");
    return (
      `<marker id="${markerDomId(a.id)}" viewBox="0 0 10 10" refX="${a.refX}" refY="5"` +
      ` markerWidth="8" markerHeight="8" orient="auto-start-reverse">` +
      `${body}</marker>`
    );
  }).join("");
}

/**
 * The bare marker id for an edge's style value, or undefined for "none"/unknown.
 *
 * This is what React Flow wants for an edge's `markerStart`/`markerEnd`: given a string, it treats
 * it as an id and wraps it as `url('#…')` itself. It was once handed `markerUrl`'s already-wrapped
 * value, which produced `url('#url(#nd-arrow-classic)')` — a reference to nothing — so from T2
 * until the render-parity sweep caught it, the canvas drew no arrowheads at all while every export
 * drew them correctly (CLAUDE_HISTORY.md D72).
 */
export function markerId(kind: unknown): string | undefined {
  if (typeof kind !== "string") return undefined;
  return ARROWHEADS.some((a) => a.id === kind) ? markerDomId(kind) : undefined;
}

/** The `url(#…)` reference for an edge's style value, for markup written by hand (the SVG export). */
export function markerUrl(kind: unknown): string | undefined {
  const id = markerId(kind);
  return id ? `url(#${id})` : undefined;
}
