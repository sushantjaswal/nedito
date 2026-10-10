// Zoom in/out steps through clean 25% increments (25%-400%) instead of a freeform
// multiplicative factor, so the zoom badge always lands on a round number after a click or
// Ctrl+=/Ctrl+-. Free-form zoom (scroll wheel, pinch) is untouched and still continuous
// within CLAUDE.md's mandated 10%-400% range — this only governs the discrete step controls.
export const ZOOM_STEP_PERCENT = 25;
export const MIN_STEP_ZOOM_PERCENT = 25;
export const MAX_STEP_ZOOM_PERCENT = 400;

export type ZoomDirection = 1 | -1;

// Steps to the next 25%-multiple in the given direction — from an off-grid zoom (e.g. 137%
// after a scroll-zoom), that's the nearest grid line in that direction, not a fixed +/-25
// added to the raw value (which could under- or over-shoot depending on where the current
// zoom sits relative to the grid).
export function nextSteppedZoom(currentZoom: number, direction: ZoomDirection): number {
  const currentPercent = Math.round(currentZoom * 100);
  const stepped =
    direction === 1
      ? Math.floor(currentPercent / ZOOM_STEP_PERCENT) * ZOOM_STEP_PERCENT + ZOOM_STEP_PERCENT
      : Math.ceil(currentPercent / ZOOM_STEP_PERCENT) * ZOOM_STEP_PERCENT - ZOOM_STEP_PERCENT;
  const clamped = Math.min(MAX_STEP_ZOOM_PERCENT, Math.max(MIN_STEP_ZOOM_PERCENT, stepped));
  return clamped / 100;
}
