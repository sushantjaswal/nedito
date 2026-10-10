# Spec — First-visit onboarding & local-only disclosure

Scope: four independent work items. Ship them **in the order below**, each on its own branch, each as its own PR, one PR open at a time (per CLAUDE.md's branch + PR workflow). Add each to PROGRESS.md's Phase 2 pipeline before starting, and log a decision entry in CLAUDE_HISTORY.md when merged.

All user-facing strings must read the product name from `BRAND` in `src/app/brand.ts`. No hardcoded product name anywhere. CSS classes and test ids use the `dd-` prefix. All new localStorage keys use `BRAND.storagePrefix`.

Accuracy rule for all copy in this spec: never claim the user's data is "secure", "encrypted", or "private by design". The accurate claim is that **nothing is uploaded**. Browser storage is neither secure nor permanent, and the wording must not imply otherwise.

---

## Item 1 — Status-bar "Local only" badge + policy popover

The permanent, always-available disclosure. This replaces any first-run consent modal; do not build a blocking modal.

**Placement:** left end of the existing status bar, before the zoom/shape-count text.

**Badge:** pill, green (`--ok-soft` background, `--ok-line` border, `#146B44` text), lock glyph, label `Local only · nothing uploaded`. Cursor pointer.

**Popover:** opens on click, anchored above the badge, ~310px wide, closes on outside click or Esc. Content:

> **Your data never leaves this device**
> {BRAND.name} runs entirely in your browser. There is no account, no server, and no copy of your diagram anywhere but here.
> - Clearing browser data will erase your work
> - Download the {BRAND.fileExt} file to keep a real copy
> - On a shared computer, export and clear when you're done

Include a "Download a copy now" button in the popover wired to the existing save/export action.

**Acceptance:** badge visible on every route and at every nesting depth; popover keyboard-accessible (focusable badge, Esc closes, focus returns to badge); unit test asserting the popover text contains no forbidden words ("secure", "encrypted", "private").

---

## Item 2 — Demo diagram on first visit

**Trigger:** on app load, if there is no autosaved document under `BRAND.storagePrefix` AND the key `{prefix}demoDismissed` is absent, load a bundled sample document instead of an empty canvas.

**The sample:** a real `.deepdraw` document committed at `src/onboarding/demo-diagram.ts` (or a `.deepdraw` file imported as JSON). Contents:

- Main page: `API Gateway` (shape) → `Payment Service` (**nested node**, collapsed icons + summary "cards · fraud · ledger"), with edges out to `Notifications` and `Orders DB`.
- Child of Payment Service: `Payment API`, `Ledger DB`, and a second **nested node** `Fraud Engine` (summary "rules · ML score"). The parent edge from API Gateway must be mapped through a port to `Payment API`, so the ghost link renders on the child canvas.
- Child of Fraud Engine: 3–4 shapes, enough to prove depth 2 is real.

Build this by constructing it through the normal model actions or by authoring the document JSON directly — whichever validates against the existing model invariants. It must pass the same validation as any user document.

**Sample strip:** thin bar between the top bar and the canvas, violet-tinted (`#FBFAFF` bg, `#E5E1F7` border). Text: `👋 This is a sample diagram so you can see how {BRAND.name} works.` Right-aligned button: `Start a blank canvas`.

**"Start a blank canvas":** clears the document to empty, hides the strip, dismisses any active coach marks, and sets `{prefix}demoDismissed = true`.

**Also set `demoDismissed`** the first time the user edits the sample in any way (any command-pattern action firing), so the sample never reappears once they've touched it.

**Acceptance:** returning users with saved work never see the sample; the sample loads and validates; drilling into both nesting levels works; unit test that the demo document passes model validation.

---

## Item 3 — Coach marks (two steps)

A small reusable component: dimmed overlay with a cut-out spotlight around a target element, plus a tooltip card anchored to it.

**Trigger:** ~700ms after the demo diagram loads, only when the demo is showing and `{prefix}tourDone` is absent.

**Step 1** — target: the `Payment Service` nested node on the canvas.
- Contains a **looping SVG animation** (~3.4s, infinite) of a nested box scaling up to reveal two child shapes and an edge, then collapsing. This matters: a user who dismisses everything still sees the concept.
- Heading: `This box holds a whole diagram`
- Body: `The stacked violet edges mean there's more inside. **Double-click it** to zoom in.`
- Buttons: `Skip` (ghost), `Show me` (primary). `Show me` performs the drill-in. Double-clicking the actual node also advances the step.

**Step 2** — target: the breadcrumb trail in the top bar (highlight it).
- Heading: `The trail shows where you are`
- Body: `You're one level deeper, on this box's own canvas. **Click "Main"** to come back out — or press **Esc**.`
- Buttons: `Skip`, `Got it` (performs drill-out). Clicking the breadcrumb or pressing Esc also advances.

**On completion or skip:** set `{prefix}tourDone = true`, remove the overlay. On completion only, show a brief (~5s) auto-dismissing confirmation: `That's the whole idea — diagrams inside diagrams.` with a `Start my own` button that runs the same clear as "Start a blank canvas".

**Constraints:** the overlay must never block canvas interaction outside the spotlight in a way that traps the user — Skip is always reachable, Esc always dismisses the whole tour. Recompute the spotlight position on window resize and on scroll. If a target element can't be found, abort the tour silently rather than showing a floating tooltip.

**Acceptance:** tour runs once and never again; skipping at either step leaves a working app with the sample intact; E2E test covering complete-the-tour and skip-at-step-1.

---

## Item 4 — Export reminder toast

The item that actually prevents data loss.

**Trigger:** count mutating actions since the last successful export. When the count reaches **15** and no export has happened in this session, show a toast. Re-arm after another 40 actions if dismissed, once per session maximum after the first.

Do not show it while the demo diagram is untouched, during the coach-mark tour, or within 60s of a successful export.

**Toast:** bottom-right, white card with a violet left border, dismissible ✕.
- Title: `Save a copy while you're ahead`
- Body: `You've made {n} changes. Your work lives only in this browser — download the {BRAND.fileExt} file to keep it safe.`
- Buttons: `Download {BRAND.fileExt}` (primary, runs the existing save action), `Later` (dismiss).

**Acceptance:** unit tests on the counter and re-arm logic; toast never appears twice without the intervening action threshold; downloading resets the counter.

---

## Cross-cutting

- New store slice `ui.onboarding` holding `{ demoActive, demoDismissed, tourStep, actionsSinceExport }`. Persist only the booleans and the counter, not transient tooltip state.
- Everything here is UI-layer; **no changes to the document model or `formatVersion`**.
- Verify each item with unit + E2E + lint + typecheck + build before opening its PR.
- Do not bundle these four into one PR.
