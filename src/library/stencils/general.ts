import type { StencilSection } from "./types";

// General is the first, default-open section — draw.io's own General palette is a broad set
// of common structural shapes (rectangle, ellipse, basic polygons, ...), not app-UI pictograms.
// An earlier pass (see CLAUDE_HISTORY.md D22) added ~16 Material Symbols icons here (Cancel,
// Check Circle, Grid View, Table Chart, ...) that are plain UI chrome, not diagramming shapes —
// removed per user feedback ("why do we need check circles here... we need correct icons").
// Square/Circle/Triangle/Half Circle were specifically called out as missing basics that
// belong in a user's first, default-open section rather than buried in a separate Basic tab
// they may not think to open; Parallelogram/Hexagon/Cylinder/Cross round out the same "common
// shapes at a glance" goal. All original SVG geometry per CLAUDE.md's provenance guardrail.
const section: StencilSection = {
  id: "general",
  name: "General",
  shapes: [
    {
      id: "general/rect",
      keywords: ["box", "block", "process", "step", "node"],
      label: "Rectangle",
      defaultSize: { w: 120, h: 60 },
      svgBody: '<rect x="1" y="1" width="98" height="98" />',
    },
    {
      id: "general/rounded-rect",
      keywords: ["pill", "button", "card", "soft box", "step"],
      label: "Rounded Rectangle",
      defaultSize: { w: 120, h: 60 },
      svgBody: '<rect x="1" y="1" width="98" height="98" rx="12" ry="12" />',
      // Nedito's look (R6): rounder, ~10px at the default 120×60 where the classic is ~7px.
      lookBody: '<rect x="1" y="1" width="98" height="98" rx="17" ry="17" />',
    },
    {
      id: "general/ellipse",
      keywords: ["oval", "venn", "set", "bubble", "blob"],
      label: "Ellipse",
      defaultSize: { w: 120, h: 80 },
      svgBody: '<ellipse cx="50" cy="50" rx="49" ry="49" />',
    },
    {
      id: "general/square",
      keywords: ["box", "tile", "block"],
      label: "Square",
      defaultSize: { w: 90, h: 90 },
      svgBody: '<rect x="1" y="1" width="98" height="98" />',
    },
    {
      id: "general/circle",
      keywords: ["round", "dot", "node", "bubble", "disc"],
      label: "Circle",
      defaultSize: { w: 90, h: 90 },
      svgBody: '<circle cx="50" cy="50" r="49" />',
    },
    {
      id: "general/triangle",
      keywords: ["warning", "pyramid", "delta", "up"],
      label: "Triangle",
      defaultSize: { w: 100, h: 90 },
      svgBody: '<polygon points="50,2 98,98 2,98" />',
    },
    {
      id: "general/half-circle",
      keywords: ["semicircle", "arch", "dome", "gauge"],
      label: "Half Circle",
      defaultSize: { w: 100, h: 55 },
      svgBody: '<path d="M2,98 A48,48 0 0 1 98,98 Z" />',
    },
    {
      id: "general/diamond",
      keywords: ["decision", "rhombus", "choice", "if", "gateway"],
      label: "Diamond",
      defaultSize: { w: 120, h: 80 },
      svgBody: '<polygon points="50,2 98,50 50,98 2,50" />',
    },
    {
      id: "general/parallelogram",
      keywords: ["input", "output", "io", "data", "slanted"],
      label: "Parallelogram",
      defaultSize: { w: 120, h: 60 },
      svgBody: '<polygon points="25,2 98,2 75,98 2,98" />',
    },
    {
      id: "general/hexagon",
      keywords: ["honeycomb", "cell", "preparation", "badge"],
      label: "Hexagon",
      defaultSize: { w: 120, h: 90 },
      svgBody: '<polygon points="25,2 75,2 98,50 75,98 25,98 2,50" />',
    },
    {
      id: "general/cylinder",
      keywords: ["database", "db", "storage", "store", "disk", "data"],
      label: "Cylinder",
      defaultSize: { w: 90, h: 90 },
      svgBody: '<path d="M10,18 V82 A40,13 0 0 0 90,82 V18" /><ellipse cx="50" cy="18" rx="40" ry="13" />',
      // The name sits in the body, under the lid.
      labelBox: { x: 10, y: 31, w: 80, h: 60 },
    },
    {
      id: "general/cross",
      keywords: ["plus", "add", "health", "junction"],
      label: "Cross",
      defaultSize: { w: 90, h: 90 },
      svgBody: '<polygon points="35,1 65,1 65,35 99,35 99,65 65,65 65,99 35,99 35,65 1,65 1,35 35,35" />',
    },
    {
      id: "general/text",
      keywords: ["label", "caption", "title", "heading", "words", "free text"],
      label: "Text",
      defaultSize: { w: 80, h: 30 },
      svgBody: '<rect x="0" y="0" width="100" height="100" fill="none" stroke="none" />',
    },
    {
      id: "general/note",
      keywords: ["sticky", "post-it", "comment", "memo", "annotation"],
      label: "Note",
      defaultSize: { w: 100, h: 100 },
      svgBody:
        '<path d="M1,1 H80 L99,20 V99 H1 Z" /><path d="M80,1 V20 H99 Z" fill-opacity="0.4" stroke-opacity="0.6" />',
    },
    {
      // Placing this creates a NestedNode + empty child diagram, not a plain shape — see
      // ShapeLibrary's special-case handling and DiagramCanvas's onDrop.
      id: "general/nested",
      keywords: ["drill down", "zoom in", "subprocess", "sub-diagram", "child diagram", "expand", "container", "level", "hierarchy"],
      label: "Nested Block",
      defaultSize: { w: 200, h: 140 },
      svgBody:
        '<rect x="10" y="10" width="80" height="80" rx="10" fill-opacity="0.35" stroke-opacity="0.5" /><rect x="5" y="5" width="80" height="80" rx="10" fill-opacity="0.6" stroke-opacity="0.75" /><rect x="0" y="0" width="80" height="80" rx="10" />',
    },
  ],
};

export default section;
