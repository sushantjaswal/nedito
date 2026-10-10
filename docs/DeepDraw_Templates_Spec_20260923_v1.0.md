# Spec — Templates (preset diagrams)

**Goal.** Nobody should have to start from a blank canvas. A user picks a diagram type and gets a well-laid-out barebone they can edit immediately. Wherever a diagram type is naturally hierarchical, its template uses Nested Blocks, so templates double as the second place users discover the product's differentiator.

**Scope rule.** A diagram type is in scope if it can be expressed with shapes, edges, text, groups and Nested Blocks, with no data binding and no time-scaled axis. Charts are out (see Exclusions).

Ship as the batches below, each on its own branch and PR, one PR open at a time, per CLAUDE.md. Add all batches to PROGRESS.md as a new group before starting T1. User-facing noun is **Templates**.

---

## Hard rule — every icon a template uses must be findable on its own

A template may only reference stencils that exist in the sidebar library, are visible in the picker, and are searchable.

- If a template needs a shape that doesn't exist yet, **add it to the library first**, in the most fitting existing section or a new section (see "New stencil sections" below), with a clear label and `keywords`. Then use it in the template.
- **Enforced by a unit test**, not by review: for every template, every node's `shapeRef` must resolve in the stencil registry, must not be in `RETIRED_STENCIL_IDS`, and must not be hidden from the picker. A template that references a missing or picker-hidden stencil fails the build.
- The same applies to **edge features**. If a template needs an arrowhead the Style panel doesn't offer (e.g. crow's-foot ends), add it to the Style panel's arrowhead list first, so users can apply it to their own edges.
- Any new icon pack pulled in for templates follows the existing provenance rule in CLAUDE.md: official or openly licensed sources only, recorded in NOTICE, never from the drawio repos.

---

## Placement — visible, not buried

Templates get four entry points. The first two are the primary ones.

1. **Sidebar tab switcher.** At the top of the left sidebar, above the search box, a two-segment control: **Shapes | Templates**. Always visible. Selecting Templates swaps the sidebar body to the template browser; the search box searches templates while that tab is active. Remember the last active tab in localStorage under `BRAND.storagePrefix`.
2. **Empty-canvas start panel.** Whenever the active page has zero nodes (and the first-visit sample is not showing), render a centered card on the canvas: heading `Start from a template`, six featured template thumbnails, and a `Browse all templates` link that switches the sidebar to the Templates tab. The card disappears the moment a node exists and never blocks canvas interaction (it sits in a non-capturing layer; clicks on empty canvas pass through).
3. **First-visit sample strip.** Add a second button next to `Start a blank canvas`: `Start from a template`, which clears the sample exactly like the blank option and then switches the sidebar to Templates.
4. **File ▸ New from template…** opens the same browser, for users who look in menus.

### Template browser (sidebar body)

- Category headers, collapsible, same visual language as stencil sections: **Featured, Process, Software & UML, Data, Architecture & Cloud, Business, Thinking & Planning**.
- Two-column grid of cards: thumbnail, name, and a small violet **Nested** badge when the template contains at least one Nested Block.
- Hover (or focus) shows a one-line description.
- Click applies the template (see Apply flow). Cards are keyboard-focusable; Enter applies.
- Thumbnails are rendered from the template document itself using the existing Nested Block miniature renderer, generated once and cached in memory for the session. No hand-made thumbnail images.

---

## Apply flow

- **Active page empty:** apply directly into the current page, no dialog.
- **Active page has content:** small dialog, three choices:
  - `Add as new page` (default, focused)
  - `Replace this page` (secondary; shows `This can be undone with Ctrl+Z.`)
  - `Cancel`
- Applying a template is **one undoable command**, including any child diagrams it creates.
- Every node, edge, port and diagram id in the template is **re-issued a fresh nanoid** on apply (reuse the id re-issuing already written for drawio import), so applying the same template twice never collides.
- After apply: fit-to-content, select nothing, and set `demoDismissed = true`.
- The new page is named after the template (`Flowchart`, `Levelled DFD`), de-duplicated with a suffix if needed.

---

## Template format and storage

- Each template is a `DeepDrawDoc` under `src/templates/<category>/<id>.ts`, plus a registry entry: `{ id, name, category, description, keywords[], featured, usesNesting }`. `usesNesting` is **derived** from the document, not hand-set.
- Template modules are **lazy-loaded per category**, like stencil sections, so the catalogue never inflates the main bundle.
- Every template passes the same `validateDoc()` as a user file. Unit test iterates the registry.
- **Content quality bar:** realistic generic placeholder labels (`Customer`, `Order Service`, `Validate payment`), never lorem ipsum, never real company or product names. Laid out on the grid, consistent spacing, no overlapping labels, readable at 100% zoom after fit-to-content. Uses the app's default styles so it matches what users draw themselves.
- Nested templates must show a mapped port on at least one boundary-crossing edge, so the ghost link is visible inside the child.

---

## Catalogue

`★` = featured on the empty-canvas panel (six total). `⧉` = uses Nested Blocks.

### Batch T1 — infrastructure + starters
Everything under Placement, Apply flow and Template format, plus the stencil-coverage test, shipped with:
- ★ **Basic flowchart** — start, steps, a decision, end
- ★ ⧉ **Flowchart with subprocess** — the predefined-process step is a Nested Block holding its subprocess
- ★ **Mind map**

### Batch T2 — Software & UML
- **UML class diagram** — classes with attributes/operations, inheritance, association, composition
- **UML sequence diagram** — actor, lifelines, activation bars, sync/async/return messages
- **UML use case** — system boundary, actors, use cases, include/extend
- **UML activity** — initial/final nodes, actions, decision/merge, fork/join
- **UML state machine** — states, transitions with guards, initial/final
- **UML component** and **UML deployment**
- ★ ⧉ **C4 model** — Context diagram whose system is a Nested Block containing the Container diagram, whose main container is a Nested Block containing the Component diagram. Three real levels. This is the flagship software template.

### Batch T3 — Data
- **ER diagram, Chen notation**
- **ER diagram, crow's foot** — requires crow's-foot arrowheads in the Style panel first
- ★ ⧉ **Levelled DFD, Yourdon/DeMarco** — Level 0 context diagram; the main process is a Nested Block holding Level 1
- ⧉ **Levelled DFD, Gane & Sarson** — same structure, Gane-Sarson notation
- **Data pipeline** — sources, ingest, transform, store, serve

### Batch T4 — Architecture & Cloud
- **Network topology** — internet, firewall, router, switches, servers, endpoints
- ★ ⧉ **Azure hub-and-spoke landing zone** — hub VNet with firewall and gateway; each spoke VNet is a Nested Block holding its workload
- **AWS three-tier web app**
- **GCP basic web app**
- ⧉ **Kubernetes cluster** — namespaces as Nested Blocks. Only if an openly licensed Kubernetes icon set is added with proper NOTICE attribution; otherwise use generic shapes and drop the vendor icons.

### Batch T5 — Business & Process
- ⧉ **Org chart** — each department a Nested Block holding its team
- **Swimlane / cross-functional process**
- **BPMN (basic)** — pool, lanes, start/intermediate/end events, tasks, exclusive/parallel gateways
- **Fishbone (Ishikawa)**
- **SWOT**
- **Business model canvas**
- **Customer journey map**
- **Milestone timeline** — evenly spaced milestones, not time-scaled

### Batch T6 — Thinking & Planning
- **Venn, two sets** and **Venn, three sets** — requires fill opacity on ellipses; verify the Style panel supports it, add it if not
- **Tree diagram**
- **Decision tree**
- **Concept map**
- **Sitemap**

---

## New stencil sections likely needed

Audit the library before each batch. Where a batch's notation is missing, add a section rather than scattering shapes:

- **DFD** — process (circle, Yourdon), process (rounded rectangle, Gane-Sarson), external entity, data store (open-ended rectangle)
- **BPMN** — events (start, intermediate, end), task, sub-process, gateways (exclusive, parallel, inclusive), pool, lane, data object
- **C4** — person, software system, container, component, external system, boundary
- **UML additions** as needed — lifeline, activation bar, fork/join bar, initial/final node, system boundary
- **Swimlane** pool/lane containers, if groups can't serve the purpose

Each new section follows the existing stencil architecture (lazy module, `StencilDef`, labels plus `keywords`), is hand-drawn original geometry, and is added to `More Shapes…`.

---

## Exclusions (recorded, not forgotten)

Out of scope for this feature, each for a stated reason:
- **Bar, pie, line, scatter and other data charts** — no chart data model; a "chart template" would be static shapes pretending to be data. Candidate for a separate, properly scoped chart feature.
- **Gantt and time-scaled timelines** — need a time axis the model doesn't have.
- **RACI and other matrix/table diagrams** — need a table primitive.
- **UI wireframes, floor plans, circuit and P&ID diagrams** — each needs a large specialist stencil set; candidates for future sections.

Add these to the PROGRESS.md Inbox as individual items so they stay visible.

---

## Acceptance (per batch)

- Every template in the batch validates, renders its thumbnail, and applies cleanly into an empty page and as a new page.
- Stencil-coverage test passes: no template references a stencil missing from, retired from, or hidden in the picker.
- Every new stencil is findable via sidebar search by its label and at least one keyword.
- Nested templates: drilling into every level works, and at least one ghost link renders in each child.
- Applying a template then Ctrl+Z restores the prior state exactly, including removing any child diagrams it created.
- E2E: apply from the sidebar tab, from the empty-canvas panel, and from the sample strip.
- No `formatVersion` change. If any template genuinely needs a new model field, stop and raise it.
- All strings read the product name from `BRAND`; `dd-` prefix on classes and test ids.
