## What changed

<!-- What this pull request does, and why. Link the issue if there is one. -->

## How it was checked

<!-- The commands you ran and what they showed. -->

- [ ] `npm run test`, `npm run lint`, `npx tsc -b` and `npm run build` pass
- [ ] The end-to-end specs for the area changed pass (`npx playwright test tests/e2e/<spec>`), or the whole suite for a broad change
- [ ] New behaviour has tests; a model or file-format change has unit tests, including the round trip

## Checklist

- [ ] No personal or machine-specific details in files or commit messages (names, addresses, handles, local paths)
- [ ] The product's name and hosts come from `src/app/brand.ts`
- [ ] Nothing copied from another diagram tool; any new icons or assets are recorded in `NOTICE`
- [ ] A file-format change bumps `formatVersion`, adds a migration and updates `docs/FORMAT.md`
- [ ] Any design decision, and the reason for any new dependency, is explained above
