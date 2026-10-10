// Health: a status badge on a shape — healthy, degraded or down. It is
// drawn by hand, not fed by anything live, and must look it: a solid disc with a white ring and a
// symbol per state (never colour alone), and a tooltip that says the author set it. Shared by the
// canvas and the still exports, which draw the badge exactly as it rests.
import type { HealthState } from "../model/motion";

/** The badge's diameter, in canvas pixels. */
export const HEALTH_SIZE = 16;

/** Where it sits: centred on the shape's top-right corner, pulled in a little. */
export function healthCentre(box: { x: number; y: number; w: number }): { x: number; y: number } {
  return { x: box.x + box.w - 3, y: box.y + 3 };
}

/** Light-theme colours, for exports (the canvas reads the --nd-status-* tokens). */
export const HEALTH_HEX: Record<HealthState, string> = { healthy: "#1e8e5a", degraded: "#c9820a", down: "#c0392b" };
export const HEALTH_TOKEN: Record<HealthState, string> = {
  healthy: "var(--nd-status-ok)",
  degraded: "var(--nd-status-warn)",
  down: "var(--nd-status-bad)",
};

export const HEALTH_LABEL: Record<HealthState, string> = { healthy: "Healthy", degraded: "Degraded", down: "Down" };

/** The symbol, as a path in a 16×16 box centred on 8,8: a tick, an exclamation mark, a cross. */
export const HEALTH_SYMBOL: Record<HealthState, string> = {
  healthy: "M4.6 8.2 L7 10.6 L11.4 5.6",
  degraded: "M8 4.2 L8 9 M8 11.4 L8 11.6",
  down: "M5.3 5.3 L10.7 10.7 M10.7 5.3 L5.3 10.7",
};

/** The badge as SVG markup at a centre point — for the exports. */
export function healthBadgeSvg(state: HealthState, centre: { x: number; y: number }): string {
  const r = HEALTH_SIZE / 2;
  const x = Math.round((centre.x - r) * 10) / 10;
  const y = Math.round((centre.y - r) * 10) / 10;
  return (
    `<g transform="translate(${x},${y})">` +
    `<circle cx="8" cy="8" r="7.25" fill="${HEALTH_HEX[state]}" stroke="#ffffff" stroke-width="1.5" />` +
    `<path d="${HEALTH_SYMBOL[state]}" fill="none" stroke="#ffffff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />` +
    `</g>`
  );
}
