# Insert your own image — scope

**Status:** implemented, 2026-09-28 (CLAUDE_HISTORY.md D80); decisions in §9, and what changed from this plan in §10. Replaces the descoped custom shape libraries (CLAUDE_HISTORY.md D77).
**Goal:** a user can put any image of their own into a diagram, and it travels inside the `.deepdraw` file like everything else.

## 1. How draw.io does it

- **Ways in:** *Arrange ▸ Insert ▸ Image…* (a file, or a URL), dragging an image file onto the canvas, and pasting an image from the system clipboard.
- **Result:** an image shape. It keeps its aspect ratio when resized, can be rotated, and takes a label, which sits *below* the picture by default.
- **Storage:** the picture is embedded in the file as a `data:` URI in the shape's style.
- **Large images:** draw.io offers to shrink a large image on insert.

We match this except:

- **no URL option**, because we never fetch from the network ("Local only — nothing uploaded");
- **a shared image table** instead of a copy of the image in every shape's style (§3).

## 2. Ways in (all four ship together)

| Entry point | Behaviour |
| --- | --- |
| **Arrange ▸ Insert image…** (and the canvas right-click menu) | A file picker; the image is placed at the centre of the view. |
| **Drop an image file on the canvas** | Placed where it was dropped. Several files at once are placed in a staggered row. |
| **Paste (Ctrl+V) an image from the system clipboard** | Placed at the centre, like any other paste. An in-app copy of shapes still pastes shapes. |
| **Replace image…** (context menu and Style tab, on an image) | Swaps the picture and keeps the node's position, size and connections. |

**Accepted formats:** PNG, JPEG, GIF (first frame only), WebP and SVG.

- SVG is safe here because it is only ever drawn as an image (`<img>`, or SVG `<image>`), and browsers never run scripts in that context.
- Anything else is refused with a plain message.

**Dropping a PNG: the one real conflict.** Today *every* dropped `.png` is treated as a DeepDraw document, so an ordinary photo fails with an error alert. **Proposed rule:**

- a PNG carrying a DeepDraw document still **opens** as that document, as now;
- any other image is **inserted**.

Decided in §9 (Q2).

## 3. Data model: a shape that shows an asset

**Recommended: not a new node type.** An image is a `ShapeNode` with `shapeRef: "image"` and one new field, `imageId`, which points into a new document-level `assets` table:

```ts
interface DeepDrawDoc {
  // ...unchanged...
  assets?: Record<string, ImageAsset>;   // new in formatVersion 3
}

interface ImageAsset {
  mime: "image/png" | "image/jpeg" | "image/gif" | "image/webp" | "image/svg+xml";
  data: string;                           // base64, no "data:" prefix
  width: number;                          // intrinsic pixels, after any downscaling
  height: number;
  name?: string;                          // original file name, for the Style tab
}

interface ShapeNode extends NodeBase {
  type: "shape";
  shapeRef: string;                       // "image" for an image
  imageId?: string;                       // set only when shapeRef === "image"
}
```

**Why a shape, not a new node type.** 23 files branch on `node.type`. An image already behaves like a shape in all of them: selecting, moving, resizing, rotating, labels, layers, z-order, grouping, converting to a nested block, connecting edges, copy and paste. Only the *drawing* differs. A shape variant touches the three renderers; a new type would touch 23 files and could miss one silently.

**Why a shared asset table, not a `data:` URI in the style.**

- A picture pasted five times is stored once.
- The node JSON stays small and diff-friendly, and each asset is one sorted line at the end of the file.
- The style map keeps holding style.
- Undo keeps sharing one asset object instead of re-copying megabytes on every edit.

**Lifecycle**

- Deleting a node never deletes its asset, because undo must still be able to bring it back.
- Assets no image refers to are pruned when the document is *encoded* (save, autosave, export), so they never reach a file.
- Copy and paste carries the assets its image nodes need.

## 4. File format

- **`formatVersion` 2 → 3.**
  - The migration from 2 to 3 changes nothing, because a v2 file has no images.
  - An older app shown a v3 file gives the existing "made with a newer version" message instead of silently drawing blank shapes. That is the behaviour CLAUDE.md requires.
- **Validation (new checks):**
  - every image node's `imageId` exists in `assets`;
  - the MIME type is in the allowlist;
  - `data` is well-formed base64 whose decoded bytes start with that format's signature;
  - `width` and `height` are positive.
- **Still plain JSON.** CLAUDE.md rules out compression and binary packaging. Base64 adds a third to the image's size; that is the honest cost of a single readable file.
- **`docs/FORMAT.md`** gets a v3 section.

## 5. Size: the constraint that shapes the feature

Three limits, measured from the code:

| Limit | Today | With images |
| --- | --- | --- |
| **Autosave** writes the whole document to `localStorage` (about 5 MB per origin, stored as UTF-16) | A write that doesn't fit **fails silently** (`catch {}` in `autosave.ts`): autosave simply stops, and nothing tells the user | One photo could push a document past it, and the user would lose work on a crash without ever being warned |
| **Share links** (16,000 characters) | Diagrams fit | **Any** image makes the link too large |
| **Autosave cost** (the whole document re-encoded 800 ms after every edit) | Cheap | Re-encoding megabytes of base64 on every nudge would stutter |

**Proposed policy**

1. **Shrink on insert.** Any image whose long edge exceeds **2,048 px** is scaled down to that. A photo is re-encoded as JPEG at 0.85; anything with transparency stays PNG. A notice says what happened ("Photo resized from 4032×3024 to 2048×1536 to keep the file small"). SVG is kept as is. Decided in §9 (Q1).
2. **Per-image cap: 2 MB after shrinking.** A larger image is refused with the reason.
3. **Autosave says when it can't save.** A persistent, non-blocking notice: "Autosave is off — this diagram is too big for browser storage. Save the file to keep your work." This fixes the silent failure for every large document, not only ones with images.
4. **Encode assets once.** The encoder caches each asset's serialised line, so autosave doesn't re-stringify unchanged images.
5. **Share links:** documents with images already hit "too large". *Share link* then says why ("Images make this diagram too big for a link — share the file instead"), and *Copy image with live link* copies the picture without a link, as it already does for large documents.

## 6. Drawing it: one path covers every export

**Canvas.** An `<img>` with the asset as its `src`, filling the node box. The aspect ratio is kept on resize: the handles lock it, and Shift frees it (as in draw.io).

**Label.** Below the image by default, matching draw.io. That means one new label position, drawn identically by the canvas and the exporter.

**Style tab** for an image:

- opacity and border (stroke), as other shapes have;
- the file name;
- *Replace image…*;
- *Reset to original size*.

**Export.** Every export except SVG rasterises the SVG export: PNG, `.deepdraw.png`, PDF, print, PowerPoint, Word and copy-with-live-link. So the exporter draws the asset as SVG `<image href="data:…">`, and every format follows. Rasterising works because the image is a `data:` URI; browsers block *external* URLs when an SVG is drawn to a canvas, which is one more reason never to reference a URL.

**Nested Block miniature** (`miniatureSvg.ts`). It draws the image scaled down, so a nested diagram containing a logo shows the logo on its parent's box.

**Parity.** The render-parity sweep (`m14-render-parity.spec.ts`) gains an image node in its kitchen-sink document. It checks position, size, aspect ratio, opacity, rotation and the label below.

## 7. Out of scope

- Image URLs and web search (no network).
- Cropping, filters and editing inside DeepDraw.
- Animated GIFs (only the first frame is kept).
- Images as a shape's *fill* or as a page background.
- Importing draw.io's own embedded images: they currently become stand-ins with an import notice. It's a natural follow-up once this lands, filed to the Inbox rather than done here.
- A reusable "my images" library: that is the descoped item (D77).

## 8. Work breakdown (one PR, one commit per step)

1. **Model and format:** `assets`, `imageId`, format version 3, the no-op migration, validation, pruning on encode, and `FORMAT.md`. Unit tests, including `encode(decode(x)) === x` with images.
2. **Image processing:** reading a file, sniffing and verifying the format, reading its size, shrinking and re-encoding, and the size cap. Unit tests use real small fixtures of each format.
3. **Canvas:** rendering, aspect-locked resize, the label below, and the Style tab section.
4. **Ways in:** menu and context-menu insert, canvas drop (with the PNG rule), system-clipboard paste, and replace. Copy and paste carries assets.
5. **Exports:** SVG `<image>` (so all exports follow), the miniature, and the parity sweep extended.
6. **Autosave honesty:** the "autosave is off" notice, and the cached asset encoding.
7. **E2E:** insert by each way in, save, reopen, undo and redo across a delete, and export to PNG and PowerPoint.
8. **Docs:** a decision-log entry and PROGRESS.

**No new dependencies.** The browser already decodes, scales (`<canvas>`) and re-encodes (`toBlob`) images.

## 9. Decisions (user, 2026-09-28)

- **Q1. Large images are always shrunk** to a 2,048 px long edge on insert, with a notice. No per-image dialog.
- **Q2. A dropped PNG that carries a DeepDraw diagram opens as that diagram**, as today. Every other dropped image is inserted as a picture.
- **Q3. An image's label sits below it** by default, as in draw.io.

## 10. What changed while building it (D80)

- **v3 is written only when a document contains an image.** Writing v3 unconditionally would have made every newly saved file unreadable by an older app, even with no images in it. Share links state the version their payload was written as, for the same reason.
- **No encoding cache.** Measured: a 4.4 MB document with three large pictures encodes in about 6 ms and writes to localStorage in about 11 ms, once per 800 ms autosave. A cache would add complexity for no measurable gain.
- **Ctrl+V has a fallback.** Copy, cut and paste now let the browser fire its clipboard events. So shape paste cannot regress where a browser fires none, Ctrl+V pastes the in-app shapes if no paste event arrives within 150 ms. Copying shapes also marks the system clipboard, so a stale screenshot there cannot win the next paste.
- **Copy and paste needed no asset carrying.** Loading a document clears the in-app clipboard, so a pasted image always lands in the document that holds its picture.
- **Templates carry pictures.** `applyTemplate` re-issues asset ids like every other id (D65); without it, any template with an image would have produced a document that fails validation.
- **An image's label is always centred.** The exporter cannot measure text, so it could not reproduce left- or right-aligned lines inside a centred block.
