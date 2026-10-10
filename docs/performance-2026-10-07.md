# Pan and zoom with 500 nodes — 2026-10-07 (Q4, CLAUDE_HISTORY.md D114)

CLAUDE.md's guardrail: 60fps pan/zoom with 500 nodes on one canvas. Measured on the production
build (`vite preview`), version 0.1.0, after the context bar, style presets, live miniatures,
default shadows and the startup screen arrived. Re-run with `npm run perf` (see
`scripts/perf-pan.mjs` for setup).

**Diagram:** 504 nodes — labelled rectangles, rounded rectangles, ellipses, diamonds, cylinders,
the AWS Lambda and Azure VM icons, and 21 Nested Blocks whose levels hold six shapes each — and
481 curved edges with arrowheads; 502 KB as a file. 1440×900 window.

## Results (a visible Chromium window, `HEADED=1`)

| Case | Gesture | Nodes mounted | fps | Median frame | p95 | Worst |
|---|---|---|---|---|---|---|
| Everything on screen (fit, 22%) | pan | 504 | 13 | 80 ms | 130 ms | 189 ms |
| Everything on screen (fit, 22%) | zoom | 504 | 35 | 18 ms | 95 ms | 128 ms |
| Part on screen (150%) | pan | 25 | 57 | 16 ms | 21 ms | 341 ms |
| Part on screen (150%) | zoom | 25 | 59 | 16 ms | 23 ms | 64 ms |

Restoring the diagram puts its first node on screen in about 0.8 s.

**The everyday case meets the target:** at a working zoom, React Flow's viewport culling
(`onlyRenderVisibleElements`) keeps ~25–40 nodes mounted and pan and zoom hold ~60 fps. One long
frame (~340 ms) appears as a burst of nodes mounts at the edge of the view.

**The worst case does not:** with all 500 on screen, panning runs at ~13 fps.

## What the cost is

- Chrome's own metrics for one pan: 6.4 s of main-thread work, of which script 1.2 s, layout
  0.3 s, style 0.2 s — **the rest is painting**. A pan should only move an already-painted layer,
  but the page changes during it, so the browser repaints.
- What changes, counted with a `MutationObserver` during one pan: **~2,400 node and edge mounts
  and unmounts** as culling adds and removes elements crossing the edge of the view; the dot
  grid's pattern offset every frame; and ~150 connection-handle hover classes toggling as the
  pointer sweeps across shapes during a space-drag.
- Per node the DOM is light (~20 elements, 8 handles); it is volume — ~10,000 elements and 481
  marker-tipped curves — not bloat.

## Experiments (all on the "everything on screen" pan)

| Change | fps | Kept? |
|---|---|---|
| none (baseline) | 12–13 | — |
| `will-change: transform` on the viewport | 18 | no: small gain, and it rasterises the whole diagram as one huge layer |
| no shadows or filters on nodes | 25 | no: the default look (R6) is the user's choice; the gain is modest |
| culling off (`onlyRenderVisibleElements={false}`) | 11 pan / 13 zoom, and the 150% case drops to 38 / 20 | no: worse everywhere |

## Proposal (needs a decision)

**P1 — Level of detail when zoomed far out.** Below roughly 35% zoom, where labels are
unreadable anyway, draw each node as its outline and fill only — no label text, handles or
shadow — and skip arrowheads, switching back as soon as the zoom rises. It is the standard
remedy (map and CAD tools all do it) and targets exactly where the time goes. draw.io does not do
it, and it changes how a zoomed-out diagram looks, so it is the user's call. Smaller, safe items
that could ride along: no hover styling on nodes while a pan gesture is running.

## Update — P1 shipped (D115)

Level of detail below 35% zoom, measured the same way in the same session, both builds:

| All 504 on screen | Without P1 | With P1 |
|---|---|---|
| Pan | 15 fps (median frame 73 ms) | **82 fps** (median 6 ms) |
| Zoom | 60 fps | **79 fps** |

The 150% case is unchanged (it is above the threshold). This session's display refreshed faster
than the first one's, so these numbers are higher across the board than the table above; compare
within a table, not across.
