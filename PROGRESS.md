# PROGRESS.md — Nedito Work Queue

Rules for maintaining this file (Claude Code, read carefully):
- This is the single source of truth for what to build next. Work strictly top to bottom within the current milestone unless an item is marked `[blocked]`.
- Statuses: `[ ]` todo · `[~]` in progress · `[x]` done · `[blocked: reason]`.
- One work item = one or few small commits. When an item is done: mark `[x]`, add a one-line completion note with date + commit ref, and move that line to `CLAUDE_HISTORY.md` at the next milestone boundary (keep this file short).
- Never start a new milestone until every item in the previous one is `[x]` and its exit test passes.
- New ideas or discovered work go to the **Inbox** at the bottom, never inserted mid-milestone without the user's approval.
- New dependencies must be listed under the item that introduced them, with a one-line reason.

---

## Current state — 2026-10-08

- **Version** `0.1.0` (`package.json`); **file format version** `6` (`CURRENT_FORMAT_VERSION` in `src/file/documentFormat.ts`, schema in `docs/FORMAT.md`). The Decision Log in `CLAUDE_HISTORY.md` runs to D153.
- **Shipped:** the Phase 1 editor (M0–M5); Phase 2's draw.io parity items (layers, outline, find and replace, PDF and print, dark mode, style presets, draw.io import); Phase 3, portable diagrams (share links and the read-only viewer, copy image with live link, PowerPoint and Word export); Phase 4's live-link tutorial; Phase 5's templates (38 in the catalogue); the redesign (R1–R6); the rename to Nedito; diagram motion and the three presentation modes (A1–A6); 18 animated icons in their own library section (I1–I5); the animated GIF export (G1–G5); the six draw.io import fixes from the audit (X1–X6); the nesting deletion prompts (N7).
- **Tests** at this state: 1,459 unit tests in 140 files, 265 end-to-end tests in 33 files.
- **History:** every completed item, with its completion note and decision, is in `CLAUDE_HISTORY.md` under "Completed work" (moved there on 2026-10-08).
- **Archived specs:** `portable-diagrams-spec.md` and `onboarding-spec.md`, both fully delivered, moved from the repository root to `docs/archive/` on 2026-10-08; the decisions are the authority on what shipped (`docs/archive/README.md`).

## Open items

None.

## Queue

Empty.

## Inbox (ideas / discovered work — needs user approval to schedule)

- **`elkjs` is a dependency nothing uses.** Found by the documentation cleanup (D144). CLAUDE.md's fixed tech stack names it for optional auto-layout, but no auto-layout has shipped. Either build auto-layout or remove the dependency. Not a security risk: `npm audit` reports no advisory for it (checked in D149).
