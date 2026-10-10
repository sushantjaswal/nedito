// The startup screen (N3, D102): which screen a load gets, what the page carries, and when the
// screen leaves.
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { brandSplash } from "../../vite.brand";
import { dismissSplash, resetSplashForTests, splashCanvasReady, startSplash } from "./splash";
import {
  decideSplash,
  FIRST_CAP_MS,
  FIRST_HOLD_MS,
  RETURN_APPEAR_MS,
  RETURN_CAP_MS,
  SPLASH_INPUTS,
  SPLASH_SEEN_KEY,
  splashScript,
} from "./splashPage";

const storeOf = (items: Record<string, string>) => (k: string) => (k in items ? items[k] : null);

describe("which screen a load gets", () => {
  it("a share link never gets one, whatever is stored", () => {
    expect(decideSplash("#d=abc&v=5", storeOf({}), SPLASH_INPUTS).mode).toBe("off");
    expect(decideSplash("d=abc", storeOf({ [SPLASH_SEEN_KEY]: "x" }), SPLASH_INPUTS).mode).toBe("off");
  });

  it("nothing stored is a first visit; the seen flag, under the nedito: prefix, makes it a return", () => {
    expect(SPLASH_SEEN_KEY).toBe("nedito:splashSeen");
    expect(decideSplash("", storeOf({}), SPLASH_INPUTS).mode).toBe("first");
    expect(decideSplash("", storeOf({ [SPLASH_SEEN_KEY]: "x" }), SPLASH_INPUTS).mode).toBe("return");
  });

  it("a stored diagram is never held for, under either name — not even before the rename's migration", () => {
    expect(decideSplash("", storeOf({ "nedito:autosave": "{}" }), SPLASH_INPUTS).mode).toBe("return");
    expect(decideSplash("", storeOf({ "deepdraw:autosave": "{}" }), SPLASH_INPUTS).mode).toBe("return");
  });

  it("takes the stored theme, and storage that cannot be read counts as a return", () => {
    expect(decideSplash("", storeOf({ "nedito:theme": "dark" }), SPLASH_INPUTS).theme).toBe("dark");
    expect(decideSplash("", storeOf({ "deepdraw:theme": "dark" }), SPLASH_INPUTS).theme).toBe("dark");
    const blocked = () => {
      throw new Error("SecurityError");
    };
    expect(decideSplash("", blocked, SPLASH_INPUTS)).toEqual({ mode: "return", theme: "light" });
  });

  it("the head script is self-contained and sets the decision on <html>", () => {
    localStorage.clear();
    localStorage.setItem("nedito:theme", "dark");
    new Function(splashScript())();
    expect(document.documentElement.getAttribute("data-nd-splash")).toBe("first");
    expect(document.documentElement.getAttribute("data-nd-splash-theme")).toBe("dark");
    localStorage.clear();
  });
});

describe("the page", () => {
  const { head, body } = brandSplash();

  it("draws the app icon file itself, marked up to animate — never a redrawing", () => {
    const icon = readFileSync("public/icons/app-icon.svg", "utf8");
    for (const geometry of ['x="8" y="8" width="48" height="48" rx="13"', 'x="29" y="29" width="19" height="19" rx="5"', 'fill="#6D5AE6"']) {
      expect(icon).toContain(geometry);
      expect(body).toContain(geometry);
    }
    expect(body).toContain('class="nd-splash-frame" pathLength="100"');
    expect(body).toContain('class="nd-splash-block"');
    expect(body).not.toContain("<metadata>");
  });

  it("shows the name from BRAND and the line, and stays out of assistive tech and the pointer's way", () => {
    expect(body).toContain('<div class="nd-splash-name">Nedito</div>');
    expect(body).toContain('<div class="nd-splash-line">Nested Diagram Tool</div>');
    expect(body).toMatch(/^<div id="nd-splash" aria-hidden="true">/);
    expect(head).toMatch(/#nd-splash\{[^}]*pointer-events:none/);
  });

  it("is fixed in place from the first paint: fixed sizes for the icon and both lines", () => {
    expect(head).toMatch(/\.nd-splash-icon\{[^}]*width:96px;height:96px/);
    expect(head).toMatch(/\.nd-splash-name\{[^}]*height:36px/);
    expect(head).toMatch(/\.nd-splash-line\{[^}]*height:20px/);
  });

  it("takes its colours and font from the tokens, and drops the motion under reduced motion", () => {
    const tokens = readFileSync("src/styles/tokens.css", "utf8");
    expect(tokens).toContain("--nd-color-canvas: #f6f7f9");
    expect(head).toContain("background:#f6f7f9");
    const fontSans = /--font-sans:\s*([^;]+);/.exec(tokens)![1];
    expect(head).toContain(`--font-sans:${fontSans};font-family:var(--font-sans)`);
    expect(head).toMatch(/@media \(prefers-reduced-motion:reduce\)\{[^@]*\.nd-splash-frame,\.nd-splash-block\{animation:none/);
  });

  it("hides itself on a share link before it can paint", () => {
    expect(head).toContain('html[data-nd-splash="off"] #nd-splash{display:none}');
  });
});

describe("when it leaves", () => {
  let clock = 0;

  const mount = (mode: string) => {
    document.documentElement.setAttribute("data-nd-splash", mode);
    document.body.innerHTML = '<div id="nd-splash"></div>';
  };
  const present = () => document.getElementById("nd-splash") !== null;
  // A millisecond at a time, so a timer firing mid-way reads the time it fired at.
  const advanceTo = (ms: number) => {
    while (clock < ms) {
      clock += 1;
      vi.advanceTimersByTime(1);
    }
  };

  beforeEach(() => {
    vi.useFakeTimers();
    clock = 0;
    vi.spyOn(performance, "now").mockImplementation(() => clock);
    localStorage.clear();
    // The head-script test above leaves its real timestamp on <html>.
    document.documentElement.removeAttribute("data-nd-splash-at");
    resetSplashForTests();
  });
  afterEach(() => {
    resetSplashForTests();
    vi.useRealTimers();
    vi.restoreAllMocks();
    document.body.innerHTML = "";
  });

  it("a later visit goes the moment the canvas is ready — without a fade if it was never drawn", () => {
    mount("return");
    startSplash();
    advanceTo(RETURN_APPEAR_MS - 50);
    splashCanvasReady();
    expect(present()).toBe(false);
  });

  it("a later visit that was drawn fades out once ready", () => {
    mount("return");
    startSplash();
    advanceTo(400);
    splashCanvasReady();
    expect(document.getElementById("nd-splash")!.classList.contains("nd-splash-out")).toBe(true);
    advanceTo(1000);
    expect(present()).toBe(false);
  });

  it("a later visit never stays past the cap, ready or not", () => {
    mount("return");
    startSplash();
    advanceTo(RETURN_CAP_MS);
    expect(document.getElementById("nd-splash")?.classList.contains("nd-splash-out")).toBe(true);
    expect(localStorage.getItem(SPLASH_SEEN_KEY)).toBeNull();
  });

  it("a first visit holds until the name has registered, even with the canvas ready, then records it", () => {
    mount("first");
    startSplash();
    advanceTo(300);
    splashCanvasReady();
    advanceTo(FIRST_HOLD_MS - 10);
    expect(document.getElementById("nd-splash")!.classList.contains("nd-splash-out")).toBe(false);
    advanceTo(FIRST_HOLD_MS);
    expect(document.getElementById("nd-splash")!.classList.contains("nd-splash-out")).toBe(true);
    expect(localStorage.getItem(SPLASH_SEEN_KEY)).not.toBeNull();
  });

  it("a first visit waits for a slow canvas, but never past its cap", () => {
    mount("first");
    startSplash();
    advanceTo(FIRST_HOLD_MS + 100);
    expect(document.getElementById("nd-splash")!.classList.contains("nd-splash-out")).toBe(false);
    advanceTo(FIRST_CAP_MS);
    expect(document.getElementById("nd-splash")!.classList.contains("nd-splash-out")).toBe(true);
  });

  it("a key or a click ends a first visit's hold at once", () => {
    mount("first");
    startSplash();
    advanceTo(500);
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "a" }));
    expect(document.getElementById("nd-splash")!.classList.contains("nd-splash-out")).toBe(true);
  });

  it("counts from when the screen went up, not from navigation start", () => {
    document.documentElement.setAttribute("data-nd-splash-at", "700");
    mount("return");
    advanceTo(700);
    startSplash();
    advanceTo(700 + RETURN_CAP_MS - 10);
    expect(document.getElementById("nd-splash")!.classList.contains("nd-splash-out")).toBe(false);
    advanceTo(700 + RETURN_CAP_MS);
    expect(document.getElementById("nd-splash")!.classList.contains("nd-splash-out")).toBe(true);
    document.documentElement.removeAttribute("data-nd-splash-at");
  });

  it("off: removed at start; and once gone it never comes back", () => {
    mount("off");
    startSplash();
    expect(present()).toBe(false);
    document.body.innerHTML = '<div id="nd-splash"></div>';
    splashCanvasReady();
    dismissSplash();
    startSplash();
    expect(present()).toBe(true); // nothing touches a screen this load has already finished with
    expect(document.getElementById("nd-splash")!.classList.contains("nd-splash-out")).toBe(false);
  });
});

describe("the caps without the script (D107)", () => {
  it("the page itself fades the screen out at each cap, so a slow bundle cannot hold it", () => {
    const { head } = brandSplash();
    expect(head).toContain(`html[data-nd-splash="return"] #nd-splash{animation:nd-splash-cap 200ms ${RETURN_CAP_MS}ms forwards}`);
    expect(head).toContain(`html[data-nd-splash="first"] #nd-splash{animation:nd-splash-cap 200ms ${FIRST_CAP_MS}ms forwards}`);
    expect(head).toContain("@keyframes nd-splash-cap{to{opacity:0;visibility:hidden}}");
  });
});
