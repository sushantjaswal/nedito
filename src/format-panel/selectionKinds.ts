// What a selection holds, as the formatting controls see it — shared by the context bar, which
// decides its buttons from it, and the style sections, which act on it (R1, D90).
import { useMemo } from "react";
import { chooseAndReplaceImage } from "../app/insertImage";
import { IMAGE_SHAPE_REF } from "../model/assets";
import { useDocStore } from "../model/store";
import type { DNode, ShapeNode } from "../model/types";

/** The plain shapes in a selection: what fill, line and effects apply to. */
export function styledShapes(nodes: DNode[]): ShapeNode[] {
  return nodes.filter((n): n is ShapeNode => n.type === "shape");
}

/** True when every styled shape is a picture, which gets the Image section instead. */
export function allPictures(nodes: DNode[]): boolean {
  const shapes = styledShapes(nodes);
  return shapes.length > 0 && shapes.every((n) => n.shapeRef === IMAGE_SHAPE_REF);
}

/** Replace and Original size: one picture's two commands, on the bar itself rather than in a popover. */
export function useImageActions(nodes: DNode[]): { replace: () => void; originalSize: () => void } | null {
  const resetImageSize = useDocStore((s) => s.resetImageSize);
  // Only for exactly one picture, and the same object for as long as it is that picture: the
  // context bar rebuilds its buttons when this changes, and re-measures when they do.
  const shapes = styledShapes(nodes);
  const id = shapes.length === 1 && shapes[0].shapeRef === IMAGE_SHAPE_REF ? shapes[0].id : null;
  return useMemo(
    () => (id ? { replace: () => void chooseAndReplaceImage(id), originalSize: () => resetImageSize(id) } : null),
    [id, resetImageSize],
  );
}
