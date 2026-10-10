# Contributing to Nedito

Thank you for helping. Bug reports, ideas, documentation and code are all welcome. Everyone taking
part is expected to follow the [Code of Conduct](CODE_OF_CONDUCT.md).

## Reporting a bug

Open an issue with the **Bug report** form. The most useful reports say:

- what you did, step by step, and what you expected;
- what happened instead (a screenshot helps);
- your browser and operating system, and the version from the About dialog (app menu › About);
- the diagram, if the bug depends on it. Nothing in the app sends us your work, so export it
  yourself (app menu › Save a copy) and attach the `.nedito` file — after removing anything you
  would not want public, since issues are public.

A security problem is different: report it privately, as [`SECURITY.md`](SECURITY.md) describes,
never in a public issue.

## Suggesting a feature

Open an issue with the **Feature request** form, starting from the problem rather than the
solution: what you were trying to draw or do, and where Nedito got in the way. For how existing
editor behaviour should work, the reference is draw.io's behaviour and keyboard map, unless
[`CLAUDE.md`](CLAUDE.md) says otherwise.

## Making a change

You need Node.js and npm. Commands work in PowerShell as written; the project is developed on
Windows.

```powershell
npm install
npm run dev
```

`main` is protected and always working. Each change is its own short-lived branch off `main`, and
one pull request is open at a time:

1. Branch: `feat/…`, `fix/…`, `docs/…` or `chore/…`.
2. Make the change, with tests. Unit tests (Vitest) sit next to the code they test; end-to-end
   tests (Playwright) are in `tests/e2e/`. Every change to the model or the file format ships with
   unit tests.
3. Before opening a pull request, run the fast checks and get them green, plus the end-to-end
   specs for the area you changed:

   ```powershell
   npm run test
   npm run lint
   npx tsc -b
   npm run build
   npx playwright test tests/e2e/<spec>
   ```

   The first end-to-end run needs the browser: `npx playwright install chromium`. Run the whole
   suite (`npm run test:e2e`) when a change is broad: the store, the canvas, export, the shell.
4. Open the pull request with the template filled in: what changed, why, and how you checked it.
   CI runs the full sweep, the end-to-end tests split across four machines, and the pull request
   must be up to date with `main` and green before it merges.

Commits use conventional messages (`feat(canvas): edge waypoints`, `fix(library): …`).

## Rules that review will hold you to

These come from [`CLAUDE.md`](CLAUDE.md), which has the full working agreements and the product
rules; [`CLAUDE_HISTORY.md`](CLAUDE_HISTORY.md) has every past decision and why.

- **The product's name and hosts live in [`src/app/brand.ts`](src/app/brand.ts).** Every UI
  string, file filter, storage key and link reads them from there; code identifiers stay
  brand-neutral, and CSS classes, custom properties and test ids use the `nd-` prefix.
- **No personal or machine-specific details in any file or commit message**: no names, email
  addresses, handles, local paths, machine names or local URLs, and no file names of recordings or
  screenshots from someone's own computer. Write about people by role ("the user", "a reviewer").
  `src/app/personalData.test.ts` checks it.
- **Never copy from draw.io.** No code, icons, stencils or templates from its repositories or from
  app.diagrams.net, in any form. Icons come only from the official Azure, AWS and Google Cloud
  sets and openly licensed sets, each recorded with its source and licence in
  [`NOTICE`](NOTICE); everything else is drawn for Nedito.
- **Never break the file format silently.** A breaking change bumps `formatVersion`, adds a
  migration in `src/file/migrations/`, and updates [`docs/FORMAT.md`](docs/FORMAT.md). Old files
  always open.
- **New dependencies need a stated reason**, recorded in [`PROGRESS.md`](PROGRESS.md) with the work
  that introduced them.
- **A decision gets a Decision Log entry** in `CLAUDE_HISTORY.md`: what was decided, and why.

## Licence

Nedito is licensed under the [Apache License 2.0](LICENSE). By contributing, you agree that your
contribution is licensed under the same terms (section 5 of the licence).
