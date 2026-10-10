import type { Diagram, NestedNode } from "../model/types";

// Simple axis-aligned rectangle intersection, used only to detect "was this new shape dropped
// on top of an existing nested-diagram box" — not a general hit-testing utility.
function boxesOverlap(
  a: { x: number; y: number; w: number; h: number },
  bPos: { x: number; y: number },
  bSize: { w: number; h: number },
): boolean {
  return a.x < bPos.x + bSize.w && a.x + a.w > bPos.x && a.y < bPos.y + bSize.h && a.y + a.h > bPos.y;
}

// Used by DiagramCanvas's onDrop: dropping a new shape onto an existing nested-diagram box
// groups it with that box (a real Group, same one Ctrl+G produces), so dragging the box later
// moves the shape with it — reuses the existing group mechanism rather than inventing a new
// attached-icon concept. Exported standalone so this detection logic (the error-prone part) is
// unit-testable without simulating a real HTML5 drag-and-drop DOM event.
export function findNestedNodeUnderDrop(
  diagram: Diagram,
  droppedBox: { x: number; y: number; w: number; h: number },
): NestedNode | null {
  const hit = diagram.nodes.find(
    (n): n is NestedNode => n.type === "nested" && boxesOverlap(droppedBox, n.position, n.size),
  );
  return hit ?? null;
}
