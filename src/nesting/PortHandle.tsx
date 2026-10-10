import { Handle, Position } from "@xyflow/react";
import type { Port } from "../model/types";
import styles from "./PortHandle.module.css";

const SIDE_POSITION: Record<Port["side"], Position> = {
  top: Position.Top,
  right: Position.Right,
  bottom: Position.Bottom,
  left: Position.Left,
};

interface PortHandleProps {
  /** A traced line lands here (D117). */
  lit?: boolean;
  port: Port;
  tooltip: string;
}

// Ports double as connection handles (id "port:<portId>") so external edges can attach
// directly to a specific port, in addition to the node's own generic ConnectionHandles.
// A port with no innerNodeId yet renders dashed and amber — the same "waiting to be linked"
// language the child diagram's ghost overlay uses, so the state reads the same from both sides
// of the boundary.
export function PortHandle({ port, tooltip, lit }: PortHandleProps) {
  const style: React.CSSProperties = { transform: "translate(-50%, -50%)" };
  if (port.side === "top" || port.side === "bottom") {
    style.left = `${port.offset * 100}%`;
    style.top = port.side === "top" ? "0" : "100%";
  } else {
    style.top = `${port.offset * 100}%`;
    style.left = port.side === "left" ? "0" : "100%";
  }

  const unmapped = port.innerNodeId === undefined;

  return (
    <Handle
      id={`port:${port.id}`}
      type="source"
      position={SIDE_POSITION[port.side]}
      style={style}
      className={`${unmapped ? `${styles.dot} ${styles.unmapped}` : styles.dot}${lit ? ` ${styles.lit}` : ""}`}
      title={tooltip}
    />
  );
}
