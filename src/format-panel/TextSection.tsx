import type { ReactNode } from "react";
import { useDocStore } from "../model/store";
import type { DEdge, DNode, RichLabel } from "../model/types";
import { verticalAlignOf, type VerticalAlign } from "../canvas/labelLayout";
import { ColorField, NumberField } from "./fields";
import { LabelBottom, LabelMiddle, LabelTop, TextAlignCenter, TextAlignLeft, TextAlignRight } from "./icons";
import styles from "./FormatTabs.module.css";

interface TextSectionProps {
  nodes: DNode[];
  edges: DEdge[];
}

const ALIGN_OPTIONS: { value: NonNullable<RichLabel["align"]>; icon: ReactNode }[] = [
  { value: "left", icon: <TextAlignLeft /> },
  { value: "center", icon: <TextAlignCenter /> },
  { value: "right", icon: <TextAlignRight /> },
];

// draw.io's Text tab offers Top / Middle / Bottom too: a container's title belongs at its head.
const VALIGN_OPTIONS: { value: VerticalAlign; icon: ReactNode }[] = [
  { value: "top", icon: <LabelTop /> },
  { value: "middle", icon: <LabelMiddle /> },
  { value: "bottom", icon: <LabelBottom /> },
];

// draw.io's Text tab controls bold/italic/font size/color/align for the selected shape(s) or
// edge label(s); the text content itself stays edited inline (double-click / F2), same as
// here. Multi-selection applies one formatting change to every selected label at once.
export function TextSection({ nodes, edges }: TextSectionProps) {
  const setNodeLabelStyle = useDocStore((s) => s.setNodeLabelStyle);
  const setEdgeLabelStyle = useDocStore((s) => s.setEdgeLabelStyle);
  const setNodeStyle = useDocStore((s) => s.setNodeStyle);

  const shapeNodes = nodes.filter((n) => n.type === "shape");
  const nodeIds = shapeNodes.map((n) => n.id);
  const edgeIds = edges.map((e) => e.id);

  if (nodeIds.length === 0 && edgeIds.length === 0) {
    return (
      <div className={styles.section} data-testid="nd-text-section">
        <div className={styles.hint}>Select a shape or edge to edit its text.</div>
      </div>
    );
  }

  const firstLabel = shapeNodes[0]?.label ?? edges[0]?.label;
  const bold = firstLabel?.bold ?? false;
  const italic = firstLabel?.italic ?? false;
  const fontSize = firstLabel?.fontSize ?? 12;
  const color = firstLabel?.color ?? "#1e2733";
  const align = firstLabel?.align ?? "center";
  const valign = shapeNodes[0] ? verticalAlignOf(shapeNodes[0].style) : "middle";

  const apply = (patch: Partial<RichLabel>) => {
    if (nodeIds.length > 0) setNodeLabelStyle(nodeIds, patch);
    if (edgeIds.length > 0) setEdgeLabelStyle(edgeIds, patch);
  };

  return (
    <div className={styles.section} data-testid="nd-text-section">
      <div className={styles.group}>
        <div className={styles.toggleGroup}>
          <button
            type="button"
            className={bold ? styles.toggleBtnActive : styles.toggleBtn}
            onClick={() => apply({ bold: !bold })}
            aria-label="Bold"
            aria-pressed={bold}
            title="Bold"
          >
            <strong>B</strong>
          </button>
          <button
            type="button"
            className={italic ? styles.toggleBtnActive : styles.toggleBtn}
            onClick={() => apply({ italic: !italic })}
            aria-label="Italic"
            aria-pressed={italic}
            title="Italic"
          >
            <em>I</em>
          </button>
        </div>
        <div className={styles.row}>
          <span className={styles.label}>Size</span>
          <NumberField
            label="Font size"
            className={styles.numberInput}
            min={6}
            max={96}
            value={fontSize}
            onCommit={(n) => apply({ fontSize: n })}
          />
          <ColorField label="Text color" className={styles.colorInput} value={color} onCommit={(c) => apply({ color: c })} />
        </div>
        <div className={styles.row}>
          <span className={styles.label}>Align</span>
          <div className={styles.toggleGroup}>
            {ALIGN_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                className={align === opt.value ? styles.toggleBtnActive : styles.toggleBtn}
                onClick={() => apply({ align: opt.value })}
                aria-label={`Align ${opt.value}`}
                aria-pressed={align === opt.value}
                title={`Align ${opt.value}`}
              >
                {opt.icon}
              </button>
            ))}
          </div>
        </div>
        {nodeIds.length > 0 && (
          <div className={styles.row}>
            <span className={styles.label}>Position</span>
            <div className={styles.toggleGroup}>
              {VALIGN_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  className={valign === opt.value ? styles.toggleBtnActive : styles.toggleBtn}
                  onClick={() => setNodeStyle(nodeIds, { verticalAlign: opt.value })}
                  aria-label={`Vertical align ${opt.value}`}
                  aria-pressed={valign === opt.value}
                  title={`Label at the ${opt.value}`}
                >
                  {opt.icon}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
