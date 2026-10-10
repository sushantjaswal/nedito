import { useViewport } from "@xyflow/react";
import styles from "./AlignmentGuides.module.css";

interface AlignmentGuidesProps {
  verticalX?: number;
  horizontalY?: number;
}

// Screen-space overlay (not the flow-transformed layer) so guide lines stay hairline-thin
// and full-length regardless of zoom; only their offset is derived from the viewport.
export function AlignmentGuides({ verticalX, horizontalY }: AlignmentGuidesProps) {
  const { x, y, zoom } = useViewport();
  if (verticalX === undefined && horizontalY === undefined) return null;

  return (
    <div className={styles.layer}>
      {verticalX !== undefined && (
        <div className={styles.vertical} style={{ left: verticalX * zoom + x, top: 0, height: "100%" }} />
      )}
      {horizontalY !== undefined && (
        <div className={styles.horizontal} style={{ top: horizontalY * zoom + y, left: 0, width: "100%" }} />
      )}
    </div>
  );
}
