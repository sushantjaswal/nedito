import { useCallback, useRef } from "react";
import { useDocStore } from "../model/store";
import styles from "./RotateHandle.module.css";

interface RotateHandleProps {
  nodeId: string;
  wrapperRef: React.RefObject<HTMLDivElement | null>;
  bodyRef: React.RefObject<HTMLDivElement | null>;
  currentRotation: number;
}

// drag-to-rotate: angle is computed in screen space (pan/zoom don't affect angles, only
// translation/scale do), so no flow-coordinate conversion is needed here.
export function RotateHandle({ nodeId, wrapperRef, bodyRef, currentRotation }: RotateHandleProps) {
  const latestDeg = useRef(currentRotation);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.stopPropagation();
      e.preventDefault();
      const wrapper = wrapperRef.current;
      const body = bodyRef.current;
      if (!wrapper || !body) return;
      const rect = wrapper.getBoundingClientRect();
      const center = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
      useDocStore.getState().setCanvasGesture(true);

      const onMove = (ev: PointerEvent) => {
        const angleRad = Math.atan2(ev.clientY - center.y, ev.clientX - center.x);
        const deg = Math.round((angleRad * 180) / Math.PI + 90);
        latestDeg.current = deg;
        body.style.transform = `rotate(${deg}deg)`;
      };
      const onUp = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        const normalized = ((latestDeg.current % 360) + 360) % 360;
        useDocStore.getState().setCanvasGesture(false);
        useDocStore.getState().moveOrResizeNodes([{ id: nodeId, patch: { rotation: normalized } }]);
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    },
    [nodeId, wrapperRef, bodyRef],
  );

  return <div className={styles.handle} onPointerDown={onPointerDown} title="Rotate" />;
}
