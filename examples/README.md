# Examples

Real `.nedito` documents, committed so they can be opened, read and tested.

Open one with **File ▸ Open**, or drag it onto the app window.

| File | What it is | What it exercises |
|---|---|---|
| `azure-landing-zone.nedito` | An Azure landing zone | vendor icons, ports mapped across three nested blocks |
| `incident-runbook.nedito` | An on-call runbook | two pages, nesting two levels deep, waypoints, a group, a locked layer, styled labels, dashed edges, a deliberately unmapped port |
| `online-store-domain.nedito` | A store's domain model | UML inside bounded contexts, edges mapped through ports at **both** ends, UML line ends and crow's-foot cardinality together |

## Rebuilding them

Every example is generated, never hand-edited:

```bash
npx vite-node examples/build.ts
```

`vite-node` ships with Vitest, so this needs nothing beyond `npm install`. (This used to say
`npx tsx`, which is not a dependency of the project and would have been downloaded on the spot.)

Each builder only *describes* its document; `build.ts` validates and writes them all.
Builders use readable-but-format-legal ids — a slug padded to 21 characters with `_`, which is
in the nanoid alphabet — for every node, edge, port, diagram **and layer**, and one fixed date,
so rebuilding an unchanged example produces the committed file byte for byte.

That was claimed before it was true: the Azure builder's layers came from
`createDefaultLayers()`, which mints a fresh id each call, so every rebuild rewrote four ids.
`examples/examples.test.ts` now rebuilds every example and fails if the result differs from the
committed file by a single byte, alongside checking validity, port mappings and that every shape
is one the app still ships. `examples/` is also type-checked by `npx tsc -b` now; it was not.

To add one: write `build-<name>.ts` with a default-exported document, and add a line to
`catalogue.ts`.

---

## `azure-landing-zone.nedito`

An Azure landing zone: management groups, the subscriptions under them, what two of those
subscriptions contain, and the pipeline that creates new ones.

It exists because it is a good argument for nesting. The illustration this is modelled on draws
three **callout boxes** hanging off the subscription row — one showing what is inside the
Connectivity subscription, one showing what is inside A2, one showing the vending pipeline.
Callouts are what you draw when the page cannot go deeper. Here they are not callouts; they are
nested blocks you open.

### What is in it

| | |
|---|---|
| **Landing zone organization** | the page: tenant root → Contoso → Platform / Landing zones / Sandbox, the management groups beneath them, and the subscription row |
| **Connectivity subscription** | regional hub virtual network, Azure Firewall, VPN / ExpressRoute gateway, Azure Bastion |
| **A2 subscription** | the virtual network, plus its budget, role assignment, policy assignment, Network Watcher and Defender for Cloud |
| **Subscription vending automation** | data collection tool → request pipeline → source control → deployment pipeline, with the parameter file and IaC modules feeding in |

### The part worth opening

Two edges cross a nesting boundary, and both are mapped through **ports**:

- **Virtual network peering** — between the Connectivity and A2 blocks, mapped to the *Regional
  hub virtual network* on one side and the *Virtual network* on the other.
- **deploys** — from the vending automation's deployment pipeline into A2.

Because they are mapped rather than merely drawn between two boxes, they do not stop at the
boundary. Open the A2 subscription and both appear as ghost links on its canvas — one entering
from the hub, one from the automation — attached to the shape they actually connect to. That is
the difference between a line on a picture and a connection in a model.

### Icons


Microsoft's official Azure architecture icons, which ship with the app — see `NOTICE` at the
repository root for their source and terms. The diagram's *structure* is modelled on Microsoft's
published landing zone guidance; it is an illustration built with this app, not a Microsoft
document.

---

## `incident-runbook.nedito`

What an on-call engineer does when an alert fires, opened twice: **Triage** opens into
**Diagnose**, and Diagnose opens into **Database checks**. A second page, **Escalation**, sets
out who gets pulled in and when.

It is here to exercise the parts of the format nothing else touches, so a change that breaks
one of them fails on a real document rather than on someone's diagram:

- **Nesting two levels deep**, with the entry and exit mapped through ports at both levels —
  open Diagnose and the flow from Triage arrives as a ghost link on *Open service dashboards*.
- **Waypoints**, on two edges that have to route round a block instead of running behind it.
- **A group**: the two communication steps, which move together.
- **A locked layer**, *Annotations*, holding the runbook's ownership note.
- **One unmapped port.** Database checks has an *escalate* port with nothing inside it yet. That
  is a real, legal state, and it renders as the amber "waiting to be linked" marker, with its
  outgoing edge labelled *not linked yet*.

## `online-store-domain.nedito`

A small online store's domain, told twice. **Bounded contexts** shows Catalogue, Ordering and
Payments as nested blocks, each holding its UML class diagram. **Schema** shows the same
entities as crow's-foot tables.

The part worth opening is the link between contexts. *references by sku* runs from Ordering to
Catalogue, and it is mapped through a port at **both** ends: to *OrderLine* inside Ordering and to
*Product* inside Catalogue. Open either context and it appears as a ghost link on the class it
actually concerns, not on the context as a whole.
