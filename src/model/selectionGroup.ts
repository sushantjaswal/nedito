// Which group, if any, the current selection is — however it was selected.
//
// A selection "is" a group when it is the group's own id, its member shapes (rubber-banding the
// shapes inside a group selects them one by one, CLAUDE_HISTORY D32), or both at once (a rubber
// band sweeping the group's frame and its members reports all of their ids, D33). The context
// menu and the Arrange tab each worked this out for themselves; the Arrange menu did not, and
// offered Ungroup for any single shape (CLAUDE_HISTORY D84). One rule now serves all three.
import type { DNode, GroupNode } from "./types";

export function groupOfSelection(nodes: DNode[], nodeIds: string[]): GroupNode | undefined {
  if (nodeIds.length === 0) return undefined;
  return nodes.find(
    (n): n is GroupNode => n.type === "group" && nodeIds.every((id) => id === n.id || n.childIds.includes(id)),
  );
}

/** Group is offered for two or more shapes that are not already one group. */
export function canGroupSelection(nodes: DNode[], nodeIds: string[]): boolean {
  return nodeIds.length >= 2 && !groupOfSelection(nodes, nodeIds);
}

/** Ungroup is offered when the selection is a group. */
export function canUngroupSelection(nodes: DNode[], nodeIds: string[]): boolean {
  return Boolean(groupOfSelection(nodes, nodeIds));
}
