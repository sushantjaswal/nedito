// Module-scope handle to the mounted ReactFlow instance so components outside the
// ReactFlowProvider tree (the shape library sidebar, nesting navigation) can reach it without
// prop-drilling the instance through the shell.
// Narrowed to the methods callers need — the full ReactFlowInstance type is generic over the
// node type and doesn't assign cleanly across our custom FlowShapeNode boundary.
export interface Viewport {
  x: number;
  y: number;
  zoom: number;
}

export interface CanvasApi {
  screenToFlowPosition: (point: { x: number; y: number }) => { x: number; y: number };
  getViewport: () => Viewport;
  setViewport: (viewport: Viewport, options?: { duration?: number }) => Promise<boolean>;
  fitView: (options?: {
    nodes?: { id: string }[];
    duration?: number;
    padding?: number;
    maxZoom?: number;
  }) => Promise<boolean>;
}

let instance: CanvasApi | null = null;

export function setCanvasInstance(i: CanvasApi | null): void {
  instance = i;
}

export function getCanvasInstance(): CanvasApi | null {
  return instance;
}

/** The diagram point at the middle of the visible canvas, where "place it" puts things. */
export function viewCenter(): { x: number; y: number } {
  const bounds = document.querySelector('[data-testid="nd-canvas"]')?.getBoundingClientRect();
  if (!instance || !bounds) return { x: 200, y: 200 };
  return instance.screenToFlowPosition({ x: bounds.left + bounds.width / 2, y: bounds.top + bounds.height / 2 });
}

// The stepped Zoom In/Out logic (25% increments, zooming toward the pane's visual center)
// lives in DiagramCanvasInner since it needs the pane's DOM bounds — registered here the same
// way setCanvasInstance registers the raw ReactFlowInstance, so callers outside the
// ReactFlowProvider tree (the keyboard shortcut hook) can reach it without prop-drilling.
let stepZoomFn: ((direction: 1 | -1) => void) | null = null;

export function setStepZoom(fn: ((direction: 1 | -1) => void) | null): void {
  stepZoomFn = fn;
}

export function stepZoom(direction: 1 | -1): void {
  stepZoomFn?.(direction);
}

/**
 * Pans the canvas, at the zoom it has, just far enough that a diagram rectangle is fully in
 * view with a margin, so a newly added shape is never placed out of sight. Nothing
 * happens when it is already visible.
 */
export function revealRect(rect: { x: number; y: number; w: number; h: number }, margin = 40): void {
  const bounds = document.querySelector('[data-testid="nd-canvas"]')?.getBoundingClientRect();
  if (!instance || !bounds) return;
  const viewport = instance.getViewport();
  const { zoom } = viewport;
  // The rectangle on screen, relative to the canvas.
  const left = rect.x * zoom + viewport.x;
  const top = rect.y * zoom + viewport.y;
  const right = left + rect.w * zoom;
  const bottom = top + rect.h * zoom;
  const shift = (lo: number, hi: number, size: number) =>
    lo < margin ? margin - lo : hi > size - margin ? Math.max(size - margin - hi, margin - lo) : 0;
  const dx = shift(left, right, bounds.width);
  const dy = shift(top, bottom, bounds.height);
  if (dx === 0 && dy === 0) return;
  void instance.setViewport({ x: viewport.x + dx, y: viewport.y + dy, zoom });
}
