# Spec — Portable diagrams: share links, live-linked images, and Office export

**Goal.** A diagram that leaves DeepDraw should not become a dead picture. Wherever it lands (Word, PowerPoint, Excel, email, a wiki), the reader should be one click away from the real, drillable diagram, and in PowerPoint the drill-down should work without leaving the deck.

**Constraint that shapes everything below:** DeepDraw has no backend and must keep its "nothing is uploaded" claim literally true. Every mechanism here is client-side. No diagram data is ever sent to a server, including ours.

Ship as five items, in order, each on its own branch and PR, one PR open at a time, per CLAUDE.md's workflow. Add all five to PROGRESS.md as a Phase 3 group before starting item 1.

---

## Item 1 — Diagram-in-URL encoder + viewer mode

The foundation. Everything after this depends on it.

### Encoding

New module `src/share/urlCodec.ts`:

- `encodeDocToFragment(doc: DeepDrawDoc): string`
- `decodeFragmentToDoc(fragment: string): DeepDrawDoc`

Pipeline: `JSON.stringify` → gzip (pako, add as a dependency; reason: the only mature browser-side deflate) → base64url (URL-safe alphabet, no padding). The result goes in the URL **fragment**, after `#`, never the query string. Fragments are not sent to the server by browsers, which is what makes the privacy claim hold; note this explicitly in a comment.

URL shape: `https://{host}/#d={payload}&v={formatVersion}`

Before encoding, run a **share-slimming pass** that drops anything not needed for viewing: undo history, transient UI state, per-level viewport memory, and any empty pages. Do not alter the user's in-app document; slim a deep copy.

### Size handling

Measure the final URL length and classify:

| Length | Behaviour |
|---|---|
| under 8,000 chars | fine, no warning |
| 8,000 to 16,000 | works, but show an amber note: some older tools truncate very long links |
| over 16,000 | refuse the link, and offer the `.deepdraw` file download instead with a clear explanation |

These thresholds live in one constants file so they can be tuned. Do not silently produce a link that will break.

### Viewer mode

When the app loads with a `#d=` fragment present:

1. Decode and validate against the existing model invariants. On failure show a clean error card ("This link is damaged or was created by a newer version"), never a crash or a blank canvas.
2. Load the document **without** touching the user's autosaved work. This is critical: opening someone else's share link must not overwrite what the recipient had in progress. Hold the shared doc in a separate slot and leave autosave untouched until they explicitly act.
3. Render in a **read-only viewer**: canvas, pan, zoom, full nesting navigation with breadcrumbs, all working. Editing tools hidden or disabled.
4. Top bar shows a viewer strip: `Viewing a shared diagram · read-only` with two buttons: **Edit a copy** (loads it into the normal editor as a new unsaved document, only then leaving the recipient's own work at risk, with a confirm if they have unsaved changes) and **Download {BRAND.fileExt}**.

**Acceptance:** round-trip test `decode(encode(doc))` deep-equals the slimmed doc, for documents at depth 0, 1 and 3; a link with a corrupted payload shows the error card; opening a share link with existing autosaved work leaves that work intact; E2E covering drill-down inside viewer mode.

---

## Item 2 — Copy image with live link

The headline feature. One button, paste anywhere.

### The action

Menu: **File ▸ Copy image with live link** (and a toolbar button). On invoke:

1. Render the current diagram to PNG at 2x scale, white background, tight bounding box plus 24px padding, using the existing PNG export path.
2. Build the share URL via item 1.
3. Write **both formats to the clipboard in a single write**: `image/png` and `text/html` containing `<a href="{url}"><img src="data:image/png;base64,..."></a>`.

The `text/html` flavour is what makes Word, PowerPoint, Excel and Outlook paste a *hyperlinked* image. Applications that don't understand it fall back to the plain PNG, which is still a good outcome. Use the async Clipboard API with a `ClipboardItem` carrying both MIME types.

### Feedback

Toast on success: `Image copied with a live link. Paste it into any document — clicking it opens the full diagram.` If the URL exceeded the hard limit, the toast instead explains the diagram is too large for a link and offers the file download; the image is still copied.

### Known limits, to be documented in the UI help text, not hidden

- Google Docs strips the link on paste in some paths; Word, PowerPoint, Excel and Outlook keep it.
- Clipboard write requires a user gesture and a secure context. Both hold.
- If the browser denies clipboard permission, fall back to a dialog showing the URL with a copy button and a separate "Download PNG" button.

**Acceptance:** unit test asserting the ClipboardItem contains both MIME types and that the HTML flavour wraps an `img` in an `a` with the correct href; manual verification checklist in the PR covering Word, PowerPoint, Excel, Outlook.

---

## Item 3 — Share link dialog

A small dialog for the cases where an image isn't wanted.

**File ▸ Share** opens a dialog with:

- The share URL in a read-only field with a copy button
- A size indicator: `Link size: 4.2 KB of 16 KB` with the amber warning band when applicable
- Checkbox: **Open at this level** — when the user is drilled into a child diagram, embeds the current nav path in the fragment (`&p=childId`) so the recipient lands exactly where the sharer was. Off by default.
- A plain-language line: `This link contains the whole diagram. Nothing is uploaded — the data travels inside the link itself.`

**Acceptance:** the `&p=` path parameter opens the viewer at the correct nesting level; the privacy sentence is covered by the same forbidden-words test used in the onboarding spec ("secure", "encrypted", "private").

---

## Item 4 — PowerPoint export with native Slide Zoom

The showpiece. True in-deck drill-down, no add-in, no install.

### Structure

- One slide per diagram in the document tree, ordered depth-first: parent first, then its children.
- Each slide contains the rendered diagram as a picture (2x PNG or, preferably, native DrawingML shapes if that proves tractable; start with the picture).
- For every nested node on a parent slide, insert a **Slide Zoom** object positioned exactly over that node's bounding box, targeting the child's slide, with:
  - the **thumbnail image replaced by the author-designed collapsed view** of that nested node, so the deck looks identical to the app
  - **Return to Zoom enabled**, so clicking back returns to the parent slide (the breadcrumb equivalent)
  - zoom transition left on by default, with an export option to disable
- Slide titles carry the diagram title; speaker notes carry the breadcrumb path, which makes the deck navigable even for someone editing rather than presenting.

### Implementation note

Slide Zoom is an OOXML extension (`p14`/`p188` extension elements in the slide XML plus a relationship to the target slide). Standard libraries do not emit it. Plan on generating the pptx package directly, or post-processing a library-generated package by injecting the XML and relationships. Prototype this on a two-slide deck **before** building the rest of the exporter; if it proves unworkable, fall back to hyperlinked shapes targeting slides, which loses the zoom animation but keeps the navigation.

### Degradation, to state in the export dialog

Interactivity works in slideshow mode. Zooms play on Mac and mobile PowerPoint but can only be created on Windows, and older versions render a static thumbnail instead. Say this plainly in the dialog rather than letting users discover it.

**Acceptance:** exported pptx opens without repair prompts in PowerPoint; clicking a nested box in slideshow zooms to the correct child slide and returns; a three-level document produces the correct slide count and link graph; automated check that the package validates as OOXML.

---

## Item 5 — Word export with diagram appendix

Self-contained document, click-to-travel navigation.

- The parent diagram as a captioned figure.
- A **Diagram Appendix** section, one numbered sub-heading and figure per child diagram, ordered depth-first, each under a Heading style so Word's native collapse works.
- Each nested node in a figure gets a transparent hyperlinked rectangle positioned over it, targeting the bookmark of that child's figure. Word has no image maps, so overlaid anchored shapes are the mechanism.
- Each child figure carries a "Return to Figure N" internal link back to its parent.
- Also embed the full `.deepdraw` JSON as a custom XML part in the docx package, so the document remains the source and can be reopened in DeepDraw later.
- Same structure works for Excel with sheets instead of headings, if we do Excel at all; treat Excel as out of scope for now and record that decision.

**Acceptance:** hyperlinks resolve in Word desktop and Word Online; internal links survive Save as PDF; the embedded custom XML part round-trips back into the app.

---

## Cross-cutting

- New folder `src/share/` for the codec and viewer-mode logic; `src/export/pptx/` and `src/export/docx/` for items 4 and 5.
- **No changes to `formatVersion`** for items 1 through 3. Items 4 and 5 add no model fields either; if either turns out to need one, stop and raise it rather than bumping the format silently.
- Every new user-facing string reads the product name from `BRAND`.
- The privacy wording rule from the onboarding spec applies to all copy added here.
- Items 4 and 5 add dependencies; list each with a reason in PROGRESS.md under the item that introduced it.
- Prototype the Slide Zoom XML before committing to item 4's full scope.
