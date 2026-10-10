// The invisible anchor a free line end hangs from.
//
// React Flow draws an edge only between two nodes, and a line from the sidebar's Lines section has
// no node at one end or either (a free line; model/types.ts EdgeEnd.point). Each free
// end therefore gets one of these: a one-pixel node at the end's point, carrying the single handle
// the edge is attached to. It is never selected, dragged or connected to, and is not part of the
// document — DiagramCanvas makes it from the edges each render, and DiagramEdge draws the line from
// the model's own point rather than from this node, so nothing here can move a line by a pixel.
import { memo } from "react";
import { Handle, Position } from "@xyflow/react";
import { POINT_HANDLE } from "./pointNodeIds";

const HIDDEN = { opacity: 0, width: 1, height: 1, minWidth: 0, minHeight: 0, border: 0, pointerEvents: "none" } as const;

function PointNodeComponent() {
  return (
    <div style={{ width: 1, height: 1, pointerEvents: "none" }}>
      <Handle type="source" id={POINT_HANDLE} position={Position.Right} isConnectable={false} style={HIDDEN} />
    </div>
  );
}

export const PointNode = memo(PointNodeComponent);
