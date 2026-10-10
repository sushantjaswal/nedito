// What a line end is being dropped on: the shape under the pointer, and which of its handles.
//
// draw.io attaches a dragged line end to whatever shape it is let go over, not only when it lands
// exactly on a connection point; anywhere else it stays where it was dropped, as a free end. Both
// a line's endpoint drag (DiagramEdge) and a new connection let go short of a handle
// (DiagramCanvas's onConnectEnd) ask this the same question.
import type { DNode } from "../model/types";
import { isPointNodeId } from "./pointNodeIds";

export interface DropTarget {
  nodeId: string;
  handleId: string;
}

type Side = "top" | "right" | "bottom" | "left";

/** The side of `box` nearest to `p`, which is where an end dropped on the shape's body attaches. */
export function nearestSide(box: { x: number; y: number; w: number; h: number }, p: { x: number; y: number }): Side {
  const gaps: [number, Side][] = [
    [Math.abs(p.y - box.y), "top"],
    [Math.abs(box.x + box.w - p.x), "right"],
    [Math.abs(box.y + box.h - p.y), "bottom"],
    [Math.abs(p.x - box.x), "left"],
  ];
  gaps.sort((a, b) => a[0] - b[0]);
  return gaps[0][1];
}

/**
 * The shape under a screen point and the handle to attach to: the exact handle when the pointer
 * is on one, otherwise the side of the shape nearest the drop. Groups are only chosen when no
 * shape inside them is under the pointer, and `exclude` (the line's own other end) never is.
 */
export function dropTargetAt(
  client: { x: number; y: number },
  flow: { x: number; y: number },
  nodes: DNode[],
  exclude?: string,
): DropTarget | null {
  if (typeof document === "undefined" || !document.elementsFromPoint) return null;
  const byId = new Map(nodes.map((n) => [n.id, n]));
  let group: DropTarget | null = null;
  for (const el of document.elementsFromPoint(client.x, client.y)) {
    const nodeEl = el.closest<HTMLElement>(".react-flow__node");
    const id = nodeEl?.dataset.id;
    if (!id || isPointNodeId(id) || id === exclude) continue;
    const node = byId.get(id);
    if (!node) continue;
    const handleEl = el.closest<HTMLElement>(".react-flow__handle");
    const handleId = handleEl?.dataset.handleid;
    const target: DropTarget = {
      nodeId: id,
      handleId: handleId ?? nearestSide({ x: node.position.x, y: node.position.y, w: node.size.w, h: node.size.h }, flow),
    };
    if (node.type === "group") {
      group ??= target;
      continue;
    }
    return target;
  }
  return group;
}
