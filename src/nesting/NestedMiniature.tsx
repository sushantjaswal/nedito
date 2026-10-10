import { memo } from "react";
import type { Diagram } from "../model/types";
import { useStencilCacheRevision } from "../library/stencils/useStencil";
import { useDocStore } from "../model/store";
import { buildMiniatureSvg } from "./miniatureSvg";
import styles from "./NestedMiniature.module.css";

interface NestedMiniatureProps {
  diagram: Diagram;
  className?: string;
}

// A live thumbnail of what's actually inside the child diagram, drawn straight from the model.
//
// This deliberately replaces the hand-picked `collapsed.icons` row as the *default* collapsed
// view: authors kept seeing a box labelled
// "Empty" over a child diagram full of shapes, because the collapsed design was something you
// had to remember to curate by hand. Explicitly chosen icons still win when present — the
// author-designed view remains available, it's just no longer the only option.
//
// The markup itself is built in miniatureSvg.ts, which the SVG exporter calls too — the canvas
// and an export must never draw different thumbnails.
function NestedMiniatureComponent({ diagram, className }: NestedMiniatureProps) {
  // The thumbnail reads a stencil for every shape in the child, so it redraws whenever the cache
  // grows rather than waiting on any one of them.
  useStencilCacheRevision();
  const assets = useDocStore((s) => s.doc.assets);
  const mini = buildMiniatureSvg(
    diagram,
    { edge: styles.edge, tile: styles.tile, nestedBox: styles.nestedBox },
    assets,
  );
  if (!mini) return null;

  return (
    <svg
      className={className ? `${styles.svg} ${className}` : styles.svg}
      viewBox={mini.viewBox}
      preserveAspectRatio="xMidYMid meet"
      aria-hidden="true"
      // Built from authored-in-repo stencil markup and the document's own numbers — see
      // StencilDef; no user-supplied HTML reaches this.
      dangerouslySetInnerHTML={{ __html: mini.body }}
    />
  );
}

export const NestedMiniature = memo(NestedMiniatureComponent);
