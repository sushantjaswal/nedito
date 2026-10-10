// C4 model notation (Simon Brown's C4: Context, Container, Component, Code).
//
// C4 is a published, openly documented notation, not a vendor format — and deliberately a thin
// one: its shapes are plain boxes distinguished by their *label*, not by geometry. What the
// shapes below add is the structure C4 actually specifies — a name line, a bracketed type line
// and a description line — drawn as the divider rules that suggest it, so a user dropping one
// on the canvas gets a box already shaped like a C4 element.
//
// Original SVG geometry, drawn for Nedito, not copied or traced from any other tool's stencils (see NOTICE). Every shape carries keywords, so
// a search for "person", "actor" or "boundary" finds the right one.
import type { StencilSection } from "./types";

const section: StencilSection = {
  id: "c4",
  name: "C4",
  shapes: [
    {
      id: "c4/person",
      label: "Person",
      defaultSize: { w: 120, h: 140 },
      keywords: ["c4", "user", "actor", "customer", "role", "human"],
      // A head over a rounded body: the one C4 element with a distinct silhouette.
      svgBody:
        '<circle cx="50" cy="22" r="16" /><path d="M14,48 h72 a6,6 0 0 1 6,6 v39 a6,6 0 0 1 -6,6 h-72 a6,6 0 0 1 -6,-6 v-39 a6,6 0 0 1 6,-6 z" />',
      labelBox: { x: 8, y: 48, w: 84, h: 51 },
    },
    {
      id: "c4/software-system",
      label: "Software System",
      defaultSize: { w: 170, h: 120 },
      keywords: ["c4", "system", "context", "application"],
      svgBody: '<rect x="1" y="1" width="98" height="98" rx="5" />',
    },
    {
      id: "c4/external-system",
      label: "External System",
      defaultSize: { w: 170, h: 120 },
      keywords: ["c4", "third party", "external", "outside", "dependency"],
      // Dashed border is the convention for something outside the system being described.
      svgBody:
        '<rect x="1" y="1" width="98" height="98" rx="5" stroke-dasharray="6 4" />',
    },
    {
      id: "c4/container",
      label: "Container",
      defaultSize: { w: 170, h: 120 },
      keywords: ["c4", "service", "application", "database", "deployable", "runtime"],
      svgBody: '<rect x="1" y="1" width="98" height="98" rx="5" />',
    },
    {
      id: "c4/component",
      label: "Component",
      defaultSize: { w: 160, h: 110 },
      keywords: ["c4", "module", "class group", "internal"],
      svgBody: '<rect x="1" y="1" width="98" height="98" rx="4" />',
    },
    {
      id: "c4/boundary",
      label: "Boundary",
      defaultSize: { w: 300, h: 220 },
      keywords: ["c4", "system boundary", "enterprise", "group", "container boundary", "scope"],
      // A dashed container the other elements sit inside. No fill divider: it is a region.
      svgBody: '<rect x="1" y="1" width="98" height="98" rx="3" stroke-dasharray="7 5" />',
      defaultFill: "none",
    },
    {
      id: "c4/database",
      label: "Database",
      keywords: ["c4", "database", "data store", "container", "cylinder", "sql"],
      defaultSize: { w: 170, h: 120 },
      svgBody: '<path d="M2,12 V88 A48,11 0 0 0 98,88 V12" /><ellipse cx="50" cy="12" rx="48" ry="11" />',
      labelBox: { x: 2, y: 24, w: 96, h: 70 },
    },
    {
      id: "c4/queue",
      label: "Message Queue",
      keywords: ["c4", "queue", "message bus", "topic", "kafka", "event stream", "pipe"],
      defaultSize: { w: 200, h: 90 },
      svgBody: '<path d="M10,2 H90 A9,48 0 0 1 90,98 H10 A9,48 0 0 1 10,2 Z" /><path d="M90,2 A9,48 0 0 0 90,98" fill="none" />',
      labelBox: { x: 2, y: 0, w: 84, h: 100 },
    },
  ],
};

export default section;
