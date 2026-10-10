// Ids for the invisible anchors a free line end hangs from (PointNode.tsx), kept apart from the
// component so it stays a components-only module.
import type { Node } from "@xyflow/react";

export const POINT_HANDLE = "pt";
const PREFIX = "nd-pt:";

export type FlowPointNode = Node<Record<string, never>, "point">;

export function pointNodeId(edgeId: string, end: "source" | "target"): string {
  return `${PREFIX}${edgeId}:${end}`;
}

export function isPointNodeId(id: string): boolean {
  return id.startsWith(PREFIX);
}

/** The edge a point node anchors, from its id (edge ids are nanoids, which never contain ":"). */
export function edgeIdOfPointNode(id: string): string {
  return id.slice(PREFIX.length, id.lastIndexOf(":"));
}
