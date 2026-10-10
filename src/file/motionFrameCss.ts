// The stylesheet a moving-picture frame carries: the canvas's own
// motion rules — styles/motion.css and styles/animatedIcons.css, read as they ship — with every
// animation paused at the frame's moment. A paused CSS animation with a negative delay shows
// exactly that moment, in an SVG drawn as an image too, so a GIF frame is the canvas at time t
// by the very rules that move the canvas, not by a second copy of them that could drift.
import motionCss from "../styles/motion.css?raw";
import iconCss from "../styles/animatedIcons.css?raw";

/** motion.css up to its off switches: a frame always moves, whatever the exporting reader's setting. */
const MOTION_RULES = motionCss.split("/* The off switches. */")[0];

/** Rules that start their animation late (`animation-delay: 0.45s`): selector and delay in seconds. */
function delayedRules(css: string): { selector: string; delay: number }[] {
  const out: { selector: string; delay: number }[] = [];
  for (const m of css.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const delay = /animation-delay:\s*(-?[\d.]+)s/.exec(m[2]);
    if (delay) out.push({ selector: m[1].trim(), delay: Number(delay[1]) });
  }
  return out;
}

const DELAYED = [...delayedRules(MOTION_RULES), ...delayedRules(iconCss)];

/** The frame's own additions: a drawn outline for Pulse in a picture, and the moment itself. */
function frameRules(t: number): string {
  const at = (delay: number) => `${Math.round((delay - t) * 1000) / 1000}s`;
  return [
    // Pulse's outline in a picture: stroked in the accent, nothing filled (the canvas's ShapeHalo).
    ".nd-outline-svg *{fill:none!important;stroke:#6d5ae6!important;stroke-width:2px!important;stroke-dasharray:none!important;vector-effect:non-scaling-stroke}",
    ".nd-outline-glow *{stroke-width:7px!important}",
    ".nd-ripple{transform-box:fill-box;transform-origin:center}",
    // The moment: every animation paused, t seconds in, each late starter keeping its lateness.
    ".nd-anim,.nd-anim *{animation-play-state:paused!important}",
    `.nd-anim{animation-delay:${at(0)}!important}`,
    ...DELAYED.map(({ selector, delay }) =>
      `${selector
        .split(",")
        .map((s) => `${s.trim()}.nd-anim`)
        .join(",")}{animation-delay:${at(delay)}!important}`,
    ),
  ].join("\n");
}

/** Everything a frame at `t` seconds needs to show the motion as the canvas would. */
export function frameCss(t: number): string {
  // Comments out: they name SVG elements in angle brackets, and the sheet sits inside SVG markup.
  return `${MOTION_RULES}\n${iconCss}\n${frameRules(t)}`.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\n\s*\n+/g, "\n");
}
