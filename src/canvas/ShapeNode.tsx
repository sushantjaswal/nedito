import { memo, useCallback, useEffect, useRef, useState } from "react";
import { assetDataUrl, IMAGE_SHAPE_REF } from "../model/assets";
import { imageLabelBox } from "./imageGeometry";
import { hasShadow, shapeDash } from "./shapeEffects";
import { captionAbove, LABEL_SIDE_PAD, labelArea, labelHangsBelow, labelSidePad, verticalAlignOf } from "./labelLayout";
import type { StencilDef } from "../library/stencils/types";
import { NodeResizer, type Node, type NodeProps } from "@xyflow/react";
import { getStencilDefaultStyle, getStencilRenderFill, stencilBody } from "../library/stencils/defaultStyle";
import { isClassicLook } from "../model/look";
import { StencilGlyph } from "../library/stencils/StencilGlyph";
import { stillBody } from "../library/stencils/animatedBodies";
import { ShapeHalo } from "./ShapeHalo";
import { useStencil } from "../library/stencils/useStencil";
import { useDocStore } from "../model/store";
import type { RichLabel, ShapeNode as ShapeNodeModel } from "../model/types";
import { ConnectionHandles } from "./ConnectionHandles";
import { LabelEditor } from "./LabelEditor";
import { defaultLabelColor, labelBackdrop } from "./labelColor";
import { RotateHandle } from "./RotateHandle";
import { HealthBadge } from "./HealthBadge";
import { StepBadge, type StepBadgeKind } from "./StepBadge";
import styles from "./ShapeNode.module.css";

export interface ShapeNodeData extends Record<string, unknown> {
  node: ShapeNodeModel;
  /** Its presentation step number, when one shows (A6, D123). */
  step?: { n: number; kind: StepBadgeKind };
}

export type FlowShapeNode = Node<ShapeNodeData, "shape">;

const JUSTIFY = { left: "flex-start", center: "center", right: "flex-end" } as const;

function labelStyle(label: RichLabel, backdropColor: string | null): React.CSSProperties {
  const align = label.align ?? "center";
  return {
    fontWeight: label.bold ? 700 : 400,
    fontStyle: label.italic ? "italic" : "normal",
    fontSize: label.fontSize ?? 12,
    // Contrasts with the shape's own fill; follows the theme only with no fill behind it (D78).
    color: label.color ?? backdropColor ?? "var(--nd-color-ink)",
    // textAlign positions the lines *within* the text block; justifyContent positions the block
    // itself. The label is a centring flex box, so textAlign alone did nothing to a single-line
    // label and `align` was silently inert on the canvas — while the SVG export honoured it via
    // text-anchor, so the two disagreed. Third instance of that drift; see CLAUDE_HISTORY D67.
    justifyContent: JUSTIFY[align],
    textAlign: align,
  };
}

const ALIGN_ITEMS = { top: "flex-start", middle: "center", bottom: "flex-end" } as const;

/** The label's box and vertical placement — see labelLayout.ts. */
function placedLabel(
  stencil: StencilDef | undefined,
  w: number,
  h: number,
  style: ShapeNodeModel["style"],
): React.CSSProperties {
  const area = labelArea(stencil, w, h, style);
  return {
    inset: "auto",
    left: area.x,
    top: area.y,
    width: area.w,
    height: area.h,
    boxSizing: "border-box",
    alignItems: ALIGN_ITEMS[verticalAlignOf(style)],
    // Narrow boxes keep less to the sides (D139); the stylesheet's 8px is the wide-box case.
    ...(labelSidePad(area.w) < LABEL_SIDE_PAD ? { paddingLeft: labelSidePad(area.w), paddingRight: labelSidePad(area.w) } : {}),
    // Reads bottom to top: vertical-rl runs it top to bottom, the half turn flips it.
    ...(area.vertical ? { writingMode: "vertical-rl", transform: "rotate(180deg)", padding: "8px 4px" } : {}),
  };
}

function ShapeNodeComponent({ id, data, selected, width, height }: NodeProps<FlowShapeNode>) {
  const node = data.node;
  const editing = useDocStore((s) => s.editingNodeId === id);
  const setEditingNodeId = useDocStore((s) => s.setEditingNodeId);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const [hovered, setHovered] = useState(false);

  // Subscribed, not read once: a node drawn before its section loads must fill in when it does.
  const stencil = useStencil(node.shapeRef);
  const isImage = node.shapeRef === IMAGE_SHAPE_REF;
  const asset = useDocStore((s) => (isImage && node.imageId ? s.doc.assets?.[node.imageId] : undefined));
  const shiftHeld = useShiftKey(isImage && selected);
  // Made before R6, or from a template: drawn in the classic look (model/look.ts, D95).
  const classic = isClassicLook(node.style);
  const defaultStyle = stencil ? getStencilDefaultStyle(stencil, classic) : { fill: "#ffffff", stroke: "#1e2733", strokeWidth: 2 };
  const defaultRenderFill = stencil ? getStencilRenderFill(stencil, classic) : "#ffffff";
  // A picture's or an icon's label sits below it, on the canvas, so it takes the theme's ink.
  const below = labelHangsBelow(node.shapeRef, stencil, node.style);
  const labelDefault = below
    ? null
    : defaultLabelColor(labelBackdrop(node.style.fill, stencil, classic), node.style.fillOpacity as number | undefined);
  const w = width ?? node.size.w;
  const h = height ?? node.size.h;
  const rotation = node.rotation ?? 0;
  // The shape's own outline, for the selection and Pulse: a drawn stencil has one; a vendor icon
  // or a picture does not, and falls back to its box.
  const outline = stencil && !stencil.raw ? stillBody(stencilBody(stencil, classic)) : null;

  const commitLabel = useCallback(
    (label: RichLabel) => {
      useDocStore.getState().setNodeLabel(id, label);
    },
    [id],
  );

  const onResizeEnd = useCallback(
    (_event: unknown, params: { x: number; y: number; width: number; height: number }) => {
      useDocStore.getState().setCanvasGesture(false);
      useDocStore.getState().moveOrResizeNodes([
        { id, patch: { position: { x: params.x, y: params.y }, size: { w: params.width, h: params.height } } },
      ]);
    },
    [id],
  );

  return (
    <div
      ref={wrapperRef}
      className={styles.wrapper}
      style={{ width: w, height: h }}
      onDoubleClick={() => setEditingNodeId(id)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      data-testid={`nd-shape-node-${id}`}
    >
      <ConnectionHandles visible={hovered && !selected} />
      {node.motion?.health && <HealthBadge state={node.motion.health} />}
      {data.step && <StepBadge n={data.step.n} kind={data.step.kind} />}
      <NodeResizer
        isVisible={selected && !editing}
        minWidth={20}
        minHeight={20}
        // A picture keeps its proportions unless Shift is held, as in draw.io.
        keepAspectRatio={isImage && !shiftHeld}
        onResizeStart={() => useDocStore.getState().setCanvasGesture(true)}
        onResizeEnd={onResizeEnd}
        color="var(--nd-color-nest-accent)"
        // The handles mark the box to resize; the selection itself is the outline below (D130).
        lineStyle={{ opacity: 0 }}
      />
      <div
        ref={bodyRef}
        // Pulse (D116): the body glows, inside the rotation, so the glow turns with the shape.
        className={node.motion?.pulse ? `${styles.body} nd-anim nd-pulse` : styles.body}
        style={{ transform: `rotate(${rotation}deg)`, opacity: (node.style.opacity as number) ?? 1 }}
        data-motion={node.motion?.pulse ? "pulse" : undefined}
      >
        {/* Pulse (D116), drawn on the shape's own outline — a diamond glows as a diamond (D130). A
            vendor icon or a picture, which has no outline of ours, glows as its box. */}
        {node.motion?.pulse && (outline ? <ShapeHalo body={outline} size={{ w, h }} className="nd-anim nd-glow-shape" /> : <span className="nd-anim nd-glow" aria-hidden="true" />)}
        {node.motion?.pulse?.ripple &&
          (outline ? <ShapeHalo body={outline} size={{ w, h }} className="nd-anim nd-ripple-shape" /> : <span className="nd-anim nd-ripple" aria-hidden="true" />)}
        {isImage && <ImageContent node={node} dataUrl={asset ? assetDataUrl(asset) : undefined} />}
        {stencil && (
          <StencilGlyph
            svgBody={stencilBody(stencil, classic)}
            raw={stencil.raw}
            fill={(node.style.fill as string) ?? defaultRenderFill}
            fillOpacity={node.style.fillOpacity as number | undefined}
            stroke={(node.style.stroke as string) ?? defaultStyle.stroke}
            strokeWidth={(node.style.strokeWidth as number) ?? defaultStyle.strokeWidth}
            preserveAspectRatio="none"
            size={{ w, h }}
            dash={shapeDash(node.style)}
            shadow={hasShadow(node.style)}
            className={styles.glyph}
          />
        )}
        {/* Selected or traced: the shape's own outline in the accent, not its box (D130). */}
        {outline ? <ShapeHalo body={outline} size={{ w, h }} className={styles.halo} /> : <span className={`${styles.halo} ${styles.haloBox}`} aria-hidden="true" />}
        {editing ? (
          <LabelEditor
            initial={node.label}
            defaultColor={labelDefault ?? undefined}
            onCommit={commitLabel}
            onCancel={() => setEditingNodeId(null)}
          />
        ) : (
          node.label?.text && (
            <div
              className={below ? styles.labelBelow : styles.label}
              style={
                below
                  ? {
                      ...labelStyle(node.label, labelDefault),
                      top: imageLabelBox(h, node.label.text.split("\n").length, node.label.fontSize ?? 12, captionAbove(node.style)).top,
                      // Always centred under the picture: the exporter cannot measure text, so it
                      // could not reproduce left/right lines inside a centred block.
                      textAlign: "center",
                      justifyContent: "center",
                    }
                  : { ...labelStyle(node.label, labelDefault), ...placedLabel(stencil, w, h, node.style) }
              }
            >
              {node.label.text}
            </div>
          )
        )}
      </div>
      {selected && !editing && (
        <RotateHandle nodeId={id} wrapperRef={wrapperRef} bodyRef={bodyRef} currentRotation={rotation} />
      )}
    </div>
  );
}

/**
 * The picture of an image node. Fills the node box: resizing keeps the proportions unless the
 * author holds Shift, in which case the picture stretches with the box, as in draw.io. A missing
 * asset (only reachable mid-undo) shows an empty frame rather than a broken-image icon.
 */
function ImageContent({ node, dataUrl }: { node: ShapeNodeModel; dataUrl: string | undefined }) {
  const stroke = node.style.stroke as string | undefined;
  const strokeWidth = (node.style.strokeWidth as number | undefined) ?? 1;
  return (
    <>
      {dataUrl ? (
        <img className={styles.image} src={dataUrl} alt={node.label?.text ?? ""} draggable={false} />
      ) : (
        <div className={styles.imageMissing} />
      )}
      {stroke && stroke !== "none" && (
        <div className={styles.imageBorder} style={{ borderColor: stroke, borderWidth: strokeWidth }} />
      )}
    </>
  );
}

/** Whether Shift is held, tracked only while it matters (an image is selected). */
function useShiftKey(active: boolean): boolean {
  const [held, setHeld] = useState(false);
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => setHeld(e.shiftKey);
    const onBlur = () => setHeld(false);
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKey);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKey);
      window.removeEventListener("blur", onBlur);
      setHeld(false);
    };
  }, [active]);
  return held;
}

export const ShapeNode = memo(ShapeNodeComponent);
