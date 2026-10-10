// Smart guides: while dragging a single node, snap its edges/center to
// the nearest matching edge/center of any other node on the canvas, within a small threshold.
export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface SnapResult {
  dx: number;
  dy: number;
  verticalGuideX?: number;
  horizontalGuideY?: number;
}

const DEFAULT_THRESHOLD = 6;

export function computeSnap(dragged: Box, others: Box[], threshold = DEFAULT_THRESHOLD): SnapResult {
  const dLeft = dragged.x;
  const dRight = dragged.x + dragged.w;
  const dCenterX = dragged.x + dragged.w / 2;
  const dTop = dragged.y;
  const dBottom = dragged.y + dragged.h;
  const dCenterY = dragged.y + dragged.h / 2;

  let bestDx = 0;
  let bestXDist = threshold;
  let verticalGuideX: number | undefined;
  let bestDy = 0;
  let bestYDist = threshold;
  let horizontalGuideY: number | undefined;

  for (const o of others) {
    const oLeft = o.x;
    const oRight = o.x + o.w;
    const oCenterX = o.x + o.w / 2;
    const oTop = o.y;
    const oBottom = o.y + o.h;
    const oCenterY = o.y + o.h / 2;

    const xPairs: [number, number][] = [
      [dLeft, oLeft],
      [dRight, oRight],
      [dCenterX, oCenterX],
      [dLeft, oRight],
      [dRight, oLeft],
    ];
    for (const [dEdge, oEdge] of xPairs) {
      const dist = Math.abs(dEdge - oEdge);
      if (dist < bestXDist) {
        bestXDist = dist;
        bestDx = oEdge - dEdge;
        verticalGuideX = oEdge;
      }
    }

    const yPairs: [number, number][] = [
      [dTop, oTop],
      [dBottom, oBottom],
      [dCenterY, oCenterY],
      [dTop, oBottom],
      [dBottom, oTop],
    ];
    for (const [dEdge, oEdge] of yPairs) {
      const dist = Math.abs(dEdge - oEdge);
      if (dist < bestYDist) {
        bestYDist = dist;
        bestDy = oEdge - dEdge;
        horizontalGuideY = oEdge;
      }
    }
  }

  return { dx: bestDx, dy: bestDy, verticalGuideX, horizontalGuideY };
}
