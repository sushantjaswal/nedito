// Levelled data flow diagrams, in both dialects, built as real nesting.
//
// A DFD is *defined* by its levelling: the context diagram shows the system as a single process,
// and that process is then "exploded" into the Level 1 diagram. Every textbook draws these as
// two separate figures and asks the reader to remember that process 0 and the Level 1 page are
// the same thing — and levelling is the part students most often get wrong, precisely because
// the relationship is implied rather than shown.
//
// Here the process *is* the Level 1 diagram: one Nested Block, opened by clicking. The flows
// that crossed the context boundary become ports, so the same arrows appear inside the child as
// ghost links — which is exactly the "balancing" rule a DFD has to satisfy (a child diagram's
// external flows must match its parent process's flows). The structure enforces the rule.
//
// Both dialects share this structure and differ only in their glyphs, so they are built from
// one function. See dfd.ts for why the two shape sets are kept separate.
import type { DEdge, DNode, Diagram, NestedNode, StyleMap } from "../../model/types";
import { templateDoc, tid } from "../starters/basicFlowchart";
import { FLOW, FLOW_STRAIGHT, MUTED_FILL, link, node, page, type Side } from "./dataKit";

interface Dialect {
  /** Distinguishes every id in this dialect's copy, so the two templates never collide. */
  key: string;
  process: string;
  store: string;
  external: string;
  /** Gane & Sarson gives a store's id its own cell; Yourdon writes it before the name. */
  storeIdCell: boolean;
}

const NUMBER: StyleMap = { fill: "none", stroke: "none" };

/**
 * A process: its name in the body, its number in the band across the top — each its own text,
 * grouped so they move together. One label cannot sit on both sides of the band (the first
 * version's "1 / Receive / Order" ran straight across it).
 */
function process(d: Dialect, slug: string, num: string, name: string, x: number, y: number, z: number): DNode[] {
  const size = 140;
  const shape = node(slug, d.process, name, x, y, size, size, z);
  const band = 0.26 * size;
  const number = { ...node(`${slug}N`, "general/text", num, x + 20, y + 4, size - 40, band - 6, z + 1, NUMBER) };
  return [group(slug, [shape, number], x, y, size, size, z), shape, number];
}

/** A data store, its id in the left cell (Gane & Sarson) or before its name (Yourdon). */
function store(d: Dialect, slug: string, id: string, name: string, x: number, y: number, w: number, z: number): DNode[] {
  const h = 56;
  if (!d.storeIdCell) return [node(slug, d.store, `${id}   ${name}`, x, y, w, h, z)];
  const shape = node(slug, d.store, name, x, y, w, h, z);
  const cell = node(`${slug}N`, "general/text", id, x, y, 0.26 * w, h, z + 1, NUMBER);
  return [group(slug, [shape, cell], x, y, w, h, z), shape, cell];
}

function group(slug: string, members: DNode[], x: number, y: number, w: number, h: number, z: number): DNode {
  return { id: tid(`${slug}G`), type: "group", position: { x, y }, size: { w, h }, z: z - 1, style: {}, childIds: members.map((m) => m.id) };
}

const YOURDON: Dialect = {
  key: "y",
  process: "dfd/process",
  store: "dfd/data-store",
  external: "dfd/external-entity",
  storeIdCell: false,
};

const GANE_SARSON: Dialect = {
  key: "g",
  process: "dfd/process-gs",
  store: "dfd/data-store-gs",
  external: "dfd/external-entity-gs",
  storeIdCell: true,
};

function build(d: Dialect) {
  const k = (slug: string) => `${d.key}${slug}`;

  // ---------------------------------------------------------------- Level 1 (the child)
  //
  // The processes read left to right in the order the work happens; the store each one writes
  // or reads sits directly above or below it, so no flow crosses a process. In a DFD that is not
  // merely tidiness: a line touching a process reads as a flow into it.
  const level1: Diagram = page(
    k("dDfd1"),
    "Order System",
    [
      ...process(d, k("p1"), "1", "Receive order", 60, 220, 1),
      ...process(d, k("p2"), "2", "Check stock", 320, 220, 4),
      ...process(d, k("p3"), "3", "Take payment", 580, 220, 7),
      ...process(d, k("p4"), "4", "Despatch order", 840, 220, 10),
      ...store(d, k("s2"), "D2", "Stock", 290, 40, 200, 13),
      ...store(d, k("s1"), "D1", "Orders", 300, 560, 440, 16),
    ],
    [
      link(k("f1"), k("p1"), k("s1"), FLOW, "order record", ["bottom", "left"]),
      link(k("f2"), k("p1"), k("p2"), FLOW, "order lines", ["right", "left"]),
      link(k("f3"), k("s2"), k("p2"), FLOW, "stock level", ["bottom", "top"]),
      link(k("f4"), k("p2"), k("p3"), FLOW, "priced order", ["right", "left"]),
      link(k("f5"), k("p3"), k("p4"), FLOW, "paid order", ["right", "left"]),
      link(k("f6"), k("s1"), k("p4"), FLOW, "order record", ["right", "bottom"]),
    ],
  );

  // ---------------------------------------------------------------- Level 0 (the context)
  //
  // Ports, not plain edges: each one maps to the Level 1 process that actually handles that
  // flow, which is what makes the two levels balance rather than merely look similar.
  const system: NestedNode = {
    id: tid(k("sys")),
    type: "nested",
    childDiagramId: level1.id,
    position: { x: 350, y: 180 },
    size: { w: 260, h: 150 },
    z: 3,
    style: {},
    label: { text: "0   Order System", align: "center" },
    collapsed: { icons: [], summary: "receive · check · pay · despatch" },
    ports: [
      { id: tid(k("po1")), side: "left", offset: 0.5, innerNodeId: tid(k("p1")), label: "order" },
      { id: tid(k("po2")), side: "bottom", offset: 0.5, innerNodeId: tid(k("p3")), label: "payment" },
      { id: tid(k("po3")), side: "right", offset: 0.5, innerNodeId: tid(k("p4")), label: "despatch note" },
    ],
  };

  const externals: DNode[] = [
    node(k("e1"), d.external, "Customer", 60, 205, 160, 100, 1, MUTED_FILL),
    node(k("e2"), d.external, "Payment\nProvider", 400, 450, 160, 100, 2, MUTED_FILL),
    node(k("e3"), d.external, "Warehouse", 740, 205, 160, 100, 4, MUTED_FILL),
  ];

  // A port carries its own handle, but the external entity at the other end does not: left
  // unset it would anchor at that shape's top and the flow would loop over its head. So both
  // ends are named (see dataKit's link()).
  const boundaryEdge = (
    slug: string,
    from: { nodeId: string; portId?: string },
    to: { nodeId: string; portId?: string },
    text: string,
    sides: [Side, Side],
  ): DEdge => ({
    id: tid(k(slug)),
    source: from,
    target: to,
    style: { ...FLOW_STRAIGHT, sourceHandle: sides[0], targetHandle: sides[1] },
    label: { text, fontSize: 10, color: "#66707D" },
  });

  const level0: Diagram = page(
    k("dDfd0"),
    "Context diagram",
    [...externals, system],
    [
      boundaryEdge("c1", { nodeId: tid(k("e1")) }, { nodeId: system.id, portId: tid(k("po1")) }, "order", [
        "right",
        "left",
      ]),
      boundaryEdge("c2", { nodeId: system.id, portId: tid(k("po2")) }, { nodeId: tid(k("e2")) }, "payment request", [
        "bottom",
        "top",
      ]),
      boundaryEdge("c3", { nodeId: system.id, portId: tid(k("po3")) }, { nodeId: tid(k("e3")) }, "despatch note", [
        "right",
        "left",
      ]),
    ],
  );

  return [level0, level1];
}

export const yourdonPages = build(YOURDON);
export const ganeSarsonPages = build(GANE_SARSON);

export const yourdonTemplate = templateDoc("Context diagram", yourdonPages);
export const ganeSarsonTemplate = templateDoc("Context diagram", ganeSarsonPages);
