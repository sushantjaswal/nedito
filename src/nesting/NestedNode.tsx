import { memo, useCallback, useEffect, useState } from "react";
import { NodeResizer, type Node, type NodeProps } from "@xyflow/react";
import { ConnectionHandles } from "../canvas/ConnectionHandles";
import { LabelEditor } from "../canvas/LabelEditor";
import { getStencil } from "../library/stencils";
import { isIconStyleStencil } from "../library/stencils/defaultStyle";
import { StencilGlyph } from "../library/stencils/StencilGlyph";
import { useStencilCacheRevision } from "../library/stencils/useStencil";
import { useDocStore } from "../model/store";
import type { NestedNode as NestedNodeModel, Port, RichLabel } from "../model/types";
import { navigateIntoNested } from "./navigation";
import { NestedMiniature } from "./NestedMiniature";
import { HealthBadge } from "../canvas/HealthBadge";
import { NestedNoteMarker, NoteMarker } from "../notes/NoteMarker";
import { StepBadge, type StepBadgeKind } from "../canvas/StepBadge";
import { firstPeek } from "./peek";
import { PortHandle } from "./PortHandle";
import styles from "./NestedNode.module.css";

export interface NestedNodeData extends Record<string, unknown> {
  node: NestedNodeModel;
  /** Ports where a traced line lands (D117). */
  litPorts?: string[];
  /** Its presentation step number, when one shows (A6, D123). */
  step?: { n: number; kind: StepBadgeKind };
}

export type FlowNestedNode = Node<NestedNodeData, "nested">;

function NestedNodeComponent({ id, data, selected, width, height }: NodeProps<FlowNestedNode>) {
  const node = data.node;
  // Peek (A5, D121): stir on the first time this block is seen this session, then never again.
  // In an effect, not a state initializer, which development's double render would call twice.
  const [peeking, setPeeking] = useState(false);
  useEffect(() => {
    if (node.peek && firstPeek(id)) setPeeking(true);
  }, [node.peek, id]);
  const childDiagram = useDocStore((s) => s.doc.diagrams[node.childDiagramId]);
  const editing = useDocStore((s) => s.editingNodeId === id);
  const setEditingNodeId = useDocStore((s) => s.setEditingNodeId);
  const [hovered, setHovered] = useState(false);
  // The authored icon row reads stencils by id; redraw it when the cache grows.
  useStencilCacheRevision();

  const w = width ?? node.size.w;
  const h = height ?? node.size.h;

  const onResizeEnd = useCallback(
    (_event: unknown, params: { x: number; y: number; width: number; height: number }) => {
      useDocStore.getState().setCanvasGesture(false);
      useDocStore.getState().moveOrResizeNodes([
        { id, patch: { position: { x: params.x, y: params.y }, size: { w: params.width, h: params.height } } },
      ]);
    },
    [id],
  );

  const openChild = useCallback(
    (e?: React.SyntheticEvent) => {
      e?.stopPropagation();
      navigateIntoNested(id);
    },
    [id],
  );

  // Renaming a nested node renames the diagram it stands for, so the box, the breadcrumb and
  // the child's own title never disagree about what this thing is called.
  const commitName = useCallback(
    (label: RichLabel) => {
      useDocStore.getState().renameNestedNode(id, label);
    },
    [id],
  );

  const portTooltip = (port: Port): string => {
    if (port.innerNodeId === undefined) {
      return `${port.label ?? "Port"} — not linked to anything inside yet. Open the child diagram to link it.`;
    }
    const inner = childDiagram?.nodes.find((n) => n.id === port.innerNodeId);
    return port.label ?? inner?.label?.text ?? port.innerNodeId;
  };

  const name = node.label?.text || childDiagram?.title || "Nested Block";
  const hasContents = (childDiagram?.nodes.length ?? 0) > 0;
  const authoredIcons = node.collapsed.icons.length > 0;

  return (
    <div
      className={styles.wrapper}
      style={{ width: w, height: h }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      // Double-click renames, matching every other node type, rather than opening the child —
      // the ⤢ button and the right-click menu both already open it, so nothing is lost.
      onDoubleClick={() => setEditingNodeId(id)}
      data-testid={`nd-nested-node-${id}`}
    >
      <ConnectionHandles visible={hovered && !selected} />
      <NodeResizer
        isVisible={selected && !editing}
        minWidth={120}
        minHeight={80}
        onResizeStart={() => useDocStore.getState().setCanvasGesture(true)}
        onResizeEnd={onResizeEnd}
        color="var(--nd-color-nest-accent)"
      />
      <div className={styles.ghost2} />
      <div className={styles.ghost1} />
      {node.motion?.health && <HealthBadge state={node.motion.health} />}
      <NoteMarker nodeId={node.id} />
      <NestedNoteMarker childDiagramId={node.childDiagramId} />
      {data.step && <StepBadge n={data.step.n} kind={data.step.kind} />}
      {/* Pulse (D116). The ripple sits beside the body, which clips its overflow. */}
      {node.motion?.pulse && <span className="nd-anim nd-glow" aria-hidden="true" />}
      {node.motion?.pulse?.ripple && <span className="nd-anim nd-ripple" aria-hidden="true" />}
      <div className={node.motion?.pulse ? `${styles.body} nd-anim nd-pulse` : styles.body} data-motion={node.motion?.pulse ? "pulse" : undefined}>
        <div className={styles.header}>
          <span className={styles.badge} title="Nested Block">
            ⧉
          </span>
          {editing ? (
            <div className={styles.nameEditor}>
              <LabelEditor initial={node.label} onCommit={commitName} onCancel={() => setEditingNodeId(null)} />
            </div>
          ) : (
            <span className={styles.name} title={name}>
              {name}
            </span>
          )}
          <button
            type="button"
            className={peeking ? `${styles.openBtn} nd-anim nd-peek-btn` : styles.openBtn}
            onClick={openChild}
            title="Open child diagram"
            data-testid={`nd-nested-open-${id}`}
          >
            ⤢
          </button>
        </div>

        <div
          className={peeking ? `${styles.preview} nd-anim nd-peek` : styles.preview}
          onAnimationEnd={(e) => e.animationName === "nd-peek" && setPeeking(false)}
          data-peeking={peeking ? "" : undefined}
        >
          {authoredIcons ? (
            <div className={styles.iconsRow}>
              {node.collapsed.icons.map((ref, i) => {
                const stencil = getStencil(ref);
                if (!stencil) return null;
                // Pictogram icons are flat single-color glyphs (solid fill, no border — see
                // defaultStyle.ts); outline shapes keep the nesting accent's white-fill look.
                const icon = isIconStyleStencil(stencil);
                return (
                  <StencilGlyph
                    key={`${ref}-${i}`}
                    svgBody={stencil.svgBody}
                    raw={stencil.raw}
                    fill={icon ? "var(--nd-color-nest-deep)" : "#ffffff"}
                    stroke={icon ? "none" : "var(--nd-color-nest-deep)"}
                    className={styles.iconGlyph}
                  />
                );
              })}
            </div>
          ) : hasContents ? (
            <NestedMiniature diagram={childDiagram} />
          ) : (
            <span className={styles.emptyNote}>Empty</span>
          )}
        </div>

        {node.collapsed.summary && <div className={styles.summary}>{node.collapsed.summary}</div>}
      </div>
      {node.ports.map((port) => (
        <PortHandle key={port.id} port={port} tooltip={portTooltip(port)} lit={data.litPorts?.includes(port.id)} />
      ))}
    </div>
  );
}

export const NestedNode = memo(NestedNodeComponent);
