import { memo, useMemo } from "react";
import { ViewportPortal } from "@xyflow/react";
import { walkTiming } from "./stepGeometry";
import { stepPoint } from "./stepPoint";
import type { Diagram } from "../model/types";
import { useDocStore } from "../model/store";

/**
 * Walkthrough's travelling dot (A6, D123): it travels from step to step, pausing at each, then
 * starts again from the first. It goes beneath the shapes and above the lines (z-index 0:
 * the lines' layer is 0 and earlier, every shape 1 or more), so it is handed from one to the next
 * like a token and never sits on a label. SVG's own <animateMotion>, as Packets uses — no per-frame script.
 * Every motion switch removes it (styles/motion.css), leaving the numbered badges as the rest
 * state; it steps aside while a shape is being dragged, since it follows the saved positions.
 */
export const WalkthroughDot = memo(function WalkthroughDot({ diagram, order }: { diagram: Diagram; order: string[] }) {
  const gesture = useDocStore((s) => s.ui.canvasGesture);
  const walk = useMemo(() => {
    const points = order.map((id) => stepPoint(diagram, id)).filter((p): p is { x: number; y: number } => p !== null);
    const timing = walkTiming(points);
    if (!timing) return null;
    const r = (v: number) => Math.round(v * 10) / 10;
    return { d: points.map((p, i) => `${i ? "L" : "M"}${r(p.x)},${r(p.y)}`).join(" "), timing };
  }, [diagram, order]);
  if (!walk || gesture) return null;
  return (
    <ViewportPortal>
      <svg className="nd-walk" width="1" height="1" aria-hidden="true" data-testid="nd-walk">
        <circle className="nd-anim nd-walk-dot" r="7">
          <animateMotion
            path={walk.d}
            dur={`${walk.timing.dur}s`}
            keyPoints={walk.timing.keyPoints}
            keyTimes={walk.timing.keyTimes}
            calcMode="linear"
            repeatCount="indefinite"
          />
        </circle>
      </svg>
    </ViewportPortal>
  );
});
