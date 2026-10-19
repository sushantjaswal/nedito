// The AI and agent icons' drawings: the parts every agent and retrieval diagram names.
//
// A section of their own because that is how people look for them — not "an animated icon that
// happens to be about AI", but the vocabulary of one kind of diagram, kept together. Each pair is
// a still and a moving twin of the same drawing, as animatedBodies.ts's are, and the same rules
// hold: the markup is the resting pose, CSS moves parts of it on screen only, line work is
// currentColor and accents are tokens.
//
// Every one reuses a motion already in styles/animatedIcons.css. The behaviours people want from
// motion on a diagram are built elsewhere in the app — Motion, the presentation modes, Trace, the
// GIF export — so what was missing here was things to say, not ways to move. None of these implies
// a rate or a latency: motion on a diagram reads as measurement, and these are illustrations.
import { ACCENT, BAD, OK, ON } from "./animatedBodies";

/** Inference: a model answering — the core pulses while the chip sits still. Rests at full size. */
export const INFERENCE =
  `<path d="M34 8 V20 M50 8 V20 M66 8 V20 M34 80 V92 M50 80 V92 M66 80 V92 M8 34 H20 M8 50 H20 M8 66 H20 M80 34 H92 M80 50 H92 M80 66 H92" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round" />` +
  `<rect x="20" y="20" width="60" height="60" rx="11" fill="none" stroke="currentColor" stroke-width="6" />` +
  `<rect class="nd-anim nd-ic-breathe" x="37" y="37" width="26" height="26" rx="6" fill="${ACCENT}" stroke="none" />`;

/** Token stream: an answer arriving a token at a time, the caret still blinking. Rests mid-line. */
export const TOKEN_STREAM =
  `<path class="nd-anim nd-ic-stream" d="M10 28 H90" fill="none" stroke="currentColor" stroke-width="6" stroke-linecap="round" stroke-dasharray="11 6" />` +
  `<path class="nd-anim nd-ic-stream" d="M10 50 H78" fill="none" stroke="${ACCENT}" stroke-width="6" stroke-linecap="round" stroke-dasharray="11 6" />` +
  `<path class="nd-anim nd-ic-stream" d="M10 72 H56" fill="none" stroke="currentColor" stroke-width="6" stroke-linecap="round" stroke-dasharray="11 6" />` +
  `<rect class="nd-anim nd-ic-blink" x="64" y="63" width="8" height="18" rx="2" fill="${ACCENT}" stroke="none" />`;

/** Embedding: a document becoming points in a space. Rests with every point placed. */
export const EMBEDDING =
  `<path d="M10 18 H40 L52 30 V78 H10 Z" fill="none" stroke="currentColor" stroke-width="6" stroke-linejoin="round" />` +
  `<path d="M60 48 H80 M73 41 L80 48 L73 55" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" />` +
  `<circle class="nd-anim nd-ic-ring" cx="88" cy="24" r="6" fill="${ACCENT}" stroke="none" />` +
  `<circle class="nd-anim nd-ic-ring nd-ic-ring-2" cx="92" cy="62" r="6" fill="${ACCENT}" stroke="none" />` +
  `<circle class="nd-anim nd-ic-ring nd-ic-ring-3" cx="74" cy="80" r="6" fill="${ACCENT}" stroke="none" />`;

/** Vector search: a query reaching out to its nearest neighbours. Rests with every ring drawn. */
export const VECTOR_SEARCH =
  `<circle cx="15" cy="15" r="6" stroke="none" /><circle cx="85" cy="14" r="6" stroke="none" />` +
  `<circle cx="87" cy="85" r="6" stroke="none" /><circle cx="14" cy="84" r="6" stroke="none" />` +
  `<circle class="nd-anim nd-ic-ring" cx="50" cy="50" r="13" fill="none" stroke="${ACCENT}" stroke-width="5" />` +
  `<circle class="nd-anim nd-ic-ring nd-ic-ring-2" cx="50" cy="50" r="23" fill="none" stroke="${ACCENT}" stroke-width="5" />` +
  `<circle class="nd-anim nd-ic-ring nd-ic-ring-3" cx="50" cy="50" r="33" fill="none" stroke="${ACCENT}" stroke-width="5" />` +
  `<circle cx="50" cy="50" r="7" fill="${ACCENT}" stroke="none" />`;

/** Retrieval: passages coming back out of a store. Rests with two on their way. */
export const RETRIEVAL =
  `<path d="M6 26 V70 A14 6 0 0 0 34 70 V26" fill="none" stroke="currentColor" stroke-width="6" stroke-linejoin="round" />` +
  `<ellipse cx="20" cy="26" rx="14" ry="6" fill="none" stroke="currentColor" stroke-width="6" />` +
  `<g class="nd-anim nd-ic-advance">` +
  `<rect class="nd-anim nd-ic-arrive" x="40" y="36" width="17" height="24" rx="3" fill="${ACCENT}" stroke="none" />` +
  `<rect class="nd-anim nd-ic-leave" x="69" y="36" width="17" height="24" rx="3" fill="${ACCENT}" stroke="none" />` +
  `</g>`;

/** Agent thinking: an agent working something out. Rests with all three marks shown. */
export const AGENT_THINKING =
  `<path d="M50 9 L85 29 V71 L50 91 L15 71 V29 Z" fill="none" stroke="currentColor" stroke-width="6" stroke-linejoin="round" />` +
  `<circle class="nd-anim nd-ic-ring" cx="34" cy="50" r="6" fill="${ACCENT}" stroke="none" />` +
  `<circle class="nd-anim nd-ic-ring nd-ic-ring-2" cx="50" cy="50" r="6" fill="${ACCENT}" stroke="none" />` +
  `<circle class="nd-anim nd-ic-ring nd-ic-ring-3" cx="66" cy="50" r="6" fill="${ACCENT}" stroke="none" />`;

/** Tool call: an agent reaching for a tool, which turns. Rests upright. */
export const TOOL_CALL =
  `<g class="nd-anim nd-ic-half-turn">` +
  `<path d="M60 16 A19 19 0 1 1 40 16" fill="none" stroke="currentColor" stroke-width="11" stroke-linecap="round" />` +
  `<rect x="43" y="48" width="14" height="40" rx="7" fill="currentColor" stroke="none" />` +
  `<circle cx="50" cy="32" r="7" fill="${ACCENT}" stroke="none" />` +
  `</g>`;

/** Guardrail: a request stopped at the rail. Rests blocked. */
export const GUARDRAIL =
  `<path d="M8 50 H38 M31 42 L39 50 L31 58" fill="none" stroke="currentColor" stroke-width="6" stroke-linecap="round" stroke-linejoin="round" />` +
  `<rect x="72" y="10" width="14" height="80" rx="7" fill="none" stroke="currentColor" stroke-width="6" />` +
  `<path class="nd-anim nd-ic-flash" d="M48 40 L64 60 M64 40 L48 60" fill="none" stroke="${BAD}" stroke-width="8" stroke-linecap="round" />`;

/** Human in the loop: a person whose approval the run is waiting on. Rests with the mark shown. */
export const HUMAN_IN_THE_LOOP =
  `<circle cx="36" cy="28" r="14" fill="none" stroke="currentColor" stroke-width="6" />` +
  `<path d="M10 84 C10 63 22 51 36 51 C44 51 51 54 56 59" fill="none" stroke="currentColor" stroke-width="6" stroke-linecap="round" />` +
  `<circle cx="72" cy="68" r="22" fill="${ACCENT}" stroke="none" />` +
  `<path class="nd-anim nd-ic-blink" d="M62 68 L69 76 L83 59" fill="none" stroke="${ON}" stroke-width="6" stroke-linecap="round" stroke-linejoin="round" />`;

// ---- Added with the section (I6a+): the rest of the vocabulary, from the same sources.

/** Prompt: what is asked, still being typed. Rests mid-question. */
export const PROMPT =
  `<path d="M10 16 H90 V60 H44 L26 80 V60 H10 Z" fill="none" stroke="currentColor" stroke-width="6" stroke-linejoin="round" />` +
  `<path d="M24 33 H76 M24 47 H56" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round" />` +
  `<rect class="nd-anim nd-ic-blink" x="63" y="39" width="7" height="16" rx="2" fill="${ACCENT}" stroke="none" />`;

/** Chunking: a document cut into the pieces that get indexed. Rests with every piece. */
export const CHUNKING =
  `<path d="M8 14 H40 V86 H8 Z" fill="none" stroke="currentColor" stroke-width="6" stroke-linejoin="round" />` +
  `<path d="M48 50 H62 M56 44 L62 50 L56 56" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" />` +
  `<rect class="nd-anim nd-ic-ring" x="70" y="14" width="24" height="18" rx="4" fill="${ACCENT}" stroke="none" />` +
  `<rect class="nd-anim nd-ic-ring nd-ic-ring-2" x="70" y="41" width="24" height="18" rx="4" fill="${ACCENT}" stroke="none" />` +
  `<rect class="nd-anim nd-ic-ring nd-ic-ring-3" x="70" y="68" width="24" height="18" rx="4" fill="${ACCENT}" stroke="none" />`;

/** Reranking: the best passage moving up the list. Rests with it marked. */
export const RERANKING =
  `<path d="M12 24 H72 M12 50 H88 M12 76 H62" fill="none" stroke="currentColor" stroke-width="8" stroke-linecap="round" />` +
  `<g class="nd-anim nd-ic-rise"><path d="M12 76 H62" fill="none" stroke="${ACCENT}" stroke-width="8" stroke-linecap="round" /></g>`;

/** Recalling: what an agent keeps, the newest layer lit. Rests with every layer. */
export const RECALLING =
  `<rect x="14" y="16" width="72" height="20" rx="7" fill="none" stroke="currentColor" stroke-width="6" />` +
  `<rect class="nd-anim nd-ic-breathe" x="14" y="40" width="72" height="20" rx="7" fill="${ACCENT}" stroke="none" />` +
  `<rect x="14" y="64" width="72" height="20" rx="7" fill="none" stroke="currentColor" stroke-width="6" />`;

/** Routing: one question, several models, one of them taken. Rests with a mark on each branch. */
export const ROUTING =
  `<path d="M28 50 L74 24 M28 50 H74 M28 50 L74 76" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round" opacity="0.45" />` +
  `<circle cx="16" cy="50" r="9" stroke="none" />` +
  `<rect x="76" y="14" width="20" height="20" rx="5" fill="none" stroke="currentColor" stroke-width="5" />` +
  `<rect x="76" y="40" width="20" height="20" rx="5" fill="none" stroke="currentColor" stroke-width="5" />` +
  `<rect x="76" y="66" width="20" height="20" rx="5" fill="none" stroke="currentColor" stroke-width="5" />` +
  `<circle class="nd-anim nd-ic-lb-up" cx="52" cy="37" r="5.5" fill="${ACCENT}" stroke="none" />` +
  `<circle class="nd-anim nd-ic-lb-mid" cx="52" cy="50" r="5.5" fill="${ACCENT}" stroke="none" />` +
  `<circle class="nd-anim nd-ic-lb-down" cx="52" cy="63" r="5.5" fill="${ACCENT}" stroke="none" />`;

/** Evaluating: answers being marked, one after another. Rests with every mark made. */
export const EVALUATING =
  `<path d="M44 24 H90 M44 50 H90 M44 76 H90" fill="none" stroke="currentColor" stroke-width="6" stroke-linecap="round" />` +
  `<path class="nd-anim nd-ic-ring" d="M10 24 L18 32 L32 16" fill="none" stroke="${OK}" stroke-width="7" stroke-linecap="round" stroke-linejoin="round" />` +
  `<path class="nd-anim nd-ic-ring nd-ic-ring-2" d="M10 50 L18 58 L32 42" fill="none" stroke="${OK}" stroke-width="7" stroke-linecap="round" stroke-linejoin="round" />` +
  `<path class="nd-anim nd-ic-ring nd-ic-ring-3" d="M10 76 L18 84 L32 68" fill="none" stroke="${OK}" stroke-width="7" stroke-linecap="round" stroke-linejoin="round" />`;

/** Handoff: one agent passing the work to the next. Rests with both on their way. */
export const HANDOFF =
  `<path d="M18 34 L31 42 V58 L18 66 L5 58 V42 Z" fill="none" stroke="currentColor" stroke-width="5" stroke-linejoin="round" />` +
  `<path d="M82 34 L95 42 V58 L82 66 L69 58 V42 Z" fill="none" stroke="currentColor" stroke-width="5" stroke-linejoin="round" />` +
  `<g class="nd-anim nd-ic-advance">` +
  `<circle class="nd-anim nd-ic-arrive" cx="38" cy="50" r="6" fill="${ACCENT}" stroke="none" />` +
  `<circle class="nd-anim nd-ic-leave" cx="67" cy="50" r="6" fill="${ACCENT}" stroke="none" />` +
  `</g>`;
