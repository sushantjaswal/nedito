// Step badges (A6, CLAUDE_HISTORY.md D123): a presentation's step numbers. Walkthrough shows them
// to readers and rests as them in every still export — a numbered path is still a path when
// nothing moves. Build and Spotlight show them only to the author, in the editor, as an outline,
// so the order can be seen while it is set; readers and exports never see those.
// Shared by the canvas and the exports, which draw a badge exactly as it rests.

/** The badge's height, in canvas pixels; it widens for two digits and more. */
export const STEP_SIZE = 18;

/** Where a shape's badge sits: centred on its top-left corner, pulled in a little (Health has the top-right). */
export function stepCentre(box: { x: number; y: number }): { x: number; y: number } {
  return { x: box.x + 3, y: box.y + 3 };
}

/** Where a line's badge sits: on its middle, or just above a label that sits there. */
export function lineStepCentre(mid: { x: number; y: number }, labelled: boolean): { x: number; y: number } {
  return labelled ? { x: mid.x, y: mid.y - 17 } : mid;
}

export function stepWidth(n: number): number {
  return n < 10 ? STEP_SIZE : STEP_SIZE + (String(n).length - 1) * 7;
}

/** Light-theme accent, for exports (the canvas reads --nd-color-nest-accent). */
export const STEP_HEX = "#6D5AE6";

/** A Walkthrough badge as SVG markup at a centre point — for the exports. */
export function stepBadgeSvg(n: number, centre: { x: number; y: number }, fontFamily: string): string {
  const w = stepWidth(n);
  const x = Math.round((centre.x - w / 2) * 10) / 10;
  const y = Math.round((centre.y - STEP_SIZE / 2) * 10) / 10;
  return (
    `<g transform="translate(${x},${y})">` +
    `<rect x="0.75" y="0.75" width="${w - 1.5}" height="${STEP_SIZE - 1.5}" rx="${(STEP_SIZE - 1.5) / 2}" fill="${STEP_HEX}" stroke="#ffffff" stroke-width="1.5" />` +
    `<text x="${w / 2}" y="${STEP_SIZE / 2}" text-anchor="middle" dominant-baseline="central" font-family="${fontFamily}" font-size="10.5" font-weight="700" fill="#ffffff">${n}</text>` +
    `</g>`
  );
}

/**
 * The Walkthrough dot's timing along the path through every step: it rests at each step, then
 * travels to the next, and starts again from the first. Fractions of the path's length, for
 * SVG's <animateMotion keyPoints/keyTimes>.
 */
export const WALK_REST_S = 0.6;
export const WALK_TRAVEL_S = 1.3;

export function walkTiming(points: { x: number; y: number }[]): { dur: number; keyPoints: string; keyTimes: string } | null {
  if (points.length < 2) return null;
  const lengths = [0];
  for (let i = 1; i < points.length; i++) lengths.push(lengths[i - 1] + Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y));
  const total = lengths[lengths.length - 1];
  if (total === 0) return null;
  const n = points.length;
  const dur = n * WALK_REST_S + (n - 1) * WALK_TRAVEL_S;
  const kp: number[] = [];
  const kt: number[] = [];
  let t = 0;
  for (let i = 0; i < n; i++) {
    const f = lengths[i] / total;
    kp.push(f, f);
    kt.push(t, t + WALK_REST_S);
    t += WALK_REST_S + WALK_TRAVEL_S;
  }
  const round = (v: number) => Math.round(v * 10000) / 10000;
  // The last rest ends exactly at the end of the cycle.
  kt[kt.length - 1] = dur;
  return { dur, keyPoints: kp.map(round).join(";"), keyTimes: kt.map((v) => round(v / dur)).join(";") };
}
