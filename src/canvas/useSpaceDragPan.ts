import { useEffect, useState } from "react";

// Plain left-drag is reserved for selection/interaction; panning happens via
// space+drag or middle-mouse-drag. React Flow's panOnDrag takes the set of mouse buttons that
// pan; middle (1) is always active, left (0) is added while space is held.
export function useSpaceDragPan(): number[] {
  const [spaceHeld, setSpaceHeld] = useState(false);

  useEffect(() => {
    const isTypingTarget = (target: EventTarget | null) =>
      target instanceof HTMLElement && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === "Space" && !isTypingTarget(e.target)) {
        e.preventDefault();
        setSpaceHeld(true);
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === "Space") setSpaceHeld(false);
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, []);

  return spaceHeld ? [0, 1] : [1];
}
