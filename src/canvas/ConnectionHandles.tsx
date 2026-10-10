import { Handle, Position, useNodeId } from "@xyflow/react";
import type { MouseEvent } from "react";
import { useDocStore } from "../model/store";
import { addConnectedCopyAndReveal } from "./addConnectedCopy";
import type { Side } from "../model/connectedCopy";
import styles from "./ConnectionHandles.module.css";

const DIRECTIONS: { id: Side; position: Position; name: string }[] = [
  { id: "top", position: Position.Top, name: "above" },
  { id: "right", position: Position.Right, name: "to the right" },
  { id: "bottom", position: Position.Bottom, name: "below" },
  { id: "left", position: Position.Left, name: "to the left" },
];

const CORNERS: { id: string; top: string; left: string }[] = [
  { id: "top-left", top: "0", left: "0" },
  { id: "top-right", top: "0", left: "100%" },
  { id: "bottom-left", top: "100%", left: "0" },
  { id: "bottom-right", top: "100%", left: "100%" },
];

interface ConnectionHandlesProps {
  visible: boolean;
}

// The hover affordance: a ＋ just outside the middle of each side,
// plus the 4 corner perimeter points. connectionMode="loose"
// on <ReactFlow> lets any of these act as either end of a connection despite all being
// declared type="source".
//
// Each ＋ is drawn inside its side's handle, reaching outward from it, so the handle itself —
// its id and where it sits on the border — is unchanged: dragging from the ＋ is a drag from
// that handle and connects exactly as before, edges already attached to "right" stay put, and
// a connection dropped near the side still finds it. Clicking the ＋ instead adds a connected
// copy on that side; the click replaces React Flow's click-to-connect on these four handles.
export function ConnectionHandles({ visible: hovered }: ConnectionHandlesProps) {
  const nodeId = useNodeId();
  // Nothing to add, and nothing to connect, in a shared link's read-only viewer.
  const readOnly = useDocStore((s) => s.ui.viewerMode);
  const visible = hovered && !readOnly;
  const addCopy = (side: Side) => (event: MouseEvent) => {
    // The click must not also reach the node, whose own click would select the original again.
    event.stopPropagation();
    if (nodeId) addConnectedCopyAndReveal(nodeId, side);
  };

  return (
    <>
      {DIRECTIONS.map((d) => (
        <Handle
          key={d.id}
          id={d.id}
          type="source"
          position={d.position}
          className={visible ? `${styles.side} ${styles.visible}` : styles.side}
          onClick={addCopy(d.id)}
        >
          <span
            className={styles.plus}
            data-side={d.id}
            title={`Click to add a connected shape ${d.name}, drag to connect`}
            aria-label={`Add a connected shape ${d.name}`}
            data-testid={`nd-plus-${d.id}`}
          >
            <span className={styles.glyph} aria-hidden="true" />
          </span>
        </Handle>
      ))}
      {CORNERS.map((c) => (
        <Handle
          key={c.id}
          id={c.id}
          type="source"
          position={Position.Top}
          style={{ top: c.top, left: c.left, transform: "translate(-50%, -50%)", right: "auto", bottom: "auto" }}
          className={visible ? `${styles.dot} ${styles.visible}` : styles.dot}
        />
      ))}
    </>
  );
}
