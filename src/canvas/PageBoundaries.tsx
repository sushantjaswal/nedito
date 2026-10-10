import { useViewport } from "@xyflow/react";
import { pageGrid, type PageSize } from "../model/pageSize";
import type { Diagram } from "../model/types";
import styles from "./PageBoundaries.module.css";

interface PageBoundariesProps {
  diagram: Diagram;
  pageSize: PageSize;
}

// The printable page, drawn as a sheet behind the drawing, with page breaks once content
// spills past one sheet: an unobtrusive layer under the nodes showing
// exactly what a PDF/print will cut at, so "fits on the page" is answerable while drawing
// rather than after exporting.
export function PageBoundaries({ diagram, pageSize }: PageBoundariesProps) {
  const { x: vx, y: vy, zoom } = useViewport();

  const content = diagram.nodes.length
    ? {
        minX: Math.min(...diagram.nodes.map((n) => n.position.x)),
        minY: Math.min(...diagram.nodes.map((n) => n.position.y)),
        maxX: Math.max(...diagram.nodes.map((n) => n.position.x + n.size.w)),
        maxY: Math.max(...diagram.nodes.map((n) => n.position.y + n.size.h)),
      }
    : { minX: 0, minY: 0, maxX: 0, maxY: 0 };

  const grid = pageGrid(content, pageSize);
  const pages: React.ReactElement[] = [];
  for (let row = 0; row < grid.rows; row++) {
    for (let col = 0; col < grid.cols; col++) {
      const x = grid.originX + col * pageSize.w;
      const y = grid.originY + row * pageSize.h;
      pages.push(
        <div
          key={`${col}:${row}`}
          className={styles.page}
          style={{
            left: x * zoom + vx,
            top: y * zoom + vy,
            width: pageSize.w * zoom,
            height: pageSize.h * zoom,
          }}
        />,
      );
    }
  }

  return (
    <div className={styles.layer} data-testid="nd-page-boundaries" data-page-count={pages.length}>
      {pages}
    </div>
  );
}
