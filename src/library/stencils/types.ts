import type { StyleMap } from "../../model/types";

// A StencilDef's svgBody is original geometry drawn for Nedito (not copied
// or traced from any other tool's stencils), assumed to sit in a 0 0 100 100 viewBox with no fill/stroke set, so ShapeNode
// can theme it via the node's own style map (fill is an inherited SVG property).
//
// `raw`, when present, takes over rendering instead: it's a complete, self-contained
// <svg>...</svg> (own viewBox, own fixed colors/gradients) sourced verbatim from an official
// vendor icon pack (Azure/AWS/GCP — the only vendor icon sets used, each
// under its published terms; see NOTICE at the repo root). Vendor usage terms require showing these "as they would appear" in their own
// product, so unlike drawn shapes they are never recolored via the node's fill/stroke style.
export interface StencilDef {
  id: string; // e.g. "general/rect"
  label: string;
  defaultSize: { w: number; h: number };
  /**
   * The body drawn in Nedito's own look, where it differs from
   * `svgBody` — which stays the classic drawing, for shapes marked `look: "classic"`.
   */
  lookBody?: string;
  svgBody: string;
  raw?: string;
  /**
   * Extra words the sidebar search should match besides the label. One icon has one name but
   * several honest descriptions, and the picker is 700+ shapes deep — someone looking for a
   * flame types "fire", not "Flame". Never needed for the word already in the label, and never
   * for the stencil id's own words: search matches both of those on its own (see
   * library/ShapeLibrary.tsx), which is also what keeps a renamed shape findable under the
   * Material Symbols name it used to carry.
   */
  keywords?: string[];
  /**
   * The part of the shape its label belongs in, in the same 0..100 units as svgBody, when that
   * is not the whole shape: a C4 person's body, not across its head. `vertical` turns the text
   * to read bottom to top, for a BPMN pool's name band. "below" hangs the label under the shape,
   * as for a picture: a stick figure, an event circle, a network device. See canvas/labelLayout.ts.
   */
  labelBox?: { x: number; y: number; w: number; h: number; vertical?: boolean } | "below";
  /**
   * The fill a freshly placed shape takes, when white paper is wrong for it: "none" for a
   * container (a filled boundary hides the connections drawn inside it), ink for UML's solid
   * initial node and fork bar.
   */
  defaultFill?: string;
  /**
   * Style a freshly placed shape starts with, written onto the node so the format panel shows it
   * and the user can change it: a dashed line arrives dashed, with "Dashed" in Line pattern.
   */
  defaultStyle?: StyleMap;
  /**
   * Places a line instead of a shape: an edge with free ends (draw.io's dangling edge), which can
   * then be bent, restyled and dropped onto shapes at either end. Points are in the stencil's
   * defaultSize box; the svgBody is only the picker's picture of it.
   */
  line?: { from: { x: number; y: number }; to: { x: number; y: number }; waypoints?: { x: number; y: number }[]; style: StyleMap };
  /**
   * Withdrawn from the picker and from search, but still drawn wherever a saved diagram uses
   * it. For a shape that does not belong in its section (a game controller among network
   * devices) yet has no exact replacement to alias it to — see RETIRED_STENCIL_IDS for those.
   */
  hidden?: boolean;
  /**
   * An original pictogram (the animated icons and their still twins, D124): drawn and themed like
   * the Material Symbols ones — a silhouette in the shape's fill, its line work in `currentColor`,
   * which the glyph sets to that fill — though it has none of their wrapper markup.
   */
  pictogram?: true;
  /** An animated icon (D124): the id of its still twin, the same drawing standing still. */
  animated?: { still: string };
}

export interface StencilSection {
  id: string;
  name: string;
  shapes: StencilDef[];
}
