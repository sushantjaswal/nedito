# Security policy

## Reporting a vulnerability

Please report security problems privately, through GitHub: open the repository's **Security** tab
and choose **Report a vulnerability**. The report reaches the maintainers only, and the advisory is
published once a fix has shipped.

Please do not open a public issue or pull request for a vulnerability.

A useful report says what an attacker could do, the steps or the file that shows it, and the browser
it was seen in. You can expect an acknowledgement within a week.

## Supported versions

Only the current build, the one served at the product's own host (see `src/app/brand.ts`), is
supported. There are no maintained older releases: a fix lands on `main` and is deployed from there.

## What is in scope

The app is static files with no server-side code, accounts or storage (see `README.md`, "Your diagrams
are yours"), so most of what matters happens in the browser:

- anything that runs script or loads content from a file or link someone else made: opening a
  `.nedito` or `.deepdraw` file, an editable PNG, a Word export or a draw.io file, and opening a
  share link in the read-only viewer;
- the exports, where they carry a document's text, pictures or links into another program;
- the redirect between hosts (`src/app/originGuard.ts`) and the links the app hands out.

Denial of service by a deliberately enormous file, and findings that need an already-compromised
browser or machine, are out of scope.
