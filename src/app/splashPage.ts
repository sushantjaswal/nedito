// The startup screen's page parts (N3, D102): the markup, the CSS and the tiny head script that
// decide it, written into index.html by the brand plugin (vite.brand.ts) so the screen is in the
// first paint, already in its final position, before any of the app's JavaScript has loaded.
// The timing — when it leaves — lives in app/splash.ts, which runs once the bundle does.
//
// Node-safe: imported by the Vite config as well as by the app, so nothing here touches the DOM.
import { BRAND, LEGACY_BRANDS } from "./brand";
import { SHARE_PARAM_DOC } from "../share/constants";

/** first: never been here — hold so the name registers. return: only while loading. off: never. */
export type SplashMode = "first" | "return" | "off";
export type SplashTheme = "light" | "dark";

/** Set once a first-visit screen has been shown, so every later visit gets the short one. */
export const SPLASH_SEEN_KEY = `${BRAND.storagePrefix}:splashSeen`;

/** A first visit holds the screen this long from navigation start, so the name registers. */
export const FIRST_HOLD_MS = 1800;
/** ...and gives up waiting for the canvas after this long, so a failed load is never hidden. */
export const FIRST_CAP_MS = 3000;
/** A later visit shows it only while loading, never longer than this. */
export const RETURN_CAP_MS = 1000;
/**
 * A later visit draws nothing for this long, so a fast load (the usual case for a returning,
 * cached visit) never flashes the screen at all — the page shows plain canvas colour, then the
 * canvas.
 */
export const RETURN_APPEAR_MS = 150;
/** The fade out. */
export const FADE_MS = 200;

export interface SplashInputs {
  shareParam: string;
  seenKey: string;
  /** Any of these holding something means there is work here: never a first visit. */
  autosaveKeys: string[];
  /** The stored theme, newest name first; the rename's storage migration has not run yet. */
  themeKeys: string[];
}

export const SPLASH_INPUTS: SplashInputs = {
  shareParam: SHARE_PARAM_DOC,
  seenKey: SPLASH_SEEN_KEY,
  autosaveKeys: [BRAND, ...LEGACY_BRANDS].map((b) => `${b.storagePrefix}:autosave`),
  themeKeys: [BRAND, ...LEGACY_BRANDS].map((b) => `${b.storagePrefix}:theme`),
};

/**
 * Which screen this load gets. Runs inline in the page head, before the first paint — it is
 * serialised into the page with toString(), so it must stay self-contained: no imports, no
 * helpers, everything it needs passed in.
 *
 * A share link never gets one (the viewer is someone else's diagram, not the app starting). A
 * stored autosave means a returning visitor whose diagram is about to come back: never held.
 * Storage that cannot be read at all counts as a return, since the seen flag could never be
 * stored and every visit would otherwise hold.
 */
export function decideSplash(
  hash: string,
  read: (key: string) => string | null,
  c: SplashInputs,
): { mode: SplashMode; theme: SplashTheme } {
  if (new URLSearchParams(hash.charAt(0) === "#" ? hash.slice(1) : hash).has(c.shareParam)) {
    return { mode: "off", theme: "light" };
  }
  try {
    let theme: SplashTheme = "light";
    for (const k of c.themeKeys) {
      const v = read(k);
      if (v !== null) {
        theme = v === "dark" ? "dark" : "light";
        break;
      }
    }
    let first = read(c.seenKey) === null;
    for (const k of c.autosaveKeys) if (read(k) !== null) first = false;
    return { mode: first ? "first" : "return", theme };
  } catch {
    return { mode: "return", theme: "light" };
  }
}

/**
 * The head script: decides, and records the decision on <html> for the CSS and app/splash.ts —
 * and the moment the screen went up, since a slow server can deliver the page well after
 * navigation starts, and the hold and the caps are about how long the screen is seen (D107).
 */
export function splashScript(): string {
  return [
    "(function(){",
    'var r={mode:"return",theme:"light"};',
    `try{r=(${decideSplash.toString()})(location.hash,function(k){return localStorage.getItem(k)},${JSON.stringify(SPLASH_INPUTS)})}catch(e){}`,
    'var h=document.documentElement;h.setAttribute("data-nd-splash",r.mode);h.setAttribute("data-nd-splash-theme",r.theme);',
    // When the screen goes up: every time in app/splash.ts counts from here, as the CSS caps do.
    'h.setAttribute("data-nd-splash-at",String(Math.round(performance.now())));',
    "})();",
  ].join("");
}

/**
 * The icon for the screen: the app icon file itself (public/icons/app-icon.svg, D101), never a
 * redrawing — only marked up so the frame can draw itself and the inner block settle. The frame
 * gets pathLength 100 so the draw is a dash of 100 whatever its real perimeter.
 */
export function splashIcon(appIconSvg: string): string {
  let rects = 0;
  return appIconSvg
    .replace(/<metadata>[\s\S]*?<\/metadata>/, "")
    .replace(/<svg\b[^>]*>/, (root) =>
      root
        .replace(/\s(width|height)="\d+"/g, "")
        .replace(/\srole="img"/, "")
        .replace(/\saria-label="[^"]*"/, "")
        .replace(/\sxmlns:c2pa="[^"]*"/, "")
        .replace(/>$/, ' class="nd-splash-icon" aria-hidden="true" focusable="false">'),
    )
    .replace(/<rect\b/g, (tag) => {
      rects += 1;
      if (rects === 2) return '<rect class="nd-splash-frame" pathLength="100"';
      if (rects === 3) return '<rect class="nd-splash-block"';
      return tag;
    })
    .replace(/\n\s*/g, "");
}

/** The screen itself: decorative (the app announces itself once loaded), never in the way. */
export function splashMarkup(appIconSvg: string): string {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
  return (
    `<div id="nd-splash" aria-hidden="true"><div class="nd-splash-body">${splashIcon(appIconSvg)}` +
    `<div class="nd-splash-name">${esc(BRAND.name)}</div><div class="nd-splash-line">${esc(BRAND.tagline)}</div></div></div>`
  );
}

/**
 * The screen's CSS. Colours and the font stack are the tokens' (styles/tokens.css), passed in
 * by the plugin so they cannot drift (the stack set as the same --font-sans, since tokens.css has
 * not loaded yet at the first paint). Every size is fixed — the icon, the column's width and the
 * two text lines' heights — so nothing moves, not by a fraction of a pixel, when the text
 * appears; the text itself only appears once IBM Plex has loaded (app/splash.ts), so it never
 * paints in a fallback face and then reflows.
 *
 * The frame draws in 360ms, the block fades in and settles over the next 240ms: 600ms in all.
 * The frame drops its dash once drawn — a dash meeting its own start leaves a hairline seam that
 * the closed outline does not have. Reduced motion keeps the screen and drops all of it.
 *
 * The caps are here as well as in app/splash.ts: the script can only enforce them once the app's
 * JavaScript runs, which on a slow load is already past them, so the page fades the screen out at
 * its cap by itself (D107).
 */
export function splashCss(t: { fontSans: string; light: SplashColors; dark: SplashColors }): string {
  const delayed = (ms: number) => `${ms + RETURN_APPEAR_MS}ms`;
  return `
#nd-splash{position:fixed;inset:0;z-index:2147483000;display:flex;align-items:center;justify-content:center;background:${t.light.canvas};color:${t.light.ink};--font-sans:${t.fontSans};font-family:var(--font-sans);pointer-events:none;transition:opacity ${FADE_MS}ms ease-out}
html[data-nd-splash="off"] #nd-splash{display:none}
html[data-nd-splash-theme="dark"] #nd-splash{background:${t.dark.canvas};color:${t.dark.ink}}
html[data-nd-splash-theme="dark"] .nd-splash-line{color:${t.dark.muted}}
#nd-splash.nd-splash-out{opacity:0}
html[data-nd-splash="first"] #nd-splash{animation:nd-splash-cap ${FADE_MS}ms ${FIRST_CAP_MS}ms forwards}
html[data-nd-splash="return"] #nd-splash{animation:nd-splash-cap ${FADE_MS}ms ${RETURN_CAP_MS}ms forwards}
.nd-splash-body{display:flex;flex-direction:column;align-items:center;width:320px}
html[data-nd-splash="return"] .nd-splash-body{opacity:0;animation:nd-splash-appear 0s ${RETURN_APPEAR_MS}ms forwards}
.nd-splash-icon{display:block;width:96px;height:96px;flex:none}
.nd-splash-name{margin-top:20px;height:36px;font-size:28px;line-height:36px;font-weight:600;letter-spacing:-0.01em}
.nd-splash-line{margin-top:2px;height:20px;font-size:14px;line-height:20px;color:${t.light.muted}}
.nd-splash-name,.nd-splash-line{white-space:nowrap;opacity:0;transition:opacity 160ms ease-out}
#nd-splash.nd-splash-fonts .nd-splash-name,#nd-splash.nd-splash-fonts .nd-splash-line{opacity:1}
.nd-splash-frame{stroke-dasharray:100;stroke-dashoffset:100;animation:nd-splash-draw 360ms cubic-bezier(.4,0,.2,1) forwards}
.nd-splash-block{opacity:0;transform-box:fill-box;transform-origin:center;animation:nd-splash-settle 240ms cubic-bezier(.2,.7,.3,1) 360ms forwards}
html[data-nd-splash="return"] .nd-splash-frame{animation-delay:${delayed(0)}}
html[data-nd-splash="return"] .nd-splash-block{animation-delay:${delayed(360)}}
@keyframes nd-splash-appear{to{opacity:1}}
@keyframes nd-splash-cap{to{opacity:0;visibility:hidden}}
@keyframes nd-splash-draw{99.9%{stroke-dasharray:100;stroke-dashoffset:0}100%{stroke-dasharray:none;stroke-dashoffset:0}}
@keyframes nd-splash-settle{0%{opacity:0;transform:scale(.7)}65%{opacity:1;transform:scale(1.06)}100%{opacity:1;transform:scale(1)}}
@media (prefers-reduced-motion:reduce){
#nd-splash,.nd-splash-name,.nd-splash-line{transition:none}
#nd-splash{animation-duration:0s}
.nd-splash-frame,.nd-splash-block{animation:none;stroke-dasharray:none;opacity:1;transform:none}
}
`.trim();
}

export interface SplashColors {
  canvas: string;
  ink: string;
  muted: string;
}

/** Reads the screen's colours and font stack out of tokens.css (light :root, then the dark block). */
export function splashTokens(tokensCss: string): { fontSans: string; light: SplashColors; dark: SplashColors } {
  const darkAt = tokensCss.indexOf(':root[data-theme="dark"]');
  const light = tokensCss.slice(0, darkAt);
  const dark = tokensCss.slice(darkAt);
  const pick = (css: string, name: string): string => {
    const m = new RegExp(`${name}:\\s*([^;]+);`).exec(css);
    if (!m) throw new Error(`tokens.css has no ${name}`);
    return m[1].trim();
  };
  const colours = (css: string): SplashColors => ({
    canvas: pick(css, "--nd-color-canvas"),
    ink: pick(css, "--nd-color-ink"),
    muted: pick(css, "--nd-color-muted"),
  });
  return { fontSans: pick(light, "--font-sans"), light: colours(light), dark: colours(dark) };
}
