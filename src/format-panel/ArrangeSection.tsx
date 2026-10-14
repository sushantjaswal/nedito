import type { ReactNode } from "react";
import { useDocStore } from "../model/store";
import type { AlignMode, DistributeAxis } from "../model/actions";
import type { LayoutDirection } from "../model/layout";
import { groupOfSelection } from "../model/selectionGroup";
import type { DEdge, DNode, GroupNode } from "../model/types";
import { NumberField } from "./fields";
import {
  AlignBottom,
  AlignCenterH,
  AlignLeft,
  AlignMiddleV,
  AlignRight,
  AlignTop,
  Backward,
  DistributeH,
  DistributeV,
  Forward,
  TidyDown,
  TidyRight,
  ToBack,
  ToFront,
} from "./icons";
import styles from "./FormatTabs.module.css";

interface ArrangeSectionProps {
  nodes: DNode[];
  edges: DEdge[];
  groups: GroupNode[];
}

const ALIGN_BUTTONS: { mode: AlignMode; icon: ReactNode; title: string }[] = [
  { mode: "left", icon: <AlignLeft />, title: "Align left" },
  { mode: "center-h", icon: <AlignCenterH />, title: "Align center" },
  { mode: "right", icon: <AlignRight />, title: "Align right" },
  { mode: "top", icon: <AlignTop />, title: "Align top" },
  { mode: "middle-v", icon: <AlignMiddleV />, title: "Align middle" },
  { mode: "bottom", icon: <AlignBottom />, title: "Align bottom" },
];

const TIDY_BUTTONS: { direction: LayoutDirection; icon: ReactNode; title: string }[] = [
  { direction: "right", icon: <TidyRight />, title: "Tidy up left to right" },
  { direction: "down", icon: <TidyDown />, title: "Tidy up top to bottom" },
];

// The Arrange controls: Size (W/H) and Position (X/Y) fields for a single selected shape,
// rotation, z-order buttons, group/ungroup, and align/distribute for a multi-selection. Once the
// right panel's Arrange tab; since R1 (D90) the context bar's Arrange popover, which also took
// over the separate floating align/distribute toolbar a multi-selection used to get.
export function ArrangeSection({ nodes, edges, groups }: ArrangeSectionProps) {
  const moveOrResizeNodes = useDocStore((s) => s.moveOrResizeNodes);
  const bringToFront = useDocStore((s) => s.bringToFront);
  const sendToBack = useDocStore((s) => s.sendToBack);
  const moveForward = useDocStore((s) => s.moveForward);
  const moveBackward = useDocStore((s) => s.moveBackward);
  const alignSelection = useDocStore((s) => s.alignSelection);
  const distributeSelection = useDocStore((s) => s.distributeSelection);
  const groupSelection = useDocStore((s) => s.groupSelection);
  const ungroupSelection = useDocStore((s) => s.ungroupSelection);
  const tidyUp = useDocStore((s) => s.tidyUp);
  const tidyingUp = useDocStore((s) => s.ui.tidyingUp);

  const nodeIds = nodes.map((n) => n.id);
  const single = nodes.length === 1 ? nodes[0] : undefined;

  // The same rule the Arrange menu and the context menu use (model/selectionGroup.ts).
  const relatedGroup: GroupNode | undefined = groupOfSelection([...nodes, ...groups], nodeIds);

  if (nodeIds.length === 0) {
    return (
      <div className={styles.section} data-testid="nd-arrange-section">
        <div className={styles.hint}>Select one or more shapes to arrange them.</div>
      </div>
    );
  }

  const setPosition = (patch: Partial<{ x: number; y: number }>) => {
    if (!single) return;
    moveOrResizeNodes([{ id: single.id, patch: { position: { ...single.position, ...patch } } }]);
  };
  const setSize = (patch: Partial<{ w: number; h: number }>) => {
    if (!single) return;
    moveOrResizeNodes([{ id: single.id, patch: { size: { ...single.size, ...patch } } }]);
  };
  const setRotation = (deg: number) => {
    if (!single) return;
    moveOrResizeNodes([{ id: single.id, patch: { rotation: deg } }]);
  };

  return (
    <div className={styles.section} data-testid="nd-arrange-section">
      {nodeIds.length >= 2 && !relatedGroup && (
        <div className={styles.iconRow}>
          <button type="button" className={styles.iconBtn} onClick={() => groupSelection()}>
            Group
          </button>
        </div>
      )}
      {relatedGroup && (
        <div className={styles.iconRow}>
          <button
            type="button"
            className={`${styles.iconBtn} ${styles.iconBtnActive}`}
            title="These shapes are already grouped"
            onClick={() => ungroupSelection()}
          >
            Ungroup
          </button>
        </div>
      )}

      {single && single.type !== "group" && (
        <>
          <div className={styles.group}>
            <h4 className={styles.groupHeading}>Size</h4>
            <div className={styles.row}>
              <span className={styles.miniLabel}>W</span>
              <NumberField label="Width" className={styles.numberInputPaired} min={1} value={Math.round(single.size.w)} onCommit={(n) => setSize({ w: n })} />
              <span className={styles.miniLabel}>H</span>
              <NumberField label="Height" className={styles.numberInputPaired} min={1} value={Math.round(single.size.h)} onCommit={(n) => setSize({ h: n })} />
            </div>
          </div>
          <div className={styles.group}>
            <h4 className={styles.groupHeading}>Position</h4>
            <div className={styles.row}>
              <span className={styles.miniLabel}>X</span>
              <NumberField label="X position" className={styles.numberInputPaired} value={Math.round(single.position.x)} onCommit={(n) => setPosition({ x: n })} />
              <span className={styles.miniLabel}>Y</span>
              <NumberField label="Y position" className={styles.numberInputPaired} value={Math.round(single.position.y)} onCommit={(n) => setPosition({ y: n })} />
            </div>
          </div>
          <div className={styles.group}>
            <h4 className={styles.groupHeading}>Rotation</h4>
            <div className={styles.row}>
              <NumberField label="Rotation degrees" className={styles.numberInput} min={-360} max={360} value={Math.round(single.rotation ?? 0)} onCommit={(n) => setRotation(n)} />
              <span className={styles.label}>degrees</span>
            </div>
          </div>
        </>
      )}

      <div className={styles.group}>
        <h4 className={styles.groupHeading}>Order</h4>
        <div className={styles.iconRow}>
          <button type="button" className={styles.iconBtn} title="To front" aria-label="To front" onClick={() => bringToFront(nodeIds)}>
            <ToFront />
          </button>
          <button type="button" className={styles.iconBtn} title="Forward" aria-label="Forward" onClick={() => moveForward(nodeIds)}>
            <Forward />
          </button>
          <button type="button" className={styles.iconBtn} title="Backward" aria-label="Backward" onClick={() => moveBackward(nodeIds)}>
            <Backward />
          </button>
          <button type="button" className={styles.iconBtn} title="To back" aria-label="To back" onClick={() => sendToBack(nodeIds)}>
            <ToBack />
          </button>
        </div>
      </div>

      {nodeIds.length >= 2 && (
        <div className={styles.group}>
          <h4 className={styles.groupHeading}>Align</h4>
          <div className={styles.iconRow}>
            {ALIGN_BUTTONS.map((b) => (
              <button
                key={b.mode}
                type="button"
                className={styles.iconBtn}
                title={b.title}
                aria-label={b.title}
                onClick={() => alignSelection(b.mode)}
              >
                {b.icon}
              </button>
            ))}
          </div>
          {nodeIds.length >= 3 && (
            <div className={styles.iconRow}>
              <button
                type="button"
                className={styles.iconBtn}
                title="Distribute horizontally"
                aria-label="Distribute horizontally"
                onClick={() => distributeSelection("horizontal" as DistributeAxis)}
              >
                <DistributeH />
              </button>
              <button
                type="button"
                className={styles.iconBtn}
                title="Distribute vertically"
                aria-label="Distribute vertically"
                onClick={() => distributeSelection("vertical" as DistributeAxis)}
              >
                <DistributeV />
              </button>
            </div>
          )}
        </div>
      )}

      {nodeIds.length >= 2 && (
        <div className={styles.group}>
          <h4 className={styles.groupHeading}>Tidy up</h4>
          <div className={styles.iconRow}>
            {TIDY_BUTTONS.map((b) => (
              <button
                key={b.direction}
                type="button"
                className={styles.iconBtn}
                title={b.title}
                aria-label={b.title}
                disabled={tidyingUp}
                data-testid={`nd-tidy-${b.direction}`}
                onClick={() => void tidyUp({ direction: b.direction, scope: "selection" })}
              >
                {b.icon}
              </button>
            ))}
          </div>
          <div className={styles.hint}>Places these shapes along their connections. Groups keep their members.</div>
        </div>
      )}

      {edges.length > 0 && <div className={styles.hint}>Edge waypoints edit on the canvas — drag the line to add one.</div>}
    </div>
  );
}
