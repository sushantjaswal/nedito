// Standard ISO/ANSI flowchart symbols (process, decision, terminator, document, predefined
// process, data) — generic diagramming vocabulary, not vendor-owned; original SVG geometry
// per CLAUDE.md's provenance guardrail.
import type { StencilSection } from "./types";

const section: StencilSection = {
  id: "flowchart",
  name: "Flowchart",
  shapes: [
    {
      id: "flowchart/process",
      keywords: ["flowchart", "step", "action", "activity", "task", "rectangle", "do"],
      label: "Process",
      defaultSize: { w: 120, h: 60 },
      svgBody: '<rect x="1" y="1" width="98" height="98" />',
    },
    {
      id: "flowchart/decision",
      keywords: ["flowchart", "if", "branch", "condition", "yes no", "choice", "diamond"],
      label: "Decision",
      defaultSize: { w: 120, h: 80 },
      svgBody: '<polygon points="50,2 98,50 50,98 2,50" />',
    },
    {
      id: "flowchart/terminator",
      keywords: ["flowchart", "start", "end", "begin", "stop", "stadium", "pill"],
      label: "Terminator",
      defaultSize: { w: 120, h: 60 },
      svgBody: '<rect x="1" y="15" width="98" height="70" rx="35" ry="35" />',
    },
    {
      id: "flowchart/document",
      keywords: ["flowchart", "report", "printout", "paper", "output"],
      label: "Document",
      defaultSize: { w: 120, h: 80 },
      svgBody: '<path d="M1,1 H99 V78 Q75,95 50,78 Q25,61 1,78 Z" />',
    },
    {
      id: "flowchart/predefined-process",
      keywords: ["flowchart", "subroutine", "subprocess", "call", "function", "drill down"],
      label: "Predefined Process",
      defaultSize: { w: 120, h: 60 },
      svgBody: '<rect x="1" y="1" width="98" height="98" /><line x1="15" y1="1" x2="15" y2="99" fill="none" /><line x1="85" y1="1" x2="85" y2="99" fill="none" />',
    },
    {
      id: "flowchart/data",
      keywords: ["flowchart", "input", "output", "io", "parallelogram"],
      label: "Data",
      defaultSize: { w: 120, h: 70 },
      svgBody: '<polygon points="20,1 99,1 80,99 1,99" />',
    },
    {
      id: "flowchart/manual-input",
      keywords: ["flowchart", "keyboard", "type", "entry", "user input"],
      label: "Manual Input",
      defaultSize: { w: 110, h: 70 },
      svgBody: '<path d="M1,25 L99,1 V99 H1 Z" />',
    },
    {
      id: "flowchart/preparation",
      keywords: ["flowchart", "setup", "initialise", "loop", "hexagon"],
      label: "Preparation",
      defaultSize: { w: 110, h: 90 },
      svgBody: '<polygon points="20,2 80,2 98,50 80,98 20,98 2,50" />',
    },
    {
      id: "flowchart/database",
      keywords: ["flowchart", "storage", "store", "db", "cylinder", "disk"],
      label: "Database",
      defaultSize: { w: 90, h: 90 },
      svgBody: '<path d="M10,18 A40,13 0 1 1 90,18 A40,13 0 1 1 10,18 Z M10,18 V82 A40,13 0 0 0 90,82 V18" />',
    },
    {
      id: "flowchart/internal-storage",
      keywords: ["flowchart", "memory", "cache", "working storage"],
      label: "Internal Storage",
      defaultSize: { w: 90, h: 90 },
      svgBody: '<rect x="1" y="1" width="98" height="98" /><line x1="15" y1="1" x2="15" y2="99" fill="none" /><line x1="1" y1="15" x2="99" y2="15" fill="none" />',
    },
    {
      id: "flowchart/multi-document",
      keywords: ["flowchart", "documents", "reports", "stack", "copies"],
      label: "Multi-Document",
      defaultSize: { w: 120, h: 90 },
      svgBody:
        '<path d="M11,11 H89 V70 Q70,82 50,70 Q30,58 11,70 Z" fill-opacity="0.5" /><path d="M6,6 H84 V65 Q65,77 45,65 Q25,53 6,65 Z" fill-opacity="0.75" /><path d="M1,1 H79 V60 Q60,72 40,60 Q20,48 1,60 Z" />',
    },
    {
      // The standard open-bracket "annotation/comment" flowchart symbol, used to attach a note
      // to another shape without implying flow.
      id: "flowchart/annotation",
      keywords: ["flowchart", "comment", "note", "aside", "bracket"],
      label: "Annotation",
      defaultSize: { w: 60, h: 90 },
      svgBody: '<path d="M40,1 H10 V99 H40" fill="none" />',
    },
    {
      id: "flowchart/manual-operation",
      label: "Manual Operation",
      keywords: ["manual step", "human task", "offline task", "trapezoid"],
      defaultSize: { w: 110, h: 70 },
      svgBody: '<polygon points="2,2 98,2 80,98 20,98" />',
    },
    {
      // A flat-sided rectangle with a semicircular right end — the standard "D-shape". Uses an
      // elliptical (not circular) arc so the flat portion stays visually dominant at any
      // reasonable aspect ratio, instead of reading as a plain half-circle blob.
      id: "flowchart/delay",
      label: "Delay",
      keywords: ["wait", "pause", "hold", "timer", "d shape"],
      defaultSize: { w: 120, h: 80 },
      svgBody: '<path d="M1,1 H65 A34,49 0 0 1 65,99 H1 Z" />',
    },
    {
      // Flat top/right/bottom with a concave (inward-curving) left edge — the classic
      // "screen/monitor" flowchart Display symbol.
      id: "flowchart/display",
      label: "Display",
      keywords: ["screen", "output", "show", "monitor"],
      defaultSize: { w: 120, h: 80 },
      svgBody: '<path d="M20,1 H65 A34,49 0 0 1 65,99 H20 Q1,50 20,1 Z" />',
    },
    {
      id: "flowchart/off-page-connector",
      label: "Off-Page Connector",
      keywords: ["continued on next page", "page reference", "go to page", "pentagon"],
      defaultSize: { w: 100, h: 100 },
      svgBody: '<polygon points="1,1 99,1 99,70 50,99 1,70" />',
    },
    {
      // Distinct from Off-Page Connector: on-page connectors between flowline segments on the
      // same page are a plain circle (draw.io/ANSI convention); the inner ring gives it a
      // "target" look that reads clearly at small sidebar sizes.
      id: "flowchart/on-page-connector",
      label: "On-Page Connector",
      keywords: ["connector", "jump", "continuation", "reference circle"],
      defaultSize: { w: 90, h: 90 },
      svgBody: '<circle cx="50" cy="50" r="45" /><circle cx="50" cy="50" r="26" fill="none" />',
    },
    {
      id: "flowchart/stored-data",
      label: "Stored Data",
      keywords: ["storage", "data store", "save", "file"],
      defaultSize: { w: 110, h: 100 },
      svgBody: '<path d="M20,1 H99 V99 H20 Q1,50 20,1 Z" />',
    },
    {
      id: "flowchart/sort",
      label: "Sort",
      keywords: ["order", "arrange", "ranking"],
      defaultSize: { w: 100, h: 100 },
      svgBody: '<path d="M50,2 98,50 50,98 2,50 Z M2,50 H98" fill-opacity="0.9" />',
    },
    {
      id: "flowchart/collate",
      label: "Collate",
      keywords: ["gather", "assemble", "hourglass"],
      defaultSize: { w: 100, h: 100 },
      svgBody: '<polygon points="1,1 99,1 20,50 99,99 1,99 80,50" />',
    },
    {
      id: "flowchart/merge",
      label: "Merge",
      keywords: ["combine", "join", "consolidate", "triangle"],
      defaultSize: { w: 100, h: 80 },
      svgBody: '<polygon points="2,2 98,2 50,98" />',
    },
    {
      id: "flowchart/extract",
      label: "Extract",
      keywords: ["split", "separate", "filter", "select"],
      defaultSize: { w: 100, h: 80 },
      svgBody: '<polygon points="50,2 98,98 2,98" />',
    },
    {
      id: "flowchart/summing-junction",
      label: "Summing Junction",
      keywords: ["sum", "add", "total", "or junction"],
      defaultSize: { w: 90, h: 90 },
      svgBody: '<circle cx="50" cy="50" r="48" /><line x1="50" y1="10" x2="50" y2="90" fill="none" /><line x1="10" y1="50" x2="90" y2="50" fill="none" />',
    },
    {
      // Marks the boundary of a repeated block — chamfered top corners, standard ANSI Loop
      // Limit symbol.
      id: "flowchart/loop-limit",
      label: "Loop Limit",
      keywords: ["loop", "repeat", "for each", "while", "iteration"],
      defaultSize: { w: 110, h: 90 },
      svgBody: '<polygon points="20,1 80,1 99,20 99,99 1,99 1,20" />',
    },
    {
      id: "flowchart/parallel-mode",
      label: "Parallel Mode",
      keywords: ["concurrent", "simultaneous", "fork", "synchronisation", "synchronization"],
      defaultSize: { w: 100, h: 90 },
      svgBody: '<rect x="1" y="18" width="98" height="16" /><rect x="1" y="66" width="98" height="16" />',
    },

    // The rest of the ISO 5807 set, as draw.io's Flowchart section carries it.
    {
      id: "flowchart/paper-tape",
      label: "Paper Tape",
      keywords: ["flowchart", "punched tape", "tape", "input", "output"],
      defaultSize: { w: 140, h: 70 },
      svgBody: '<path d="M1,14 Q25,0 50,14 T99,14 V86 Q75,100 50,86 T1,86 Z" />',
    },
    {
      id: "flowchart/direct-access-storage",
      label: "Direct Access Storage",
      keywords: ["flowchart", "disk", "hard drive", "drum", "storage", "horizontal cylinder"],
      defaultSize: { w: 140, h: 70 },
      svgBody: '<path d="M14,1 H86 A13,49 0 0 1 86,99 H14 A13,49 0 0 1 14,1 Z" /><path d="M86,1 A13,49 0 0 0 86,99" fill="none" />',
      labelBox: { x: 2, y: 0, w: 82, h: 100 },
    },
    {
      id: "flowchart/sequential-data",
      label: "Sequential Data",
      keywords: ["flowchart", "magnetic tape", "sequential access", "tape drive"],
      defaultSize: { w: 80, h: 80 },
      svgBody: '<circle cx="50" cy="50" r="48" /><line x1="50" y1="98" x2="99" y2="98" fill="none" />',
    },
    {
      id: "flowchart/or",
      label: "Or",
      keywords: ["flowchart", "logical or", "junction", "either"],
      defaultSize: { w: 60, h: 60 },
      svgBody: '<circle cx="50" cy="50" r="48" /><path d="M16,16 L84,84 M84,16 L16,84" fill="none" />',
    },
  ],
};

export default section;
