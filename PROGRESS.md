# PROGRESS.md — Nedito Work Queue

Rules for maintaining this file (Claude Code, read carefully):
- This is the single source of truth for what to build next. Work strictly top to bottom within the current milestone unless an item is marked `[blocked]`.
- Statuses: `[ ]` todo · `[~]` in progress · `[x]` done · `[blocked: reason]`.
- One work item = one or few small commits. When an item is done: mark `[x]`, add a one-line completion note with date + commit ref, and move that line to `CLAUDE_HISTORY.md` at the next milestone boundary (keep this file short).
- Never start a new milestone until every item in the previous one is `[x]` and its exit test passes.
- New ideas or discovered work go to the **Inbox** at the bottom, never inserted mid-milestone without the user's approval.
- New dependencies must be listed under the item that introduced them, with a one-line reason.

---

## Current state — 2026-10-10

- **Version** `0.1.0` (`package.json`); **file format version** `6` (`CURRENT_FORMAT_VERSION` in `src/file/documentFormat.ts`, schema in `docs/FORMAT.md`). The Decision Log in `CLAUDE_HISTORY.md` runs to D154.
- **Shipped:** the Phase 1 editor (M0–M5); Phase 2's draw.io parity items (layers, outline, find and replace, PDF and print, dark mode, style presets, draw.io import); Phase 3, portable diagrams (share links and the read-only viewer, copy image with live link, PowerPoint and Word export); Phase 4's live-link tutorial; Phase 5's templates (38 in the catalogue); the redesign (R1–R6); the rename to Nedito; diagram motion and the three presentation modes (A1–A6); 18 animated icons in their own library section (I1–I5); the animated GIF export (G1–G5); the six draw.io import fixes from the audit (X1–X6); the nesting deletion prompts (N7). Since 2026-10-08: the dark-mode search box fix (D153).
- **Repository:** public, open source (Apache 2.0), moved to a fresh repository on 2026-10-10 with its earlier history kept in a private one (D145) — the Decision Log's commit and PR references before D145 point there. `main` is protected: changes arrive only by pull request, up to date with `main` and green in CI (D146, D149). Dependabot raises security updates and a weekly grouped version update; Vitest is on 4.1 and `npm audit` is clean (D147). Community files: `README.md` as a front page with pictures from the app (D152), `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `SECURITY.md`, issue forms and a pull-request template (D154); the social preview is `docs/social-preview/` (D150).
- **CI:** lint, types, unit tests and build on Windows, and the end-to-end suite split across four machines balanced by measured time (`scripts/e2e-shard.mjs`), about 5 minutes a run (D149, D151). Locally, before a pull request: the fast checks plus the end-to-end specs for the area touched.
- **Deploy:** every merge to `main` deploys to nedito.app through the Cloudflare Worker `nedito` (D148).
- **Tests** at this state: 1,464 unit tests in 141 files, 265 end-to-end tests in 33 files.
- **History:** every completed item, with its completion note and decision, is in `CLAUDE_HISTORY.md` under "Completed work" (moved there on 2026-10-08).
- **Archived specs:** `portable-diagrams-spec.md` and `onboarding-spec.md`, both fully delivered, moved from the repository root to `docs/archive/` on 2026-10-08; the decisions are the authority on what shipped (`docs/archive/README.md`).

## Open items

None.

## Queue

Empty.

## Inbox (ideas / discovered work — needs user approval to schedule)

- **`elkjs` is a dependency nothing uses.** Found by the documentation cleanup (D144). CLAUDE.md's fixed tech stack names it for optional auto-layout, but no auto-layout has shipped. Either build auto-layout or remove the dependency. Not a security risk: `npm audit` reports no advisory for it (checked in D149).
