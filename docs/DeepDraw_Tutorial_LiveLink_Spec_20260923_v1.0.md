# Spec — Tutorial addendum: showcase live-linked images and Office export

**Goal.** The tour currently teaches drill-in and drill-out. It should also show the second thing no competitor does: a diagram pasted into Word or PowerPoint stays clickable and reopens fully drillable. Teach it twice, once in the tour and once at the moment a user is about to do the inferior thing.

Two items plus one follow-up, each on its own branch and PR, one PR open at a time, per the project's workflow. UI-layer only: no model or `formatVersion` change. Copy rule from the onboarding spec applies: never claim data is "secure", "encrypted" or "private by design"; the accurate claim is that nothing is uploaded.

---

## Item L1 — Tour step 3: "Take it anywhere"

Extends the existing two-step coach-mark tour (D48) to three steps.

**Trigger:** immediately after step 2 completes (user drills back out to the main level). Step counters become `1 of 3`, `2 of 3`, `3 of 3`.

**Target:** the **File** menu trigger in the top bar. Do not open the menu programmatically; spotlighting a closed trigger and naming the command is more robust than driving a dropdown during a tour.

**Content:**
- Heading: `Take it anywhere, still clickable`
- Body: `File ▸ Copy image with live link puts this diagram on your clipboard. Paste it into **Word** or **PowerPoint**, and clicking the picture reopens it here, fully drillable.`
- Buttons: `Skip` (ghost), `Copy it now` (primary).

**`Copy it now`:** runs the existing Copy image with live link action on the sample diagram (the button click is the user gesture the Clipboard API requires). On success the card body changes to `Copied. Open Word or PowerPoint and paste to try it.` with a single `Done` button that finishes the tour. On clipboard denial, fall back to the existing `Notice` surface with the URL and a Copy button (same path as D56), then finish the tour.

**Completion toast:** unchanged text and behaviour, shown after step 3.

**Returning users.** Introduce `{prefix}tourVersion` (integer, current = 2). A user whose stored `tourDone` predates version 2 sees **only step 3**, once, as a standalone coach mark prefixed `New:` in the heading, the next time they return to the main level with at least one node on the page. Then record version 2. Users who never completed the tour are unaffected.

**Constraints:** all existing tour rules hold. Skip always reachable, Esc dismisses the whole tour, spotlight recomputed on resize and scroll, abort silently if the target isn't found, never shown in viewer mode.

**Acceptance:** E2E covering the full three-step tour including `Copy it now`; unit test that the clipboard write carries both `image/png` and `text/html`; a returning v1 user sees step 3 exactly once; skipping at step 3 still marks the tour done.

---

## Item L2 — Moment-of-need tip on PNG export

**Trigger:** the first time a user runs `File ▸ Export as PNG` (and only PNG, not the editable `.deepdraw.png`).

**Behaviour:** let the PNG export proceed normally, then show a one-time tip on the existing `Notice` surface:

> **Tip:** `File ▸ Copy image with live link` gives you the same picture, but it stays clickable in Word and PowerPoint.

With a `Try it` button that runs Copy image with live link on the current diagram. Store `{prefix}liveLinkTipShown = true` after showing, so it appears once ever. Never shown in viewer mode or while the tour is running.

**Acceptance:** tip appears on first PNG export only; `Try it` performs the copy; not shown on the second export or after a reload.

---

## Item L3 — Follow-up, gated on Phase 3.4 and 3.5

Not buildable yet. Record in the work queue as a dependent item to pick up **immediately after** each export ships:

- **After 3.4 (PowerPoint Slide Zoom) merges:** extend the step 3 body with `Or use File ▸ Export as PowerPoint for slides that zoom into each Nested Block.` Add a second secondary button `Show me` that highlights the menu item. Extend the L2 tip to mention the PowerPoint export when the user exports PNG while the document contains a Nested Block.
- **After 3.5 (Word export) merges:** add the equivalent line for `Export as Word`. Keep step 3 to one card; if the copy grows past three short sentences, move the export options into a small "More ways to share" link rather than lengthening the card.

---

## Sequencing

L1 and L2 depend only on Phase 3.2, which has shipped, so they can run now. Suggested order: L1, then L2. L3 attaches to 3.4 and 3.5 whenever those land.
