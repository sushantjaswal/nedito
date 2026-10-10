// The startup screen's timing (N3, D102). The screen itself is already on the page — written into
// index.html by the brand plugin and decided by its head script (app/splashPage.ts) — so all this
// does is take it away at the right moment:
//
//   first visit   held until FIRST_HOLD_MS so the name registers, then gone once the canvas is
//                 ready (FIRST_CAP_MS at the latest); any key or click ends it early.
//   later visits  gone the moment the canvas is ready, RETURN_CAP_MS at the latest — and if that
//                 is before RETURN_APPEAR_MS it was never drawn, so it just goes, without a fade.
//   share links   never there (the head script hid it).
//
// It never blocks the app: the screen takes no pointer events, so the canvas underneath is
// interactive the moment it exists, whatever the screen is doing.
import {
  FADE_MS,
  FIRST_CAP_MS,
  FIRST_HOLD_MS,
  RETURN_APPEAR_MS,
  RETURN_CAP_MS,
  SPLASH_SEEN_KEY,
  type SplashMode,
} from "./splashPage";

interface State {
  mode: SplashMode;
  ready: boolean;
  done: boolean;
  timers: number[];
}

let state: State | null = null;

/** When the head script put the screen up; 0 if it did not say. */
let shownAt = 0;
/** How long the screen has been up: the hold and the caps count from when it appeared, not from
 *  navigation start, which a slow server can put well before the page arrives (D107). */
const now = () => performance.now() - shownAt;
const screen = () => document.getElementById("nd-splash");

/** Starts the clock. Called once from main.tsx, before the app renders. */
export function startSplash(): void {
  if (state) return;
  const mode = (document.documentElement.getAttribute("data-nd-splash") as SplashMode | null) ?? "off";
  shownAt = Number(document.documentElement.getAttribute("data-nd-splash-at")) || 0;
  state = { mode, ready: false, done: false, timers: [] };
  if (mode === "off" || !screen()) {
    dismissSplash();
    return;
  }
  revealTextOnceFontLoads();
  if (mode === "first") {
    state.timers.push(window.setTimeout(settle, Math.max(0, FIRST_HOLD_MS - now())));
    state.timers.push(window.setTimeout(dismissSplash, Math.max(0, FIRST_CAP_MS - now())));
    // Someone already reaching for the app does not need to be shown its name.
    window.addEventListener("pointerdown", dismissSplash, { capture: true, once: true });
    window.addEventListener("keydown", dismissSplash, { capture: true, once: true });
  } else {
    state.timers.push(window.setTimeout(dismissSplash, Math.max(0, RETURN_CAP_MS - now())));
  }
}

/** The canvas has mounted (DiagramCanvas's onInit): a later visit's screen goes now. */
export function splashCanvasReady(): void {
  if (!state || state.done) return;
  state.ready = true;
  settle();
}

function settle(): void {
  if (!state || state.done || !state.ready) return;
  if (state.mode === "first" && now() < FIRST_HOLD_MS) return; // the hold timer calls back
  dismissSplash();
}

/** Takes the screen away for good; safe to call any number of times. */
export function dismissSplash(): void {
  if (state?.done) return;
  const mode = state?.mode ?? "off";
  if (state) {
    state.done = true;
    state.timers.forEach((t) => window.clearTimeout(t));
  }
  window.removeEventListener("pointerdown", dismissSplash, { capture: true });
  window.removeEventListener("keydown", dismissSplash, { capture: true });
  if (mode === "first") {
    try {
      localStorage.setItem(SPLASH_SEEN_KEY, new Date().toISOString());
    } catch {
      // best-effort, same pattern as file/autosave.ts
    }
  }
  const el = screen();
  if (!el) return;
  const neverDrawn = mode === "off" || (mode === "return" && now() < RETURN_APPEAR_MS);
  if (neverDrawn || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
    el.remove();
    return;
  }
  el.classList.add("nd-splash-out");
  window.setTimeout(() => el.remove(), FADE_MS + 50);
}

/**
 * The name and line appear only in IBM Plex: painted in a fallback face first, they would reflow
 * when it loaded. Their space is reserved either way, so nothing else moves.
 */
function revealTextOnceFontLoads(): void {
  const reveal = () => screen()?.classList.add("nd-splash-fonts");
  const fonts = (document as Document & { fonts?: FontFaceSet }).fonts;
  if (!fonts?.load) {
    reveal();
    return;
  }
  Promise.all([fonts.load('600 28px "IBM Plex Sans"'), fonts.load('400 14px "IBM Plex Sans"')]).then(reveal, reveal);
}

/** Tests only: forget this load's screen. */
export function resetSplashForTests(): void {
  state?.timers.forEach((t) => window.clearTimeout(t));
  state = null;
  shownAt = 0;
}
