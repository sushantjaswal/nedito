import { useState } from "react";
import { getCanvasInstance } from "../canvas/canvasApi";
import { shapeDash } from "../canvas/shapeEffects";
import { getStencil } from "./stencils";
import { getStencilPreviewStyle, getStencilRenderFill, isIconStyleStencil, stencilBody } from "./stencils/defaultStyle";
import { isClassicLook } from "../model/look";
import { StencilGlyph } from "./stencils/StencilGlyph";
import { useDocStore } from "../model/store";
import type { ScratchpadItem } from "../model/scratchpad";
import styles from "./ShapeLibrary.module.css";
import scratchpadStyles from "./ScratchpadSection.module.css";

const STENCIL_MIME = "application/nd-stencil";

function viewportCenter(size: { w: number; h: number }): { x: number; y: number } {
  const api = getCanvasInstance();
  let center = { x: 200, y: 200 };
  if (api) {
    const bounds = document.querySelector('[data-testid="nd-canvas"]')?.getBoundingClientRect();
    if (bounds) {
      center = api.screenToFlowPosition({ x: bounds.left + bounds.width / 2, y: bounds.top + bounds.height / 2 });
    }
  }
  return { x: center.x - size.w / 2, y: center.y - size.h / 2 };
}

function onDragStart(event: React.DragEvent, item: ScratchpadItem) {
  event.dataTransfer.setData(
    STENCIL_MIME,
    JSON.stringify({ id: item.shapeRef, w: item.size.w, h: item.size.h, kind: "scratchpad", item }),
  );
  event.dataTransfer.effectAllowed = "copy";
}

// The Scratchpad section (shown as Favorites): shapes kept to reuse, persisted in localStorage.
// Native HTML5 drag-and-drop FROM a React-Flow-managed canvas node risks conflicting with
// React Flow's own pointer-capture-based node dragging (the same class of fragility already
// documented for d3-drag elsewhere in this project). "Add to
// Scratchpad" on a shape's right-click context menu captures it instead; dragging OUT of the
// scratchpad onto the canvas reuses the existing, already-proven sidebar-to-canvas DnD path.
export function ScratchpadSection() {
  const items = useDocStore((s) => s.scratchpad);
  const removeScratchpadItem = useDocStore((s) => s.removeScratchpadItem);
  const addShapeNodeFromScratchpad = useDocStore((s) => s.addShapeNodeFromScratchpad);
  const addStencilToScratchpad = useDocStore((s) => s.addStencilToScratchpad);
  const [dropActive, setDropActive] = useState(false);

  // Dragging a stencil from the library onto this section saves it, which is the gesture people
  // reach for first — the right-click route needs the shape on the canvas already. Reuses the
  // same drag payload the sidebar-to-canvas path puts on the dataTransfer.
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDropActive(false);
    const raw = e.dataTransfer.getData(STENCIL_MIME);
    if (!raw) return;
    try {
      const payload = JSON.parse(raw) as { id: string; w: number; h: number; kind?: string };
      // A nested diagram isn't a reusable shape snapshot — placing one creates a child diagram,
      // which a favourite can't carry.
      if (payload.kind === "nested") return;
      addStencilToScratchpad(payload.id, { w: payload.w, h: payload.h });
    } catch {
      // Malformed payload: ignore rather than throwing inside a drop handler.
    }
  };
  const onDragOver = (e: React.DragEvent) => {
    if (!e.dataTransfer.types.includes(STENCIL_MIME)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    setDropActive(true);
  };

  const dropProps = {
    onDrop,
    onDragOver,
    onDragLeave: () => setDropActive(false),
    "data-testid": "nd-favorites-dropzone",
  };

  if (items.length === 0) {
    return (
      <div
        className={dropActive ? `${scratchpadStyles.hint} ${scratchpadStyles.hintDropActive}` : scratchpadStyles.hint}
        {...dropProps}
      >
        Drag a shape here, or right-click one → "Add to Favorites".
      </div>
    );
  }

  return (
    <div className={dropActive ? `${styles.shapeGrid} ${scratchpadStyles.gridDropActive}` : styles.shapeGrid} {...dropProps}>
      {items.map((item) => {
        const stencil = getStencil(item.shapeRef);
        const displayLabel = item.label?.text || stencil?.label || item.shapeRef;
        const classic = isClassicLook(item.style);
        const defaultStyle = stencil ? getStencilPreviewStyle(stencil, classic) : { fill: "#ffffff", stroke: "#1e2733", strokeWidth: 4 };
        const defaultRenderFill = stencil ? getStencilRenderFill(stencil, classic) : "#ffffff";
        return (
          <div key={item.id} className={scratchpadStyles.itemWrapper}>
            <button
              type="button"
              className={styles.shapeItem}
              draggable
              onDragStart={(e) => onDragStart(e, item)}
              onClick={() => addShapeNodeFromScratchpad(item, viewportCenter(item.size))}
              title={displayLabel}
              data-testid={`nd-scratchpad-${item.id}`}
            >
              {stencil && (
                <StencilGlyph
                  svgBody={stencilBody(stencil, classic)}
                  raw={stencil.raw}
                  fill={(item.style.fill as string) ?? defaultRenderFill}
                  stroke={(item.style.stroke as string) ?? defaultStyle.stroke}
                  strokeWidth={(item.style.strokeWidth as number) ?? defaultStyle.strokeWidth}
                  className={styles.shapeGlyph}
                  dash={shapeDash(item.style)}
                  aspectRatio={isIconStyleStencil(stencil) ? undefined : item.size.w / item.size.h}
                />
              )}
              <span className={styles.shapeLabel}>{displayLabel}</span>
            </button>
            <button
              type="button"
              className={scratchpadStyles.removeBtn}
              onClick={() => removeScratchpadItem(item.id)}
              title="Remove from Favorites"
              aria-label="Remove from Favorites"
            >
              ×
            </button>
          </div>
        );
      })}
    </div>
  );
}
