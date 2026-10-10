// Where an image node's label goes: below the picture, as in draw.io (CLAUDE_HISTORY.md D79).
// Shared by the canvas, the SVG exporter and diagram bounds, so all three put it in the same
// place. The label never wraps: the exporter draws exactly one line per line the author typed,
// and a wrapping canvas label would disagree with it on any long caption.

/** Space between the bottom of the picture and the label's first line. */
export const IMAGE_LABEL_GAP = 4;
/** Line height as a multiple of the font size — the same ratio the exporter uses everywhere. */
export const LABEL_LINE_HEIGHT = 1.25;

/** The vertical extent of a label under an image of height `h`, in node coordinates. */
export function imageLabelBox(
  h: number,
  lineCount: number,
  fontSize: number,
  above = false,
): { top: number; bottom: number; lineHeight: number } {
  const lineHeight = fontSize * LABEL_LINE_HEIGHT;
  // Above, as draw.io's verticalLabelPosition=top puts it: for a shape whose lines leave
  // downward, where a caption below would sit across them.
  const top = above ? -IMAGE_LABEL_GAP - lineCount * lineHeight : h + IMAGE_LABEL_GAP;
  return { top, bottom: top + lineCount * lineHeight, lineHeight };
}
