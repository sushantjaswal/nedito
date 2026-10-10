import { memo } from "react";
import type { Node, NodeProps } from "@xyflow/react";
import type { GroupNode as GroupNodeModel } from "../model/types";
import styles from "./GroupNode.module.css";

export interface GroupNodeData extends Record<string, unknown> {
  node: GroupNodeModel;
}

export type FlowGroupNode = Node<GroupNodeData, "group">;

// Flat group frame: an invisible hit area behind its children (a group is not a
// nested node: groups are flat, one level, like any editor's groups). No resize handle in v1: resizing a
// group would need to proportionally scale every child, which is real added complexity for
// a feature groups don't need (group and ungroup,
// with select and move — move, not resize). Children are wired as React Flow child nodes
// (parentId, no extent clamp) in DiagramCanvas.tsx, so dragging the frame moves them for
// free via React Flow's own parent/child rendering; dragging a single child instead moves
// the whole group as one rigid unit (DiagramCanvas.tsx's onNodeDrag/onNodeDragStop).
function GroupNodeComponent({ data, width, height }: NodeProps<FlowGroupNode>) {
  const node = data.node;
  const w = width ?? node.size.w;
  const h = height ?? node.size.h;

  return (
    <div
      className={styles.frame}
      style={{ width: w, height: h }}
      data-testid={`nd-group-node-${node.id}`}
    />
  );
}

export const GroupNode = memo(GroupNodeComponent);
