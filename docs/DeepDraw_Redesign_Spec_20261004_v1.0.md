# Spec — Redesign: own identity, same behaviour

**Goal.** DeepDraw should stop looking like draw.io while behaving exactly as it does today. This is a change of *surface*, not of *capability*. Every feature, shortcut, setting and saved document must keep working.

**Reference mockup:** `docs/DeepDraw_FullRedesign_Mockup_20261004_v1.0.html`. Its change #5 (pages in the breadcrumb) is **dropped**: the page tab strip stays as it is.

Six work items below. Ship them **in the order listed**, each on its own branch and PR, one PR open at a time, fully verified (unit, E2E, lint, typecheck, build). Stop for review after each.

---

## Non-negotiable rules (apply to every item)

1. **No default value changes for widths or sizes.** The current default line width for lines, edges (links) and shape outlines stays exactly as it is today (lines 1pt per D88, current shape and edge defaults unchanged). Default shape sizes, font size, spacing, arrowhead size and grid size also stay the same. Item R6 changes colours and corner radius only, and only as specified there.
2. **Saved documents render identically.** Any `.deepdraw` file, autosave, share link or `.deepdraw.png` created before this work must open and look exactly as it did, on the canvas and in every export. Before R6, find out how unset style properties are resolved. If a node or edge without an explicit style falls back to runtime defaults, then changing those defaults would restyle old documents. Prevent that, either by writing explicit styles into older documents on load (a migration under `file/migrations/` with a `formatVersion` bump) or by another mechanism you justify. Add a regression test that opens a pre-change document and asserts identical render output.
3. **Templates do not change in this work.** All 38 templates keep their current appearance. Whether templates adopt the new default look is a separate decision for later.
4. **No feature loss.** Every command currently reachable from the top menus, the right-hand panel, the context menus and keyboard shortcuts must remain reachable after the change. Before R1 and R2, produce an inventory table (feature → old location → new location) and include it in the PR description. Nothing may be in the "old" column without an entry in the "new" column.
5. **Behaviour stays the same.** One edit is one undo step (D84). Cleared fields don't write 0. Group/Ungroup enablement, dash, shadow, no-fill, fill opacity, image controls, the line toolbar (D86), Nested Block settings (ports, collapsed-view override, Open child): all keep their current semantics.
6. **Existing tests keep passing.** Tests that click old UI (for example the File menu) are updated to the new location of the same action, never deleted. Render-parity (D72) and Office export tests must pass unchanged.
7. **Accessibility doesn't regress.** Everything new is keyboard-reachable, has visible focus, and has accessible names.

---

## R1 — Context bar replaces the right-hand panel

- Remove the permanent right-hand panel (Style / Text / Arrange tabs and the Diagram settings view). The canvas takes the freed width.
- On selection, show a dark floating **context bar** just above the selection (below it if there's no room above, always within the viewport). It follows the selection as it moves, pans and zooms.
- Bar content by selection type:
  - **Shape:** Fill, Line, Text, Arrange, More (•••). Each opens a popover holding the *same controls* the current panel has for that group.
  - **Nested Block:** adds **Open** as the first button, and a Nested Block popover with the current Nested section (ports, collapsed view, open child).
  - **Edge / line:** integrate the existing line toolbar (D86); don't duplicate it.
  - **Image:** the current image controls (Replace image, Original size).
  - **Multi-selection and groups:** the controls the current panel offers for those cases, applied to all selected items.
- **Diagram settings** (show grid, snap to grid, page size, background) move to a **canvas chip** in the bottom-left corner of the canvas, next to the existing zoom control. Grid and Snap are one-click toggles on the chip; page size and background open a small popover.
- Keyboard: a shortcut (propose one, check it doesn't clash) moves focus into the bar; Esc closes a popover, then clears the selection.
- The bar hides while dragging or resizing and reappears afterwards.

## R2 — Top bar: app menu, command palette, Export, Share

- Replace the File / Edit / View / Arrange / Extras / Help menu bar with:
  - **left:** an app menu button (product name from `BRAND`) containing New, Open, Save a copy, Recent, Preferences, Keyboard shortcuts, Take the tour, About; and a **command bar** button that opens a command palette
  - **centre:** the breadcrumb, unchanged in behaviour
  - **right:** an **Export** split button (main part repeats the last-used export format; the arrow lists every export format, plus Copy image with live link) and a primary **Share** button (the existing Share dialog)
- **Command palette:** opens with Ctrl+K (check for clashes with existing shortcuts first; if Ctrl+K is taken, propose an alternative and stop to ask). It lists every command from the R1/R2 inventory, filters as you type, runs with Enter, and also searches shape and Nested Block names across all levels and jumps to them.
- Every keyboard shortcut that works today keeps working.
- **Update dependent onboarding.** Tour step 3 (D63) and the PNG-export tip (D64) reference `File ▸ …`. Retarget the spotlight and rewrite the copy for the new locations (Share / Export). Help ▸ quick tour (D84) moves into the app menu.

## R3 — ＋ handles replace the four hover arrows

- On hover, show a single **＋** just outside the middle of each side of a shape, instead of the four directional arrows.
- **Click ＋:** create a connected copy of the shape on that side (same shape type and size, current default style), connected by an edge using the current default edge style, and select it with its label in edit mode. Respect snap.
- **Drag ＋:** connect to an existing shape, exactly as dragging from the current arrows does today.
- Everything else about connecting must behave as now: perimeter connection points, Nested Block ports and boundary-crossing behaviour, free line ends (D86), connection snapping.

## R4 — Shape library organised by purpose

- **Search first**, then a **Recently used** row (last 8 shapes placed, stored under `BRAND.storagePrefix`), then sections.
- Rename and regroup the visible section *labels* by purpose (for example Flow, Cloud, Data, People, Lines). Propose the full mapping of current sections to new groups in the PR before implementing, so nothing is lost.
- **Internal section and stencil ids do not change.** Favorites, saved open/closed section state, enabled-section preferences, template stencil references and the stencil-coverage test must all keep working. Migrate any persisted state keyed by label.
- Replace "More Shapes…" with "Browse all libraries", which does what More Shapes does today.
- General-open-on-first-visit (D87) carries over to whichever new group holds those shapes.

## R5 — Silent restore

- When autosaved work exists on load, restore it automatically instead of showing the Restore / Discard prompt. Show a small note: `Restored your last diagram` with a **Start new** button; it fades after a few seconds.
- **Start new must never destroy the restored work silently.** Keep the previous document recoverable (for example under Recent in the app menu, or confirm first if it was never exported). Say which approach you chose and why.
- If the autosave fails validation, keep today's behaviour of surfacing the problem; never silently drop it.
- Unchanged: the first-visit sample and tour when no autosave exists, and viewer mode never touching autosave.

## R6 — DeepDraw's own default look (do last)

- Change, **for newly created shapes and edges only**: default shape fill to a faint cool tint, default outline and edge colour to a softer slate, default shape corner radius slightly larger, and the arrowhead style to an open chevron. Propose exact values in the PR, matching the mockup's direction.
- **Not changed:** any width (outline, edge, line), any size, font size, label colour contrast rules (D78), templates, and every existing document (rule 2).
- Dark mode, exports, Office exports and the render-parity test must all reflect the new defaults identically.
- Show me before/after screenshots of a new diagram in light and dark mode in the PR.

---

## Documentation

- Update CLAUDE.md: the layout is **no longer** draw.io parity. Behaviour and keyboard parity remain the reference; visual layout and default styling are DeepDraw's own. Remove any instruction that says to match draw.io's four-region layout or format panel.
- Log one decision per item in CLAUDE_HISTORY.md, and in the first one record that this supersedes the draw.io layout-parity principle from the original CLAUDE.md.
- Add R1–R6 to PROGRESS.md as a new "Redesign" group before starting R1.
