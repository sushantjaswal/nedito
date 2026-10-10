# Nedito

Nedito (Nested Diagram Tool) is a diagramming app that runs in the browser, with the editing a
draw.io user expects: shapes, lines, pages, layers, templates and a large shape library, including
the official Azure, AWS and Google Cloud icons. It is served at [nedito.app](https://nedito.app).

What sets it apart is nesting. Any box can hold a whole diagram of its own: in the parent it shows a
live miniature of what is inside it, and opening it zooms into that diagram as a full canvas, with a
breadcrumb to climb back out — as many levels deep as the subject needs.

The name, file extension and host are defined once, in [`src/app/brand.ts`](src/app/brand.ts).

## Where your work lives

Nothing is uploaded. There is no account and no server holding your diagrams: the page is served as
static files, and the diagram you are working on is kept in this browser's local storage, saved as
you go. A share link carries the diagram inside the part of the URL after `#`, which browsers do not
send to the server.

The flip side is that nobody else has a copy. Clearing this browser's data, or switching browser or
machine, leaves your work behind, and it cannot be recovered for you. Download your file (app menu ›
Save a copy, or Export) to keep it, and to move or share it.

## Running it

Commands work in PowerShell as written (the project is developed on Windows). You need Node.js and
npm.

```powershell
npm install
npm run dev          # the app, with hot reload
```

| Task | Command |
|---|---|
| Unit tests (Vitest) | `npm run test` (or `npm run test:watch`) |
| End-to-end tests (Playwright) | `npm run test:e2e` — the first time, install the browser with `npx playwright install chromium` |
| Lint (ESLint) | `npm run lint` |
| Type check | `npx tsc -b` |
| Production build | `npm run build`, then `npm run preview` to serve `dist/` |
| Format (Prettier) | `npm run format` |
| Regenerate the PNG app icons from their SVG | `npm run icons` |
| Measure pan and zoom frame times | `npm run perf` (see the header of `scripts/perf-pan.mjs`) |
| Run one balanced part of the end-to-end suite, as CI does | `node scripts/e2e-shard.mjs <part> 4` (`--plan 4` shows the split) |
| Regenerate the repository's social preview image | `npm run social-preview`, with `npm run dev` running (see `docs/social-preview/`) |

`wrangler.jsonc` serves the built `dist/` from a Cloudflare Worker.

## Repository layout

```
src/
  app/            the shell: top bar, app menu, command palette, dialogs, brand, breadcrumbs
  canvas/         React Flow setup, custom shapes and lines, interactions, motion and presentation
  context-bar/    the floating bar over a selection, and its popovers
  format-panel/   the formatting controls those popovers and the Page popover show
  nesting/        Nested Blocks: ports, ghost links, navigation, trace, convert to nested
  library/        the shape library sidebar, its lazily loaded stencil sections, search
  model/          document types, validation, the store and its actions, undo
  file/           the .nedito format and migrations, PNG/SVG/PDF/GIF export, autosave, draw.io import
  export/         PowerPoint and Word export
  share/          share links, the read-only viewer, copy image with live link
  onboarding/     the first visit, the tour, the export reminder
  templates/      the template catalogue
  styles/         design tokens, global styles, motion
tests/e2e/        Playwright tests; unit tests sit next to the code they test
docs/             the file format, specs and audits; docs/archive/ for delivered specs
examples/         worked example documents, rebuilt and checked by tests
scripts/          icon generation and the performance measurement
public/           the app icons (the typeface comes from npm, @fontsource)
```

## The file format

A Nedito document is a single readable JSON file with the `.nedito` extension. Its first two keys
say what it is — `"format": "nedito"` and `"formatVersion"` — and its keys are written in a stable
order, so documents diff cleanly in Git. Nesting is by reference: a document is a flat map of
diagrams, and a Nested Block names the diagram it holds. The schema, version by version, is in
[`docs/FORMAT.md`](docs/FORMAT.md).

The current format version is `CURRENT_FORMAT_VERSION` in
[`src/file/documentFormat.ts`](src/file/documentFormat.ts). A file is written at the lowest version
that can hold what it uses, and every older version still opens, migrated on load
(`src/file/migrations/`). Files from before the rename — the `.deepdraw` extension and its editable
`.deepdraw.png` images — still open too (`LEGACY_BRANDS` in `src/app/brand.ts`).

## Exports

From the Export menu:

- **PNG**, and an **editable PNG** (`.nedito.png`) that carries the whole document inside the image,
  so the picture opens again as the diagram;
- **SVG**, with the typeface embedded;
- **PDF**, and **Print**;
- **PowerPoint** (`.pptx`): one slide per diagram, each Nested Block a Slide Zoom (or a plain link)
  into its own slide;
- **Word** (`.docx`): the diagrams as figures, with the document's own `.nedito` copy inside, so a
  Word export opens again as the diagram;
- **Animated image** (`.gif`): the level as it moves on the canvas, in a choice of sizes and frame
  rates;
- the **`.nedito` file** itself;
- **Copy image with live link**: a picture to paste anywhere, which opens the full diagram when
  clicked.

**Share** makes a link that opens the diagram read-only in the browser. Opening accepts `.nedito`
files (and the older `.deepdraw`), editable PNGs, Word exports and draw.io files (`.drawio`, `.xml`)
— the last as a best-effort import that says what it could not carry across.

## Contributing

`main` is protected and always working. Each change is its own short-lived branch off `main`:

1. Branch (`feat/…`, `fix/…`, `docs/…`).
2. Before opening a pull request, run the fast checks and get them green — `npm run test`,
   `npm run lint`, `npx tsc -b`, `npm run build` — plus the end-to-end tests for the area you
   changed (`npx playwright test tests/e2e/<spec>`). The whole end-to-end suite runs in CI.
3. Open the pull request with what changed and the verification results, and wait for review.
4. One pull request open at a time: the next branch starts after the last one merges.

Every pull request runs the full sweep in GitHub Actions (`.github/workflows/ci.yml`), the end-to-end tests split across four machines, and must be up to date with `main` and green before it merges. Report a security problem privately, as `SECURITY.md` describes, not in an issue.

Commits use conventional messages (`feat(canvas): …`). New dependencies need a stated reason.
[`CLAUDE.md`](CLAUDE.md) holds the full working agreements and the product rules,
[`PROGRESS.md`](PROGRESS.md) the work queue, and [`CLAUDE_HISTORY.md`](CLAUDE_HISTORY.md) every
past decision and why.

## Licence and attribution

Nedito is open source under the Apache License 2.0 — see [`LICENSE`](LICENSE). The third-party icon
sets it ships (Azure, AWS and Google Cloud architecture icons, and Google's Material Symbols) and its
typeface, IBM Plex (SIL Open Font License 1.1, full text in
[`licenses/IBM-Plex-OFL-1.1.txt`](licenses/IBM-Plex-OFL-1.1.txt)), are used under their own terms,
listed with their sources in [`NOTICE`](NOTICE).
