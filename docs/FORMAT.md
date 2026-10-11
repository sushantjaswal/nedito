# `.nedito` file format

The `.nedito` format is open, documented, and just pretty-printed UTF-8 JSON. Nothing about the
file is locked: any program can read and write it from this description.

**Formerly `.deepdraw`.** The app was called DeepDraw until 2026-10-06
and wrote `.deepdraw` files with `"format": "deepdraw"`. The
document itself did not change: a `.deepdraw` file is the same JSON with the old `format` id,
and every one ever written still opens — see *Names and identifiers* below.

A `.nedito` file diffs cleanly in Git: keys are in a stable order and the JSON is
pretty-printed with 2-space indentation. Re-saving an unmodified document produces
byte-identical output.

## Envelope (current: format version 6)

```json
{
  "format": "nedito",
  "formatVersion": 2,
  "meta": { "title": "...", "created": "...", "modified": "...", "appVersion": "..." },
  "rootDiagramIds": ["..."],
  "diagrams": { "<diagramId>": { "...": "..." } },
  "assets": { "<assetId>": { "...": "..." } }
}
```

- `format` — self-identifies the file: `"nedito"`. Files written before 2026-10-06 say
  `"deepdraw"`; both are read forever (`src/file/migrations/index.ts`'s `KNOWN_FORMAT_IDS`), and
  only the current one is ever written. The id is not part of the schema, so changing it is not a
  `formatVersion` bump: an app that predates the rename refuses a `"nedito"` file on its id
  whatever its version, so a bump could not give it a better message.
- `formatVersion` — an integer, bumped only on breaking schema changes. The app writes the **lowest** version that can describe the document: 5 when any shape or edge is drawn in the app's own look (see *The `look` key*), else 4 when an edge has a free end, else 3 when it contains an image, else 2, so a diagram that uses neither still opens in an app that predates them. A file with a
  version newer than the running app supports is rejected with an upgrade message, never
  guessed at.
- `meta` — document-level metadata. `title`/`created`/`modified` are plain strings;
  `created`/`modified` are ISO 8601 timestamps. `appVersion` records which app version last
  wrote the file — stamped on every write from the app's `package.json` version, so a file
  opened from an older app keeps its value until it is saved again (informational only, not
  validated).
- `rootDiagramIds` — one entry per page, in display order. This is exactly the array the
  bottom page-tab strip renders; reordering pages reorders this array.
- `diagrams` — every diagram in the document, flat, keyed by id, including nested-diagram
  children. Diagrams reachable only through a `NestedNode.childDiagramId` reference are
  **not** listed in `rootDiagramIds` — nesting is a reference graph layered on top of this
  flat map, not a physical hierarchy in the JSON. Keys are written in sorted order.
- `assets` (v3, optional) — the pictures image nodes show, keyed by asset id, each stored once
  however many nodes show it. Written last, keys sorted, and only the assets some node still
  shows: an image deleted in the app never leaves its picture in the file. Omitted entirely
  when the document has no images. See `### Image nodes` below.

## Diagram

```json
{
  "id": "...",
  "title": "...",
  "nodes": [ /* DNode[] */ ],
  "edges": [ /* DEdge[] */ ],
  "layers": [
    { "id": "...", "name": "Layer 1", "visible": true, "locked": false }
  ]
}
```

`nodes` and `edges` are arrays, not maps — array order is insertion order and has no
semantic meaning (z-order is the explicit `z` field on each node).

`layers` is optional — a diagram saved before the Layers panel existed simply omits it, and
the app treats that as one implicit default layer rather than requiring a migration (see
`src/model/layers.ts`'s `getLayers()`). When present, it's the diagram's ordered list of
layers; each node/edge's optional `layerId` (see below) selects one by id. A hidden layer's
content doesn't render; a locked layer's content renders but can't be selected or moved.
Layer order is purely organizational in v1 — it does not affect render stacking, which stays
governed by each node's own `z` field.

## Nodes (`DNode`)

Every node shares this base shape, then adds fields per `type`:

```json
{
  "id": "...",
  "position": { "x": 0, "y": 0 },
  "size": { "w": 120, "h": 60 },
  "rotation": 0,
  "z": 1,
  "style": { "fill": "#ffffff", "stroke": "#1e2733" },
  "label": { "text": "...", "bold": false, "italic": false, "fontSize": 12, "color": "#1e2733", "align": "center" },
  "layerId": "..."
}
```

- `rotation`, `label`, and `layerId` are optional; omitted when unset.
- `layerId` — which of the diagram's `layers` this node belongs to. Omitted means the
  diagram's first layer (see the Diagram section above). `DEdge` has the same optional field
  with the same fallback.
- `style` is a loose `Record<string, string | number | boolean>` — presentation
  keys (`fill`, `stroke`, `edgeStyle`, `startArrow`, `endArrow`, `dash`, …) plus a couple of
  Nedito-specific ones documented below. New style keys never require a schema bump.
  Where a shape's label sits uses three keys: `verticalAlign`
  (`"top" | "middle" | "bottom"`, default middle), `horizontal` (`false`/`0` turns the text to
  read bottom to top) and `verticalLabelPosition` (`"top" | "bottom"` hangs the label outside
  the shape, above or below it). An app that does not know a key draws the label centred. `shadow` (`1`/`true`) draws a soft drop shadow under a shape, and `dash` (`"dashed"` or `"dotted"`) its outline pattern, as on edges.

### The `look` key (v5)

`style.look: "classic"` on a shape or an edge means it is drawn in the look the app had before
format version 5: wherever its style leaves a value unset, an outline shape has an ink
(`#1E2733`) outline, a Rounded Rectangle has its original corner, and an edge is the muted grey
(`#66707D` in exports; the theme's muted colour on screen). Without the key, unset values resolve
to the app's own look: shapes white with the same ink outline, a rounder Rounded Rectangle, and
ink (`#1E2733`, black) edges. New outline shapes are also written with `shadow: true`. New connections are written with `endArrow: "open"` (they used
to be written `"classic"`; either is stored explicitly, so this needs no key). Widths, sizes, fonts
and any colour set explicitly are the same in both looks, as are stencils with a colour of their own
and pictograms. Groups and Nested Blocks draw their own way and never carry the key.

### `type: "shape"`

Adds `shapeRef: string` — a stencil id like `"general/rect"` (see `src/library/stencils/`).

#### Image nodes (v3)

A picture of the user's own is a shape with `shapeRef: "image"` and one more field,
`imageId: string`, naming an entry in the envelope's `assets`. Everything else about it — size,
rotation, style, label, layer — is an ordinary shape. Its label is drawn **below** the picture.

Each asset is:

```json
{ "mime": "image/png", "data": "<base64>", "width": 640, "height": 480, "name": "logo.png" }
```

- `mime` — one of `image/png`, `image/jpeg`, `image/gif`, `image/webp`, `image/svg+xml`.
- `data` — the file's bytes, base64, without a `data:` prefix. Base64 costs a third more than
  the raw bytes; that is the price of the format staying one readable JSON file (no compression
  or binary packaging, by design).
- `width` / `height` — intrinsic pixels, after the app shrinks large images on insert (long edge
  at most 2,048 px).
- `name` — the original file name, informational.

Images are never referenced by URL: the file must be complete on its own, and a document is
never allowed to reach the network.

### `type: "nested"`

```json
{
  "type": "nested",
  "childDiagramId": "...",
  "collapsed": { "icons": ["general/rect"], "summary": "3 shapes" },
  "ports": [
    { "id": "...", "side": "left", "offset": 0.5, "innerNodeId": "...", "label": "API" }
  ]
}
```

- `childDiagramId` — the id of this node's child diagram in the document's flat `diagrams`
  map. Must exist (`MISSING_CHILD_DIAGRAM` if not) and following every nested node's
  `childDiagramId` transitively must never cycle back to an ancestor (`CYCLE`).
- `collapsed` — the author-designed collapsed view. `icons` is a list of stencil ids shown as
  a mini icon row (never auto-generated); `summary` is optional one-line text.
- `ports` — named anchor points on the node's border. `side` is one of
  `"top" | "right" | "bottom" | "left"`; `offset` is `0..1` along that side. `innerNodeId`, when
  present, must reference a node that exists inside the child diagram (`DANGLING_PORT` if not).

  **`innerNodeId` is optional as of formatVersion 2.** A port with no `innerNodeId` is
  *unmapped*: the external connection is real and attached to the port, but nothing inside the
  child diagram is linked to it yet. This is a valid, intentional state, not a dangling
  reference — it's what the app creates when an edge is dropped on a nested node whose child is
  still empty, and it's surfaced to the author as a "waiting to be linked" connection rather
  than being silently discarded. A reader that encounters one should render the connection as
  unresolved rather than treating the file as corrupt.

### `type: "group"`

Adds `childIds: string[]` — a flat group (Ctrl+G) of shapes on the same level, unrelated to nesting.

## Edges (`DEdge`)

```json
{
  "id": "...",
  "source": { "nodeId": "...", "portId": "..." },
  "target": { "nodeId": "..." },
  "waypoints": [{ "x": 100, "y": 50 }],
  "style": {
    "edgeStyle": "orthogonal",
    "startArrow": "none",
    "endArrow": "classic",
    "dash": "dashed",
    "sourceHandle": "right",
    "targetHandle": "port:abc123"
  },
  "label": { "text": "flows to" }
}
```

- `source`/`target` (`EdgeEnd`) — attached to a node by `nodeId`, or (**v4**) free at a
  `point: {x, y}` in diagram coordinates — a line drawn from the Lines section, or a connection
  let go on open canvas. Exactly one of `nodeId` and `point` is
  set; `{ "point": { "x": 120, "y": 80 } }` is a whole free end. `portId` is set only when the edge is
  attached to a specific port on a nested node (rather than the node generically); an
  optional `anchor: {x, y}` (each 0..1 across the node's box) pins a fixed connection point,
  so the end is exactly there, not moved to the outline.
  `waypoints` and `label` are omitted when unset.
- `labelPosition` (optional) — where the label sits once it has been dragged:
  `{ "t": 0.25, "dx": 0, "dy": 30 }` is a quarter of the way along the line from the source (by
  length, 0..1), then 30 units below it. Relative to the line, so the label keeps its place as the
  shapes move. Omitted, the label sits at the middle of the line.
  Purely additive, so it carries no `formatVersion` bump: an app that predates it shows the label
  in the middle.
- `style.edgeStyle` — `"straight" | "orthogonal" | "curved"`. `startArrow`/`endArrow` are
  `"none" | "open" | "classic"`. `sourceHandle`/`targetHandle` record which of the node's
  connection points the edge renders from — a plain side name (`"right"`) for a generic
  handle, or `"port:<portId>"` for a specific port. These two are a rendering detail kept in
  the loose `style` bag rather than on the authoritative `EdgeEnd` type, so the
  model stays independent of how the canvas draws connection points. A free end has no handle; it leaves toward its neighbour on
  the line.
- `style.edgeShape` — what the line is drawn as: `"line"` (default; omitted), `"double"` (two
  parallel strokes), `"arrow"` (a hollow block arrow along the route, its heads
  drawn wherever `startArrow`/`endArrow` is not `"none"`) or `"wavy"` (a
  wave along the line's stretches, keeping its ordinary arrowheads). A new style key, so no bump.

## Motion (v6, optional)

A saved property, never a playback mode: two lines in one diagram can move differently, and the
motion travels in the file and in a share link. Every field is optional; **absent means still**,
exactly as before motion existed, and a document with no motion at all is written at the lowest
version it needs (v5 or lower) — only a document that uses motion is written as v6.

```jsonc
// on an edge
"motion": { "kind": "flow", "speed": "fast", "direction": "reverse" }
                                                          // kind: flow | packets | throughput
                                                          // speed: slow | normal (default) | fast
                                                          // direction: forward (default) | reverse | both
"motion": { "kind": "throughput", "volume": 4 }          // volume: 1–5, carried by line weight
// on a shape or Nested Block
"motion": { "pulse": { "ripple": true }, "health": "degraded" }  // health: healthy | degraded | down
// on a Nested Block only
"peek": true
// on a diagram — one presentation mode at most, by construction
"motion": { "drawIn": true, "presentation": { "mode": "walkthrough", "order": ["<id>", "<id>"] } }
                                                          // mode: build | walkthrough | spotlight
```

Readers decide whether anything moves: a reader's reduced-motion setting stops all of it, and the
app and its share-link viewer each offer a Motion switch. **Every kind has a still form**, which
is what every export draws: Flow is its dash pattern standing (`8 6` on an otherwise solid line);
Pulse is the shape as authored; Packets is one dot 60% of the way along the line in the
direction it travels; Throughput is the line drawn at its volume's weight (its own width × 0.95 at
volume 1 up to × 2.35 at 5), with Flow's dashes; Health is its badge — a disc at the shape's top-right corner, green with a
tick, amber with an exclamation mark or red with a cross, on a white ring that marks it as set by
hand. Draw in and Peek are one-shots: their still form is the finished diagram. Of the
presentation modes, Walkthrough rests as its numbered steps — a violet pill with a white number
on each step's shape's top-left corner, or on a line's middle (just above its label, if it has
one) — and Build and Spotlight as the finished, undimmed diagram.

A presentation's `order` lists shape and line ids on its own level. An empty `order` means the
shapes' reading order (top to bottom, then left to right). Writers drop the ids of shapes and lines
no longer on the level, so a file never names one that is not there; readers may skip any such id
rather than reject the file.
Validation rejects an unknown kind, speed, health or presentation mode, a volume outside 1–5, a
`peek` on anything but a Nested Block, and a presentation order naming anything not on its level.

## Validation on open

Every file is run through `src/model/validate.ts` before it's loaded — a parse or schema
failure never crashes the app, it shows a clear error instead:

- `DUPLICATE_ID` — an id (diagram, node, port, or edge) isn't unique across the whole
  document.
- `MISSING_ROOT_DIAGRAM` — a `rootDiagramIds` entry doesn't exist in `diagrams`.
- `MISSING_CHILD_DIAGRAM` — a nested node's `childDiagramId` doesn't exist in `diagrams`.
- `CYCLE` — following `childDiagramId` references loops back to a diagram already on the
  current path.
- `DANGLING_PORT` — a port's `innerNodeId` is present but doesn't exist in its nested node's
  child diagram. An *absent* `innerNodeId` (an unmapped port) is legal and never reported.
- `MISSING_ASSET` — an image node's `imageId` is missing or names no entry in `assets`.
- `BAD_ASSET` — an asset's `mime` isn't allowed, its `data` isn't well-formed base64, its bytes
  don't start with that format's signature (an asset claiming to be a PNG must be one), or its
  size isn't positive. Asset ids also count towards `DUPLICATE_ID`.
- `BAD_EDGE_END` — an edge end has neither a `nodeId` nor a `point`, both, or a `point` whose
  coordinates aren't finite numbers.

Before those checks, values that are not what their field means are **dropped**, not refused, so
one stray value never makes a document unopenable; the shape falls back to its default look. A
reader should treat a file as untrusted, and these rules are what keep its values from reaching
anything but the drawing:

- **Colours** — `style.fill`, `style.stroke`, a label's `color` and a diagram's `background` — are
  hex (`#rgb`, `#rgba`, `#rrggbb`, `#rrggbbaa`), `rgb()`/`rgba()` with comma-separated numbers, a
  CSS named colour, `none` or `transparent`. Anything else is dropped.
- **Numbers** are finite and in range: `style.strokeWidth` 0–100, `style.fillOpacity` and
  `style.opacity` 0–1, a label's `fontSize` 1–400, a node's `rotation` within ±36000. A node's
  `position` (±10,000,000) and `size` (above 0, up to 10,000,000) cannot be dropped, so a value
  outside that is replaced: `0` for a position, 120 × 60 for a size. A port's `offset` outside
  0–1 becomes 0.5, and a `pageSize` that is not two positive numbers is removed.
- **Any other style value** is a finite number, a boolean, or plain text of up to 200 letters,
  digits, spaces and `#.,%:_()/+-` — never markup. A label's `bold` and `italic` are booleans and
  its `align` is `left`, `center` or `right`.

Every value Nedito itself writes is inside these rules, so a document it saved comes back
unchanged; none of this changed the format version.

### `pageSize` (optional, on a diagram)

`{ "w": 794, "h": 1123 }` — the printable page in canvas units (CSS px at 96dpi), used to draw
page boundaries and to size PDF/print output. Purely additive and optional: a diagram without it
is an unbounded canvas with no page concept, which is the default and what every file written
before page sizes existed contains. A reader that doesn't understand it can ignore it safely, so
it does **not** carry a `formatVersion` bump — same as `background` and `layers` before it.
- `DANGLING_LAYER_ID` — a node or edge's `layerId` doesn't match any entry in its diagram's
  `layers` array (only checked when that diagram actually has a real `layers` array — an
  absent `layerId` always falls back safely, so there's nothing to check for a diagram that
  hasn't touched layers yet).

## `.nedito.png` — editable image export

`Export ▾ › Editable image` (`.nedito.png`; `.deepdraw.png` before the rename, still opened) produces an ordinary PNG (the same raster a plain "Export as
PNG" would) with the full document embedded inside it, so a shared image is also the editable
file. The PNG is valid and opens normally
in any image viewer; Nedito additionally reads it back via `File > Open…` or drag-and-drop.

The document is embedded as a standard [iTXt chunk](https://www.w3.org/TR/png/#11iTXt)
(the PNG text-chunk variant that supports UTF-8, needed since labels can contain arbitrary
Unicode), inserted immediately after `IHDR`, under the fixed keyword `dd-doc`. That keyword is
a low-level container key, not user-facing text — it's deliberately **not** derived from the
product's brand/name, so a `.deepdraw.png` exported before the rename to Nedito opens exactly
as before, and the keyword was deliberately left unchanged by it (see `src/file/pngChunks.ts`). The embedded text is exactly what
`encodeDoc()` produces — the identical envelope documented above, `format`/`formatVersion`
included — so opening a `.nedito.png` (or `.deepdraw.png`) runs through the exact same
`decodeDoc()` validation and migration path as a plain `.nedito` file. A PNG with no `dd-doc` chunk (any image not
exported by this app) is treated as just an image — `File > Open…`/drag-and-drop reports it
can't find an embedded document rather than guessing.

## Share links (`#d=`)

A whole document can travel inside a URL, so a diagram pasted into a wiki or an email stays
openable rather than becoming a dead picture. The link carries the same envelope documented
above — nothing about the format changes, and no `formatVersion` bump is involved.

```
https://nedito.app/#d=<payload>&v=<formatVersion>[&p=<diagramId>]
```

The app builds every link on its canonical host (`APP_ORIGIN` in `src/app/brand.ts`). Links made
before 2026-10-06 point at `https://myconifer.app/`, which is no longer served; their payload is
unaffected — the same fragment after `https://nedito.app/` opens the diagram, and its old
`"deepdraw"` format id decodes unchanged.

- The payload lives in the **fragment** (after `#`), never the query string. Browsers strip the
  fragment before a request is sent, so it never appears in a request line, a `Referer` header,
  or a server access log. That is what lets the app carry someone's diagram to another person
  without any of it reaching a server, ours included. Moving it to a query parameter would
  silently break that; don't.
- `d` — the document, encoded as: `encodeDoc()` output (the exact JSON above) → UTF-8 → gzip →
  [base64url](https://www.rfc-editor.org/rfc/rfc4648#section-5) with the padding removed. Gzip
  is the platform's own `CompressionStream`, so any implementation with a standard gzip and a
  base64url encoder can produce or read one of these links.
- `v` — the `formatVersion`, duplicated outside the payload so a link written by a newer app can
  be rejected with an accurate message without decompressing it first.
- `p` — *optional.* The id of the diagram the reader should land on, so a link can open inside a
  nested block rather than on page one. One id is enough: the document is a tree, so the whole
  breadcrumb trail is derivable from the leaf. A `p` naming a diagram the payload does not
  contain is ignored and the link opens at page one — a navigation hint is never worth failing a
  whole link over.
- Unknown extra parameters are ignored, so a link from a newer app that carries more of them
  still opens.

Before encoding, the document is passed through a **share-slimming** step (`src/share/slimDoc.ts`)
that drops what a reader cannot use: pages that were never drawn on (the last page always
survives), and diagrams no longer reachable from any page or nested node. Child diagrams are
always kept, empty or not, because their nested box still opens into them. The result is a
valid document in its own right and is what a round trip returns — not a byte copy of the
sender's file.

Links have practical size limits (`src/share/constants.ts`): a link over ~16,000 characters is
refused outright rather than handed out to be truncated somewhere in transit, and the file
download is offered instead.

Opening a link runs the identical `decodeDoc()` validation and migration path as a file, and a
damaged or truncated payload produces a readable error, never a crash or a blank canvas.

## Migrations

`formatVersion` only bumps on a breaking change, and every bump ships a migration function
in `src/file/migrations/index.ts` that upgrades an older file to the current shape in memory
before validation runs. Saving writes the lowest version that can describe the document (see
`formatVersion` above), so opening an older file and saving it upgrades it only as far as its
content needs.

## Names and identifiers

Everything identifying a document as ours, what is written now, and what is still read:

| | Written | Also read (forever) |
|---|---|---|
| `format` id | `"nedito"` | `"deepdraw"` |
| Document extension | `.nedito` | `.deepdraw` |
| Editable image extension | `.nedito.png` | `.deepdraw.png` |
| PNG chunk keyword | `dd-doc` | — (unchanged by the rename) |
| Word export's custom XML part | `<nedito xmlns="https://nedito.app/ns/document">` | `<deepdraw xmlns="https://deepdraw.local/document">` |
| Share-link host | `nedito.app` | `myconifer.app` (no longer served; the fragment opens on `nedito.app`) |

## Version history

| formatVersion | Date | Change |
|---|---|---|
| 1 | 2026-08-04 | Initial format. |
| 2 | 2026-08-20 | `Port.innerNodeId` became optional, allowing *unmapped* ports (see `type: "nested"` above). Older files need no data changes — every v1 port is mapped, which stays valid in v2 — so the v1→v2 migration only restamps the version. The bump exists because the reverse is *not* safe: a v2 file may contain an unmapped port, which a v1 reader would reject as `DANGLING_PORT`, and the version field is what turns that into a clean "created with a newer version" message. |
| 3 | 2026-09-28 | Images of the user's own: an `assets` table and `ShapeNode.imageId` (see *Image nodes*). Nothing in a v2 file changes, so there is no v2→v3 migration, and a document without images is still written as v2. The bump exists for the reverse direction: a v2 app shown a v3 file says "created with a newer version" instead of drawing its images as blank shapes. |
| 5 | 2026-10-05 | The app's own default look (see *The `look` key*). **Migration:** every shape and edge in a v4-or-older document gets `style.look: "classic"`, so it draws exactly as before — on screen, in dark mode, and in every export (a committed fixture rendered by the pre-v5 code proves the export byte for byte). A document whose every shape and edge is classic is still written at the lowest version it needs; anything in the new look makes it v5, because an older app would draw it in the classic look and, read back as v4, it would be marked classic by this very migration. |
| 6 | 2026-10-07 | Motion (see *Motion*): optional `motion` on edges, shapes and diagrams, and `peek` on Nested Blocks. Nothing in a v5 file changes, so the v5→v6 migration only restamps the version, and a document without motion is still written as v5 or lower. The bump exists for the reverse direction: an app that predates motion says "created with a newer version" instead of opening the file, dropping its motion and saving over it. |
| 4 | 2026-10-03 | Free edge ends: `EdgeEnd.point` (see *Edges*), for lines drawn on their own and connections let go on open canvas. Every v3 edge is attached at both ends, which stays valid, so there is no v3→v4 migration, and a document without a free end is written as v3 or v2 as before. The bump exists for the reverse direction: an older app would read a free end as a missing node and silently lose the line. |
