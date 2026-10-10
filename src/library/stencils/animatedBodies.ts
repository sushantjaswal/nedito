// The animated icons' drawings, shared by the Animated section and
// the still twins in Misc, so every pair matches.
//
// Original SVG, drawn for Nedito from simple primitives in the usual 0..100 box. Each body *is*
// its resting pose: the markup as written is the meaningful still frame — a whole gear, all three
// boxes, the arrow at 0° — and CSS (styles/animatedIcons.css) moves parts of it only on screen,
// through `nd-anim` classes. A still export carries no stylesheet, so it draws that pose and
// nothing else; every motion switch on screen lands on it too.
//
// Colour: solid parts take the shape's fill and line work uses `currentColor`, which the glyph
// sets to the same fill — so recolouring the shape or switching to dark mode recolours the whole
// icon. Accents come from the --nd-icon-* tokens (styles/tokens.css); the exporter resolves them to
// their light-theme values (ICON_TOKEN_HEX), so a picture never carries an unresolved variable.

/** The accent tokens, and what a still export draws for each. */
export const ICON_TOKEN_HEX: Record<string, string> = {
  "--nd-icon-accent": "#6d5ae6",
  "--nd-icon-ok": "#1e8e5a",
  "--nd-icon-warn": "#c9820a",
  "--nd-icon-bad": "#c0392b",
  "--nd-icon-on": "#ffffff",
};

/** Replaces every icon token with its export colour. */
export function resolveIconTokens(svg: string): string {
  return svg.replace(/var\((--nd-icon-[a-z]+)\)/g, (whole, name: string) => ICON_TOKEN_HEX[name] ?? whole);
}

/** The still twin's drawing: the same pose, with nothing left to move. */
export function stillBody(body: string): string {
  return body.replace(/ class="nd-anim[^"]*"/g, "");
}

const ACCENT = "var(--nd-icon-accent)";

// ---- Compute and jobs (I1).

/** Processing: a gear, turning. Rests still. */
const GEAR_TEETH = Array.from({ length: 8 }, (_, i) => `<rect x="44" y="12" width="12" height="16" rx="2.5" transform="rotate(${i * 45} 50 50)" stroke="none" />`).join("");
export const PROCESSING = `<g class="nd-anim nd-ic-spin">${GEAR_TEETH}<circle cx="50" cy="50" r="23" fill="none" stroke="currentColor" stroke-width="12" /></g><circle cx="50" cy="50" r="7" stroke="none" />`;

/** Running: an arc going round its track. Rests at 10 o'clock. */
export const RUNNING =
  `<circle cx="50" cy="50" r="32" fill="none" stroke="currentColor" stroke-width="8" opacity="0.22" />` +
  `<g class="nd-anim nd-ic-spin-fast"><path d="M19.09 58.28 A32 32 0 0 1 41.72 19.09" fill="none" stroke="${ACCENT}" stroke-width="8" stroke-linecap="round" /></g>` +
  `<path d="M43 37 L63 50 L43 63 Z" stroke="none" />`;

/** Scaling out: one box, then a second and a third alongside. Rests with all three. */
export const SCALING_OUT =
  `<rect x="7" y="27" width="24" height="38" rx="4" fill="none" stroke="currentColor" stroke-width="6" />` +
  `<rect class="nd-anim nd-ic-appear" x="38" y="27" width="24" height="38" rx="4" fill="none" stroke="${ACCENT}" stroke-width="6" />` +
  `<rect class="nd-anim nd-ic-appear nd-ic-later" x="69" y="27" width="24" height="38" rx="4" fill="none" stroke="${ACCENT}" stroke-width="6" />` +
  `<path d="M12 79 L88 79" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round" opacity="0.35" />`;

/** Retrying: a looping arrow that comes round again, then waits. Rests at 0°. */
export const RETRYING =
  `<g class="nd-anim nd-ic-retry">` +
  `<path d="M65 24.02 A30 30 0 1 1 35 24.02" fill="none" stroke="currentColor" stroke-width="8" stroke-linecap="round" />` +
  `<path d="M45.6 17.7 L39.4 34.1 L28.4 15.1 Z" stroke="none" />` +
  `</g>` +
  `<circle cx="50" cy="54" r="8" fill="${ACCENT}" stroke="none" />`;

// ---- Data and storage (I2).

/** Writes: a store whose level rises and settles. Rests half full. */
export const WRITES =
  `<rect class="nd-anim nd-ic-level" x="28" y="57" width="44" height="21" fill="${ACCENT}" opacity="0.55" stroke="none" />` +
  `<path d="M22 26 V74 A28 9 0 0 0 78 74 V26" fill="none" stroke="currentColor" stroke-width="6" stroke-linejoin="round" />` +
  `<ellipse cx="50" cy="26" rx="28" ry="9" fill="none" stroke="currentColor" stroke-width="6" />`;

/** Replicating: two arrows chasing round, copying one side to the other. Rests still. */
export const REPLICATING =
  `<g class="nd-anim nd-ic-half-turn">` +
  `<path d="M23.69 40.42 A28 28 0 0 1 76.31 40.42" fill="none" stroke="currentColor" stroke-width="7" stroke-linecap="round" />` +
  `<path d="M79.4 50.4 L83.8 35.6 L68.4 40.9 Z" stroke="none" />` +
  `<path d="M76.31 59.58 A28 28 0 0 1 23.69 59.58" fill="none" stroke="currentColor" stroke-width="7" stroke-linecap="round" />` +
  `<path d="M20.6 49.6 L16.2 64.4 L31.6 59.1 Z" stroke="none" />` +
  `</g>` +
  `<circle cx="50" cy="50" r="7" fill="${ACCENT}" stroke="none" />`;

/** Queue: messages move along the pipe — one arrives, one leaves. Rests with three, evenly spaced. */
export const QUEUE =
  `<path d="M6 26 H94 M6 74 H94" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round" />` +
  `<g class="nd-anim nd-ic-advance">` +
  `<rect class="nd-anim nd-ic-arrive" x="12" y="37" width="18" height="26" rx="3" fill="${ACCENT}" stroke="none" />` +
  `<rect x="41" y="37" width="18" height="26" rx="3" fill="${ACCENT}" stroke="none" />` +
  `<rect class="nd-anim nd-ic-leave" x="70" y="37" width="18" height="26" rx="3" fill="${ACCENT}" stroke="none" />` +
  `</g>`;

/** Streaming: data flowing along waves. Rests as the waves, standing. */
const WAVE = (y: number) => `M8 ${y} Q18 ${y - 9} 28 ${y} T48 ${y} T68 ${y} T88 ${y}`;
export const STREAMING =
  `<path class="nd-anim nd-ic-stream" d="${WAVE(30)}" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round" stroke-dasharray="11 6" />` +
  `<path class="nd-anim nd-ic-stream" d="${WAVE(52)}" fill="none" stroke="${ACCENT}" stroke-width="5" stroke-linecap="round" stroke-dasharray="11 6" />` +
  `<path class="nd-anim nd-ic-stream" d="${WAVE(74)}" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round" stroke-dasharray="11 6" />`;

// ---- Traffic and network (I3).

/** Uploading: an arrow rising out of a tray, again and again. Rests pointing up, in place. */
export const UPLOADING =
  `<path d="M18 62 V80 H82 V62" fill="none" stroke="currentColor" stroke-width="7" stroke-linecap="round" stroke-linejoin="round" />` +
  `<g class="nd-anim nd-ic-rise">` +
  `<path d="M50 66 V22 M33 38 L50 21 L67 38" fill="none" stroke="${ACCENT}" stroke-width="7" stroke-linecap="round" stroke-linejoin="round" />` +
  `</g>`;

/** Load balancing: requests fanning out, one down each branch. Rests with a dot on each. */
export const LOAD_BALANCING =
  `<path d="M28 50 L82 22 M28 50 H82 M28 50 L82 78" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round" opacity="0.45" />` +
  `<circle cx="20" cy="50" r="9" stroke="none" />` +
  `<circle cx="84" cy="22" r="6" stroke="none" /><circle cx="84" cy="50" r="6" stroke="none" /><circle cx="84" cy="78" r="6" stroke="none" />` +
  `<circle class="nd-anim nd-ic-lb-up" cx="55" cy="36" r="5.5" fill="${ACCENT}" stroke="none" />` +
  `<circle class="nd-anim nd-ic-lb-mid" cx="55" cy="50" r="5.5" fill="${ACCENT}" stroke="none" />` +
  `<circle class="nd-anim nd-ic-lb-down" cx="55" cy="64" r="5.5" fill="${ACCENT}" stroke="none" />`;

/** Live traffic: a source on air, its signal lighting outwards on both sides. Rests with every arc. */
export const LIVE_TRAFFIC =
  `<circle cx="50" cy="50" r="8" fill="${ACCENT}" stroke="none" />` +
  `<path class="nd-anim nd-ic-ring" d="M62.26 39.72 A16 16 0 0 1 62.26 60.28 M37.74 60.28 A16 16 0 0 1 37.74 39.72" fill="none" stroke="currentColor" stroke-width="6" stroke-linecap="round" />` +
  `<path class="nd-anim nd-ic-ring nd-ic-ring-2" d="M72.98 30.72 A30 30 0 0 1 72.98 69.28 M27.02 69.28 A30 30 0 0 1 27.02 30.72" fill="none" stroke="currentColor" stroke-width="6" stroke-linecap="round" />` +
  `<path class="nd-anim nd-ic-ring nd-ic-ring-3" d="M83.71 21.72 A44 44 0 0 1 83.71 78.28 M16.29 78.28 A44 44 0 0 1 16.29 21.72" fill="none" stroke="currentColor" stroke-width="6" stroke-linecap="round" />`;

/** Cache hit: a bolt flashing as a request is served. Rests lit. */
export const CACHE_HIT =
  `<rect x="14" y="14" width="72" height="72" rx="12" fill="none" stroke="currentColor" stroke-width="5" opacity="0.35" />` +
  `<path class="nd-anim nd-ic-flash" d="M56 18 L30 54 H47 L42 82 L70 44 H53 Z" fill="var(--nd-icon-warn)" stroke="none" />`;

// ---- Status and operations (I4).

const OK = "var(--nd-icon-ok)";
const WARN = "var(--nd-icon-warn)";
const BAD = "var(--nd-icon-bad)";
/** The symbol on a status disc: white, in either theme. */
const ON = "var(--nd-icon-on)";

/** Healthy: a status light, on, breathing softly. Rests on. */
export const HEALTHY =
  `<circle class="nd-anim nd-ic-breathe" cx="50" cy="50" r="36" fill="${OK}" opacity="0.18" stroke="none" />` +
  `<circle cx="50" cy="50" r="22" fill="${OK}" stroke="none" />` +
  `<path d="M39.5 50.5 L46.5 57.5 L61 42.5" fill="none" stroke="${ON}" stroke-width="6" stroke-linecap="round" stroke-linejoin="round" />`;

/** Degraded: a warning that blinks. Rests fully shown. */
export const DEGRADED =
  `<g class="nd-anim nd-ic-blink">` +
  `<path d="M50 12 L90 82 H10 Z" fill="${WARN}" stroke="${WARN}" stroke-width="6" stroke-linejoin="round" />` +
  `<path d="M50 36 V58" fill="none" stroke="${ON}" stroke-width="8" stroke-linecap="round" />` +
  `<circle cx="50" cy="70" r="4.5" fill="${ON}" stroke="none" />` +
  `</g>`;

/** Down: a failure that shudders. Rests centred. */
export const DOWN =
  `<g class="nd-anim nd-ic-shake">` +
  `<circle cx="50" cy="50" r="36" fill="${BAD}" stroke="none" />` +
  `<path d="M37 37 L63 63 M63 37 L37 63" fill="none" stroke="${ON}" stroke-width="8" stroke-linecap="round" />` +
  `</g>`;

/** Heartbeat: a heart that beats, over its trace. Rests at normal size. */
export const HEARTBEAT =
  `<path class="nd-anim nd-ic-beat" d="M50 84 C20 64 10 48 10 34 C10 22 19 14 30 14 C39 14 46 19 50 27 C54 19 61 14 70 14 C81 14 90 22 90 34 C90 48 80 64 50 84 Z" fill="${BAD}" stroke="none" />` +
  `<path d="M14 50 H34 L40 38 L48 62 L55 44 L59 50 H86" fill="none" stroke="${ON}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" />`;

// ---- Time and trust (I5).

/** Scheduled: a clock whose hand goes round. Rests with the hand at 12. */
export const SCHEDULED =
  `<circle cx="50" cy="50" r="36" fill="none" stroke="currentColor" stroke-width="7" />` +
  `<path d="M50 14 V22 M86 50 H78 M50 86 V78 M14 50 H22" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round" />` +
  `<g class="nd-anim nd-ic-tick"><path d="M50 50 V25" fill="none" stroke="${ACCENT}" stroke-width="6" stroke-linecap="round" /></g>` +
  `<circle cx="50" cy="50" r="5" stroke="none" />`;

/** Protected: a shield that pulses as if it took a hit. Rests at normal size. */
export const PROTECTED =
  `<path class="nd-anim nd-ic-guard" d="M50 10 L84 22 V48 C84 68 70 82 50 90 C30 82 16 68 16 48 V22 Z" fill="none" stroke="currentColor" stroke-width="7" stroke-linejoin="round" />` +
  `<path d="M36 50 L46 60 L65 40" fill="none" stroke="${ACCENT}" stroke-width="7" stroke-linecap="round" stroke-linejoin="round" />`;
