import { useEffect, useState } from "react";
import { getStencil, listCachedStencils } from "../library/stencils";
import { getStencilPreviewStyle, getStencilRenderFill, isIconStyleStencil } from "../library/stencils/defaultStyle";
import { StencilGlyph } from "../library/stencils/StencilGlyph";
import { useDocStore } from "../model/store";
import type { NestedNode, Port } from "../model/types";
import { navigateIntoNested } from "./navigation";
import { NoteControl } from "../notes/NoteControl";
import styles from "./NestedFormatSection.module.css";

const MAX_ICONS = 4;
const SIDES: Port["side"][] = ["left", "right", "top", "bottom"];

interface NestedFormatSectionProps {
  nestedNode: NestedNode;
}

// A Nested Block's own section: its collapsed design, its ports, and opening its child. The full Style/Text/Arrange tab shell is M5 scope; this renders
// as the panel's whole content for a single-nested-node selection in the meantime.
export function NestedFormatSection({ nestedNode }: NestedFormatSectionProps) {
  const childDiagram = useDocStore((s) => s.doc.diagrams[nestedNode.childDiagramId]);
  const setNestedCollapsed = useDocStore((s) => s.setNestedCollapsed);
  const addPort = useDocStore((s) => s.addPort);
  const updatePort = useDocStore((s) => s.updatePort);
  const removePort = useDocStore((s) => s.removePort);

  const [summaryDraft, setSummaryDraft] = useState(nestedNode.collapsed.summary ?? "");
  useEffect(() => {
    setSummaryDraft(nestedNode.collapsed.summary ?? "");
  }, [nestedNode.id, nestedNode.collapsed.summary]);

  const [newPortInnerId, setNewPortInnerId] = useState("");
  const [newPortSide, setNewPortSide] = useState<Port["side"]>("left");

  const commitSummary = () => {
    if (summaryDraft !== (nestedNode.collapsed.summary ?? "")) {
      setNestedCollapsed(nestedNode.id, { summary: summaryDraft });
    }
  };

  const addIcon = (shapeRef: string) => {
    if (!shapeRef || nestedNode.collapsed.icons.includes(shapeRef)) return;
    setNestedCollapsed(nestedNode.id, { icons: [...nestedNode.collapsed.icons, shapeRef].slice(0, MAX_ICONS) });
  };
  const removeIcon = (shapeRef: string) => {
    setNestedCollapsed(nestedNode.id, { icons: nestedNode.collapsed.icons.filter((r) => r !== shapeRef) });
  };

  const addNewPort = () => {
    if (!newPortInnerId) return;
    addPort(nestedNode.id, { side: newPortSide, offset: 0.5, innerNodeId: newPortInnerId });
    setNewPortInnerId("");
  };

  const availableIconChoices = listCachedStencils().filter((s) => !nestedNode.collapsed.icons.includes(s.id));

  return (
    <div className={styles.section} data-testid="nd-nested-format-section">
      <h3 className={styles.heading}>Nested</h3>
      <button type="button" className={styles.openButton} onClick={() => navigateIntoNested(nestedNode.id)}>
        ⤢ Open child diagram
      </button>

      <label className={styles.label} htmlFor="nd-nested-summary">
        Summary
      </label>
      <input
        id="nd-nested-summary"
        className={styles.input}
        value={summaryDraft}
        onChange={(e) => setSummaryDraft(e.target.value)}
        onBlur={commitSummary}
      />

      <label className={styles.label}>
        Collapsed icons ({nestedNode.collapsed.icons.length}/{MAX_ICONS})
      </label>
      <div className={styles.iconsRow}>
        {nestedNode.collapsed.icons.map((ref) => {
          const stencil = getStencil(ref);
          const defaultStyle = stencil ? getStencilPreviewStyle(stencil) : null;
          return (
            <div key={ref} className={styles.iconChip}>
              {stencil && defaultStyle && (
                <StencilGlyph
                  svgBody={stencil.svgBody}
                  raw={stencil.raw}
                  fill={getStencilRenderFill(stencil)}
                  stroke={defaultStyle.stroke}
                  strokeWidth={defaultStyle.strokeWidth}
                  className={styles.iconGlyph}
                  aspectRatio={isIconStyleStencil(stencil) ? undefined : stencil.defaultSize.w / stencil.defaultSize.h}
                />
              )}
              <button type="button" onClick={() => removeIcon(ref)} title="Remove icon">
                ×
              </button>
            </div>
          );
        })}
      </div>
      {nestedNode.collapsed.icons.length < MAX_ICONS && availableIconChoices.length > 0 && (
        <select className={styles.select} value="" onChange={(e) => addIcon(e.target.value)}>
          <option value="">+ Add icon…</option>
          {availableIconChoices.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
      )}

      <label className={styles.label}>Ports ({nestedNode.ports.length})</label>
      <ul className={styles.portList}>
        {nestedNode.ports.map((port) => {
          const inner = childDiagram?.nodes.find((n) => n.id === port.innerNodeId);
          const unmapped = port.innerNodeId === undefined;
          return (
            <li key={port.id} className={unmapped ? `${styles.portRow} ${styles.portRowUnmapped}` : styles.portRow}>
              <span className={styles.portSide}>{port.side}</span>
              <input
                className={styles.portLabelInput}
                placeholder={inner?.label?.text ?? port.innerNodeId ?? "unlinked"}
                value={port.label ?? ""}
                onChange={(e) => updatePort(nestedNode.id, port.id, { label: e.target.value })}
              />
              <button type="button" onClick={() => removePort(nestedNode.id, port.id)} title="Remove port">
                ×
              </button>
              {/* Third way to resolve a waiting port, for authors working from the parent side
                  rather than inside the child (drag-the-loose-end / right-click are the others). */}
              {unmapped && childDiagram && childDiagram.nodes.length > 0 && (
                <select
                  className={styles.portMapSelect}
                  value=""
                  onChange={(e) => e.target.value && updatePort(nestedNode.id, port.id, { innerNodeId: e.target.value })}
                  title="Link this connection to a node inside the child diagram"
                >
                  <option value="">⚠ Link to…</option>
                  {childDiagram.nodes.map((n) => (
                    <option key={n.id} value={n.id}>
                      {n.label?.text ?? n.id}
                    </option>
                  ))}
                </select>
              )}
              {unmapped && (!childDiagram || childDiagram.nodes.length === 0) && (
                <span className={styles.portUnmappedNote}>⚠ child is empty</span>
              )}
            </li>
          );
        })}
      </ul>

      {childDiagram && childDiagram.nodes.length > 0 && (
        <div className={styles.addPortRow}>
          <select value={newPortSide} onChange={(e) => setNewPortSide(e.target.value as Port["side"])}>
            {SIDES.map((side) => (
              <option key={side} value={side}>
                {side}
              </option>
            ))}
          </select>
          <select value={newPortInnerId} onChange={(e) => setNewPortInnerId(e.target.value)}>
            <option value="">Inner node…</option>
            {childDiagram.nodes.map((n) => (
              <option key={n.id} value={n.id}>
                {n.label?.text ?? n.id}
              </option>
            ))}
          </select>
          <button type="button" onClick={addNewPort} disabled={!newPortInnerId}>
            Add port
          </button>
        </div>
      )}
      <NoteControl nodeId={nestedNode.id} />
    </div>
  );
}
