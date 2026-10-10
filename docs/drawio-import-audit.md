# draw.io import audit — 2026-10-07

What happens to a real draw.io file when Nedito imports it, ranked by how much it hurts the
people most likely to import one: cloud architects, data modellers, and anyone with swimlanes.

**Method.** Five fixtures in `src/file/drawio/fixtures/audit/`, hand-written in draw.io's own
file format (nothing copied from draw.io's repositories — the provenance rule), covering
what draw.io actually writes: HTML labels, the common shapes, text cells, rotation, gradients,
eleven arrowheads, connection anchors, waypoints, extra edge labels, an edge ending on another
edge, loose ends, swimlanes, groups, a container, a collapsed container, `<UserObject>` and
`<object>` wrappers with placeholders, a second and a hidden layer, an entity-relation table, AWS,
Azure and GCP icons, an embedded and a linked picture, and a compressed multi-page file. Each was
imported with `decodeDrawio` and compared, cell by cell, with what the file contains.

**What already works well.** Compressed and multi-page files; HTML labels to plain text with bold,
italic, size, colour and alignment; fills, strokes, widths, dashes, opacity, shadow; rotation;
groups; child geometry made absolute; waypoints; loose line ends; straight / orthogonal / curved
routing; the common flowchart, general and UML shapes; embedded pictures; and the two promises in
the importer's header — nothing is dropped silently without a notice, and nothing invalid loads.
Every fixture imported and validated.

## Findings, most harmful first

| # | Finding | What the reader sees | Effort |
|---|---|---|---|
| 1 | **Cloud icons become coloured boxes.** `mxgraph.aws4.resourceIcon;resIcon=…`, `mxgraph.aws4.<service>`, Azure's `image=img/lib/azure2/…/X.svg` and GCP's `mxgraph.gcp2.*` all fall back to a rectangle — orange for Lambda, green for S3 — although Nedito ships the official icon for most of them (`aws/compute/aws-lambda`, `azure/compute/virtual-machine`, …). | An architecture diagram arrives as unlabelled orange and green tiles. | Medium: a name-matching table per vendor, built from the manifests, with the fallback kept. |
| 2 | **Arrowheads collapse to three.** The importer predates Nedito's arrowheads: `diamond`, `diamondThin`, `oval`, `ERmany`, `ERmandOne`, `ERzeroToMany`, `async`, `dash` all become a filled triangle. Nedito now draws hollow and filled diamonds, a hollow triangle and the four crow's-foot ends. | UML composition and aggregation lose their meaning; every ER relationship reads as an arrow, both ends. | Small: extend `toArrow`. |
| 3 | **Layers are flattened, and hidden layers appear.** Every layer lands on Nedito's one default layer; a layer draw.io had hidden (`visible="0"`) or locked becomes visible and editable. Nedito has layers. | Draft or internal content the author had hidden is shown to everyone the file is passed to. | Small–medium: map draw.io layers to Nedito layers with visibility and lock. |
| 4 | **Extra edge labels become stray boxes.** A label stored as an `edgeLabel` child cell — draw.io's form for any label beyond the first, and for one dragged along the line — is imported as a 120×60 rectangle near the canvas origin, with a notice saying it drew "edgelabel" as a rectangle. | A misplaced box with the label in it, far from its line. | Small–medium: becomes the edge's label (or a notice when the edge already has one), its place along the line kept with D97's `labelPosition`. |
| 5 | **ER tables explode into a grid of boxes.** `shape=table`, `tableRow` and borderless `partialRectangle` cells each become a bordered rectangle, so a two-column table is eleven stacked outlines, and the relation attaches to a row box. | Readable text inside a cage of borders that were never there. | Medium: borderless rows and cells, the header kept, with a notice. |
| 6 | **Swimlanes lose their title band; containers do not contain.** `swimlane` falls back to a rectangle with its title in the middle (and a notice), and a container's children are placed correctly but are not tied to it, so moving it leaves them behind. | Lanes read as big boxes with a label over their contents. | Medium: a frame shape with the title at the top; containment as a group. |
| 7 | **A collapsed container shows what it hid.** A folded swimlane's children are imported at full size outside its 23px header. | Shapes floating loose beside a thin bar. | Small: import them on a hidden layer, or skip with a notice. |
| 8 | **An edge that ends on another edge is skipped.** draw.io lets a line end on a line; Nedito cannot, so the connection is dropped with a notice. | A connection missing, with a notice. | Small: keep it as a loose end at that line's midpoint. |
| 9 | **Placeholders and object data.** `placeholders="1"` labels arrive as the literal `Owner: %owner%`; tooltips and links on `<UserObject>` are dropped without a notice. | A label with template syntax in it. | Small: substitute placeholders; a notice for links and tooltips. |
| 10 | **Connection anchors are ignored.** `exitX/exitY/entryX/entryY` fix which side a line leaves and arrives at; Nedito picks the sides itself. | Routing that differs from the original, still connected. | Small: map to the nearest side handle. |
| 11 | **The cloud shape** (`ellipse;shape=cloud`) becomes a rectangle, although `basic/cloud` exists. | A box where a cloud was. | Trivial. |
| 12 | **Minor style losses, silently:** gradient fills, underline (`fontStyle` 4), rounded edge corners, per-word colour inside a label, and font family (deliberate: Plex is the only face, D49). | Small visual differences only. | — |

## Proposed fixes (each its own item, awaiting approval)

All six were approved and shipped on 2026-10-08; the fixtures below
are now the import's regression suite.

Grouped so each PR is small and testable against these fixtures:

- **X1 — Cloud icons** (finding 1, then 11).
- **X2 — Arrowheads and ER ends** (2).
- **X3 — Layers, hidden and collapsed content** (3, 7).
- **X4 — Edge labels, edge-to-edge, anchors** (4, 8, 10).
- **X5 — Tables, swimlanes and containers** (5, 6).
- **X6 — Placeholders, links and tooltips** (9), with notices for 12.

Each would turn its fixture expectations into assertions, so the audit fixtures become the import's
regression suite.
