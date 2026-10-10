// The Style tab's controls, as sections the context bar opens one at a time (R1, D90): Fill, Line,
// More (opacity and shadow), Edge and Image. Each is the panel's own group, moved rather than
// redrawn — same fields, same labels, same one-edit-one-undo behaviour (fields.tsx).
//
// Every section takes the whole selection and acts on what it applies to, as the Style tab did:
// fill and line settings go to plain shapes (not groups or Nested Blocks, which draw their own
// frame); edge settings go to the selected lines; a multi-selection is changed all at once, seeded
// from the first item's current values.
import { EDGE_SHAPES, edgeShapeOf } from "../canvas/edgeShapes";
import { DEFAULT_EDGE_WIDTH } from "../canvas/edgeRouting";
import { getStencil } from "../library/stencils";
import { getStencilDefaultStyle, isIconStyleStencil } from "../library/stencils/defaultStyle";
import { presetOf, STYLE_PRESETS } from "./stylePresets";
import { isClassicLook } from "../model/look";
import { EDGE_COLOR, edgeColorForPicker } from "../canvas/edgeColor";
import { useDocStore } from "../model/store";
import type { DEdge, DNode } from "../model/types";
import { styledShapes } from "./selectionKinds";
import { hasShadow } from "../canvas/shapeEffects";
import { ColorField, NumberField, RangeField } from "./fields";
import styles from "./FormatTabs.module.css";
import { ARROWHEAD_OPTIONS } from "../canvas/arrowheads";

/** The first shape's values and its stencil's defaults — what each control shows. */
function useShapeStyle(nodes: DNode[]) {
  const setNodeStyle = useDocStore((s) => s.setNodeStyle);
  const shapes = styledShapes(nodes);
  const nodeIds = shapes.map((n) => n.id);
  const first = shapes[0];
  const stencil = first ? getStencil(first.shapeRef) : undefined;
  const defaults = stencil ? getStencilDefaultStyle(stencil, isClassicLook(first?.style)) : { fill: "#ffffff", stroke: "#1e2733", strokeWidth: 2 };
  return { setNodeStyle, nodeIds, first, defaults };
}

/**
 * Style presets: a row of ready-made fill-and-outline pairs. Applied to
 * the outline shapes in the selection; a pictogram or vendor icon keeps its own colours, which a
 * tint would only wash out.
 */
function StylePresetRow({ nodes }: { nodes: DNode[] }) {
  const applyStylePreset = useDocStore((s) => s.applyStylePreset);
  const outlined = styledShapes(nodes).filter((n) => {
    const stencil = getStencil(n.shapeRef);
    return stencil ? !stencil.raw && !isIconStyleStencil(stencil) : true;
  });
  if (outlined.length === 0) return null;
  const chosen = presetOf(outlined[0].style)?.id;
  const ids = outlined.map((n) => n.id);
  return (
    <div className={styles.presets} role="group" aria-label="Style presets" data-testid="nd-style-presets">
      {STYLE_PRESETS.map((p) => (
        <button
          key={p.id}
          type="button"
          className={styles.preset}
          aria-label={`Style: ${p.name}`}
          aria-pressed={chosen === p.id}
          title={p.name}
          onClick={() => applyStylePreset(ids, p)}
          data-testid={`nd-preset-${p.id}`}
        >
          <span
            className={styles.presetSwatch}
            style={{ background: p.fill ?? "#ffffff", borderColor: p.stroke ?? "#1e2733" }}
          />
        </button>
      ))}
    </div>
  );
}

export function FillSection({ nodes }: { nodes: DNode[] }) {
  const { setNodeStyle, nodeIds, first, defaults } = useShapeStyle(nodes);
  const defaultFillSwatch = defaults.fill === "none" ? "#ffffff" : defaults.fill;
  const fillValue = (first?.style.fill as string | undefined) ?? defaults.fill;
  const noFill = fillValue === "none";
  return (
    <div className={styles.group} data-testid="nd-fill-section">
      <StylePresetRow nodes={nodes} />
      <div className={styles.row}>
        <span className={styles.label}>Fill</span>
        <ColorField
          label="Fill color"
          className={styles.colorInput}
          // A shape with no fill shows the colour it would get back.
          value={noFill ? defaultFillSwatch : ((first?.style.fill as string) ?? defaultFillSwatch)}
          onCommit={(c) => setNodeStyle(nodeIds, { fill: c })}
        />
        <label className={styles.checkLabel}>
          <input
            type="checkbox"
            checked={noFill}
            onChange={(e) => setNodeStyle(nodeIds, { fill: e.target.checked ? "none" : defaultFillSwatch })}
            aria-label="No fill"
          />
          No fill
        </label>
      </div>
      {/* Fill opacity is deliberately its own control rather than a mode of Opacity: fading a
          whole shape and fading only its interior are different things to want. A Venn diagram
          needs the second — the overlaps blend while the outlines and labels stay solid. */}
      <div className={styles.row}>
        <span className={styles.label}>Fill opacity</span>
        <RangeField
          label="Fill opacity"
          className={styles.rangeInput}
          min={0}
          max={1}
          step={0.05}
          value={(first?.style.fillOpacity as number) ?? 1}
          onCommit={(v) => setNodeStyle(nodeIds, { fillOpacity: v })}
        />
      </div>
    </div>
  );
}

export function LineSection({ nodes }: { nodes: DNode[] }) {
  const { setNodeStyle, nodeIds, first, defaults } = useShapeStyle(nodes);
  const lineColor = (first?.style.stroke as string | undefined) ?? defaults.stroke;
  return (
    <div className={styles.group} data-testid="nd-line-section">
      <div className={styles.row}>
        <span className={styles.label}>Line</span>
        <ColorField
          label="Line color"
          className={styles.colorInput}
          // "none" (icon-style shapes' default) isn't a valid <input type="color"> value — fall
          // back to the ink swatch there; the width below (0 for the same shapes) is what reflects
          // "no border" until the user picks a non-zero width.
          value={lineColor === "none" ? "#1e2733" : lineColor}
          onCommit={(c) => setNodeStyle(nodeIds, { stroke: c })}
        />
      </div>
      <div className={styles.row}>
        <span className={styles.label}>Width</span>
        <NumberField
          label="Line width"
          className={styles.numberInput}
          min={0}
          max={12}
          step={0.5}
          value={(first?.style.strokeWidth as number) ?? defaults.strokeWidth}
          onCommit={(n) => setNodeStyle(nodeIds, { strokeWidth: n })}
        />
        <span className={styles.unit}>pt</span>
      </div>
      <div className={styles.row}>
        <span className={styles.label}>Pattern</span>
        <select
          className={styles.select}
          value={(first?.style.dash as string) ?? "solid"}
          onChange={(e) => setNodeStyle(nodeIds, { dash: e.target.value })}
          aria-label="Line pattern"
        >
          <option value="solid">Solid</option>
          <option value="dashed">Dashed</option>
          <option value="dotted">Dotted</option>
        </select>
      </div>
    </div>
  );
}

/** Whole-shape opacity and the drop shadow: the panel's effects, behind the bar's More (•••). */
export function EffectsSection({ nodes }: { nodes: DNode[] }) {
  const { setNodeStyle, nodeIds, first } = useShapeStyle(nodes);
  return (
    <div className={styles.group} data-testid="nd-effects-section">
      <div className={styles.row}>
        <span className={styles.label}>Opacity</span>
        <RangeField
          label="Opacity"
          className={styles.rangeInput}
          min={0}
          max={1}
          step={0.05}
          value={(first?.style.opacity as number) ?? 1}
          onCommit={(v) => setNodeStyle(nodeIds, { opacity: v })}
        />
      </div>
      <div className={styles.row}>
        <label className={styles.checkLabel}>
          <input
            type="checkbox"
            checked={hasShadow(first?.style ?? {})}
            onChange={(e) => setNodeStyle(nodeIds, { shadow: e.target.checked })}
            aria-label="Shadow"
          />
          Shadow
        </label>
      </div>
    </div>
  );
}

/**
 * The lines in a selection, for when more than one is selected or lines are mixed with shapes. A
 * single line on its own has the line toolbar instead (D86), which carries these same settings.
 */
export function EdgeSection({ edges }: { edges: DEdge[] }) {
  const setEdgeStyle = useDocStore((s) => s.setEdgeStyle);
  const edgeIds = edges.map((e) => e.id);
  const firstEdge = edges[0];
  return (
    <div className={styles.group} data-testid="nd-edge-section">
      <div className={styles.row}>
        <span className={styles.label}>Style</span>
        <select
          className={styles.select}
          value={(firstEdge?.style.edgeStyle as string) ?? "orthogonal"}
          onChange={(e) => setEdgeStyle(edgeIds, { edgeStyle: e.target.value })}
          aria-label="Line style"
        >
          <option value="straight">Straight</option>
          <option value="orthogonal">Orthogonal</option>
          <option value="curved">Curved</option>
        </select>
      </div>
      <div className={styles.row}>
        <span className={styles.label}>Shape</span>
        <select
          className={styles.select}
          value={edgeShapeOf(firstEdge?.style ?? {})}
          onChange={(e) => setEdgeStyle(edgeIds, { edgeShape: e.target.value })}
          aria-label="Line shape"
        >
          {EDGE_SHAPES.map((shape) => (
            <option key={shape.id} value={shape.id}>
              {shape.label}
            </option>
          ))}
        </select>
      </div>
      <div className={styles.row}>
        <span className={styles.label}>Color</span>
        <ColorField
          label="Edge color"
          className={styles.colorInput}
          value={firstEdge ? edgeColorForPicker(firstEdge.style) : EDGE_COLOR}
          onCommit={(c) => setEdgeStyle(edgeIds, { stroke: c })}
        />
      </div>
      <div className={styles.row}>
        <span className={styles.label}>Width</span>
        <NumberField
          label="Edge width"
          className={styles.numberInput}
          min={0.5}
          max={12}
          step={0.25}
          value={(firstEdge?.style.strokeWidth as number) ?? DEFAULT_EDGE_WIDTH}
          onCommit={(n) => setEdgeStyle(edgeIds, { strokeWidth: n })}
        />
        <span className={styles.unit}>pt</span>
      </div>
      <div className={styles.row}>
        <span className={styles.label}>Dash</span>
        <select
          className={styles.select}
          value={(firstEdge?.style.dash as string) ?? "solid"}
          onChange={(e) => setEdgeStyle(edgeIds, { dash: e.target.value })}
          aria-label="Dash pattern"
        >
          <option value="solid">Solid</option>
          <option value="dashed">Dashed</option>
          <option value="dotted">Dotted</option>
        </select>
      </div>
      <div className={styles.row}>
        <span className={styles.label}>Start</span>
        <select
          className={styles.select}
          value={(firstEdge?.style.startArrow as string) ?? "none"}
          onChange={(e) => setEdgeStyle(edgeIds, { startArrow: e.target.value })}
          aria-label="Start arrow"
        >
          {/* Driven from canvas/arrowheads.ts, so this cannot offer an arrowhead the renderer
              does not draw — or miss one it does. */}
          {ARROWHEAD_OPTIONS.map((a) => (
            <option key={a.id} value={a.id}>
              {a.label}
            </option>
          ))}
        </select>
      </div>
      <div className={styles.row}>
        <span className={styles.label}>End</span>
        <select
          className={styles.select}
          value={(firstEdge?.style.endArrow as string) ?? "classic"}
          onChange={(e) => setEdgeStyle(edgeIds, { endArrow: e.target.value })}
          aria-label="End arrow"
        >
          {ARROWHEAD_OPTIONS.map((a) => (
            <option key={a.id} value={a.id}>
              {a.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

/**
 * A picture's own settings: which file it is, and the two things a picture
 * can carry — a border, and opacity. Replace and Original size act on one picture and sit on the
 * bar itself (ImageActions); the border and opacity apply to every selected picture.
 */
export function ImageSection({ nodes }: { nodes: DNode[] }) {
  const setNodeStyle = useDocStore((s) => s.setNodeStyle);
  const pictures = styledShapes(nodes);
  const first = pictures[0];
  const asset = useDocStore((s) => (first?.imageId ? s.doc.assets?.[first.imageId] : undefined));
  if (!first) return null;
  const ids = pictures.map((n) => n.id);
  const stroke = first.style.stroke as string | undefined;
  const bordered = !!stroke && stroke !== "none";

  return (
    <div className={styles.group} data-testid="nd-image-section">
      {pictures.length === 1 && asset && (
        <div className={styles.hint} data-testid="nd-image-info">
          {asset.name ?? "Image"} · {asset.width}×{asset.height}
        </div>
      )}
      <div className={styles.row}>
        <span className={styles.label}>Border</span>
        <input
          type="checkbox"
          checked={bordered}
          onChange={(e) => setNodeStyle(ids, { stroke: e.target.checked ? "#1e2733" : "none" })}
          aria-label="Border"
        />
        {bordered && <ColorField label="Border color" className={styles.colorInput} value={stroke} onCommit={(c) => setNodeStyle(ids, { stroke: c })} />}
      </div>
      {bordered && (
        <div className={styles.row}>
          <span className={styles.label}>Width</span>
          <NumberField
            label="Border width"
            className={styles.numberInput}
            min={1}
            max={12}
            value={(first.style.strokeWidth as number) ?? 1}
            onCommit={(n) => setNodeStyle(ids, { strokeWidth: n })}
          />
          <span className={styles.unit}>pt</span>
        </div>
      )}
      <div className={styles.row}>
        <span className={styles.label}>Opacity</span>
        <RangeField
          label="Opacity"
          className={styles.rangeInput}
          min={0}
          max={1}
          step={0.05}
          value={(first.style.opacity as number) ?? 1}
          onCommit={(v) => setNodeStyle(ids, { opacity: v })}
        />
      </div>
    </div>
  );
}
