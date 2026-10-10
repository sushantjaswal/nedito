// Data flow diagram notation, in both of the two dialects people actually draw.
//
// A DFD has only four vocabulary items — process, data store, external entity, data flow — but
// two incompatible sets of glyphs for them, and mixing the two is the classic tell of a diagram
// drawn by someone who had not read either book:
//
//   Yourdon / DeMarco   process = circle, data store = two open parallel lines
//   Gane & Sarson       process = rounded box with an id band, data store = open box with an
//                       id cell, external entity = square with a drop shadow
//
// So each dialect gets its own shapes rather than one "process" that has to be restyled. The
// labels say which dialect a shape belongs to, and the keywords carry both the dialect name and
// the author names, because people search for whichever they were taught.
//
// Data flow itself is an edge, not a shape — it is drawn with the Style panel's arrowheads.
//
// Original SVG geometry, drawn for Nedito, not copied or traced from any other tool's stencils (see NOTICE).
import type { StencilSection } from "./types";

const section: StencilSection = {
  id: "dfd",
  name: "Data Flow (DFD)",
  shapes: [
    // ---------------------------------------------------------------- Yourdon / DeMarco
    {
      id: "dfd/process",
      label: "Process (Yourdon)",
      defaultSize: { w: 120, h: 120 },
      keywords: ["dfd", "data flow", "yourdon", "demarco", "bubble", "circle", "transform", "function"],
      // A plain circle with a band across the top for the process number (1.0, 2.1, …).
      // The band is a chord, and its ends sit exactly on the circle: x = 50 ± sqrt(48² - 24²).
      svgBody: '<circle cx="50" cy="50" r="48" /><line x1="8.4" y1="26" x2="91.6" y2="26" fill="none" />',
      // The name goes below the number band.
      labelBox: { x: 10, y: 26, w: 80, h: 62 },
    },
    {
      id: "dfd/data-store",
      label: "Data Store (Yourdon)",
      defaultSize: { w: 180, h: 60 },
      keywords: ["dfd", "data flow", "yourdon", "demarco", "store", "file", "database", "table", "open box"],
      // Two parallel rules, open at both ends — the whole point is that it is not a closed box.
      svgBody: '<path d="M0,18 H100 M0,82 H100" fill="none" />',
    },
    {
      id: "dfd/external-entity",
      label: "External Entity (Yourdon)",
      defaultSize: { w: 140, h: 80 },
      keywords: ["dfd", "data flow", "yourdon", "demarco", "terminator", "source", "sink", "actor", "outside"],
      svgBody: '<rect x="1" y="1" width="98" height="98" />',
    },

    // ---------------------------------------------------------------- Gane & Sarson
    {
      id: "dfd/process-gs",
      label: "Process (Gane & Sarson)",
      defaultSize: { w: 160, h: 100 },
      keywords: ["dfd", "data flow", "gane", "sarson", "process", "transform", "function", "rounded"],
      // Rounded box with an id band across the top.
      svgBody:
        '<rect x="1" y="1" width="98" height="98" rx="12" /><line x1="1" y1="26" x2="99" y2="26" fill="none" />',
      labelBox: { x: 0, y: 26, w: 100, h: 74 },
    },
    {
      id: "dfd/data-store-gs",
      label: "Data Store (Gane & Sarson)",
      defaultSize: { w: 180, h: 60 },
      keywords: ["dfd", "data flow", "gane", "sarson", "store", "file", "database", "table"],
      // Open on the right, with a cell on the left for the store's id (D1, D2, …).
      svgBody: '<path d="M100,1 H1 V99 H100" fill="none" /><line x1="26" y1="1" x2="26" y2="99" fill="none" />',
      labelBox: { x: 26, y: 0, w: 74, h: 100 },
    },
    {
      id: "dfd/external-entity-gs",
      label: "External Entity (Gane & Sarson)",
      defaultSize: { w: 140, h: 90 },
      keywords: ["dfd", "data flow", "gane", "sarson", "terminator", "source", "sink", "actor", "shadow", "outside"],
      // The drop shadow is the Gane & Sarson tell. Drawn as an offset outline behind the box so
      // it takes the shape's own stroke colour rather than a hardcoded grey.
      svgBody: '<path d="M8,10 H99 V99 H8 Z" /><rect x="1" y="1" width="91" height="89" />',
      labelBox: { x: 0, y: 0, w: 92, h: 90 },
    },
  ],
};

export default section;
