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
 * Part of the canvas to keep clear of what is being revealed, because something is drawn over it:
 * a note's card down one side, and the pager along the foot.
 *
 * Passing one changes what revealing means. Without it the canvas is *panned* at the zoom it has
 * — enough to bring a new shape into view, nothing more. With it the canvas is *framed*: the rect
 * is fitted into the part of the canvas that is left, because a note's card asserts that the lit
 * shapes are what it is describing, and shapes that are technically on screen at 20% zoom, or
 * sitting underneath the card, do not make that true.
 */
export interface RevealReserve {
  /** The side the card is on, whose width is not available to the diagram. */
  side?: "left" | "right";
  px?: number;
  /** Room at the foot of the canvas, for the pager. */
  bottomPx?: number;
}

/** Matches the canvas's own limits (DiagramCanvas.tsx), so a frame never lands outside them. */
const MIN_ZOOM = 0.1;
/**
 * Framing never zooms *in* past natural size. Fitting one small shape to a whole canvas would
 * throw the reader to 400% and lose every landmark around it; a note is read in context.
 */
const MAX_FRAME_ZOOM = 1;

/**
 * Pans the canvas, at the zoom it has, just far enough that a diagram rectangle is fully in
 * view with a margin, so a newly added shape is never placed out of sight. Nothing
 * happens when it is already visible.
 *
 * With `reserve`, it frames instead: see RevealReserve. Omitting it is exactly the behaviour
 * every existing caller has always had — the parameter cannot change a call that does not pass it.
 */
export function revealRect(
  rect: { x: number; y: number; w: number; h: number },
  margin = 40,
  reserve?: RevealReserve,
): void {
  const bounds = document.querySelector('[data-testid="nd-canvas"]')?.getBoundingClientRect();
  if (!instance || !bounds) return;
  if (reserve) {
    frameRect(rect, margin, reserve, bounds);
    return;
  }
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

/**
 * Fits `rect` into whatever part of the canvas `reserve` leaves, centred in it. Always moves,
 * unlike the pan above: the point is that the reader is looking at the right thing at a readable
 * size, not that it is technically on screen.
 */
function frameRect(
  rect: { x: number; y: number; w: number; h: number },
  margin: number,
  reserve: RevealReserve,
  bounds: { width: number; height: number },
): void {
  if (!instance) return;
  const aside = reserve.side ? (reserve.px ?? 0) : 0;
  const left = reserve.side === "left" ? aside : 0;
  const right = bounds.width - (reserve.side === "right" ? aside : 0);
  const bottom = bounds.height - (reserve.bottomPx ?? 0);
  // A canvas too small for the margins it was asked for still has to show something.
  const availableWidth = Math.max(right - left - margin * 2, 1);
  const availableHeight = Math.max(bottom - margin * 2, 1);

  const zoom = Math.min(
    MAX_FRAME_ZOOM,
    Math.max(MIN_ZOOM, Math.min(availableWidth / Math.max(rect.w, 1), availableHeight / Math.max(rect.h, 1))),
  );
  const centreX = (left + right) / 2;
  const centreY = bottom / 2;
  void instance.setViewport({
    x: centreX - (rect.x + rect.w / 2) * zoom,
    y: centreY - (rect.y + rect.h / 2) * zoom,
    zoom,
  });
}
