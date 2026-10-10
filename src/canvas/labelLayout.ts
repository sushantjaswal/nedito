// Where a shape's label goes, shared by the canvas and every export so they cannot disagree.
//
// A label normally fills the whole shape, centred. Two things move it:
//   - the stencil's own label area, for shapes with a part the text belongs in — a C4 person's
//     body rather than across its head, a UML package's tab-less body (StencilDef.labelBox);
//   - the node's `verticalAlign` style, "top" for a container or lane whose title belongs at its
//     head rather than in the middle of whatever it holds.
import { isIconStyleStencil } from "../library/stencils/defaultStyle";
import type { StencilDef } from "../library/stencils/types";
import { IMAGE_SHAPE_REF } from "../model/assets";
import type { StyleMap } from "../model/types";

export type VerticalAlign = "top" | "middle" | "bottom";

export interface LabelArea {
  x: number;
  y: number;
  w: number;
  h: number;
  /** Text turned to read bottom to top, as on a BPMN pool's name band. */
  vertical?: boolean;
}

export function labelArea(stencil: StencilDef | undefined, w: number, h: number, style?: StyleMap): LabelArea {
  const box = stencil?.labelBox;
  if (!box || box === "below") return style && textVertical(style) ? { x: 0, y: 0, w, h, vertical: true } : { x: 0, y: 0, w, h };
  const area = { x: (box.x / 100) * w, y: (box.y / 100) * h, w: (box.w / 100) * w, h: (box.h / 100) * h };
  return box.vertical ? { ...area, vertical: true } : area;
}

/** The label's side padding, at most 8px. */
export const LABEL_SIDE_PAD = 8;

/**
 * The space a label keeps from its box's sides: 8px, but a tenth of the width on a narrow box (2px
 * at the least), so a short word in a narrow shape is not broken in two — a table's 30px "PK"
 * column kept only 14px of its 30 for text, and wrapped to "P / K" (D139). Shared by the canvas
 * and the export, which places left- and right-aligned text by it.
 */
export function labelSidePad(width: number): number {
  return Math.min(LABEL_SIDE_PAD, Math.max(2, Math.round(width * 0.1)));
}

export function verticalAlignOf(style: StyleMap): VerticalAlign {
  const v = style.verticalAlign;
  return v === "top" || v === "bottom" ? v : "middle";
}

/**
 * Whether the label hangs below the shape instead of sitting on it: a picture, a vendor icon or a
 * pictogram, where text across the drawing would hide it.
 */
export function labelHangsBelow(shapeRef: string | undefined, stencil: StencilDef | undefined, style?: StyleMap): boolean {
  if (shapeRef === IMAGE_SHAPE_REF) return true;
  // verticalLabelPosition hangs any shape's label outside it, above or below.
  if (style && (style.verticalLabelPosition === "bottom" || style.verticalLabelPosition === "top")) return true;
  return !!stencil && (!!stencil.raw || stencil.labelBox === "below" || isIconStyleStencil(stencil));
}

/** A hung caption goes above the shape instead of below it (verticalLabelPosition=top). */
export function captionAbove(style: StyleMap): boolean {
  return style.verticalLabelPosition === "top";
}

/** Text turned to read bottom to top (horizontal=0). */
export function textVertical(style: StyleMap): boolean {
  return style.horizontal === false || style.horizontal === 0 || style.horizontal === "0";
}
