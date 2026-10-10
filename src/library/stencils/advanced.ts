// Advanced: structure and annotation shapes — braces and brackets to group, a named frame, a
// titled box and a vertical swimlane (lines have their own section, lines.ts). Original SVG geometry,
// drawn for Nedito, not copied or traced from any other tool's stencils (see NOTICE).
//
// This section used to hold the less common flowchart symbols (delay, display, sort, …). They
// belong with the rest of ISO 5807 and moved to Flowchart; their old ids
// still draw, through RETIRED_STENCIL_IDS.
import type { StencilSection } from "./types";

const section: StencilSection = {
  id: "advanced",
  name: "Advanced",
  shapes: [
    {
      id: "advanced/brace-left",
      label: "Left Brace",
      keywords: ["brace", "curly bracket", "group", "annotation", "{"],
      defaultSize: { w: 40, h: 140 },
      svgBody: '<path d="M78,1 Q50,1 50,16 V40 Q50,50 22,50 Q50,50 50,60 V84 Q50,99 78,99" fill="none" />',
      defaultFill: "none",
    },
    {
      id: "advanced/brace-right",
      label: "Right Brace",
      keywords: ["brace", "curly bracket", "group", "annotation", "}"],
      defaultSize: { w: 40, h: 140 },
      svgBody: '<path d="M22,1 Q50,1 50,16 V40 Q50,50 78,50 Q50,50 50,60 V84 Q50,99 22,99" fill="none" />',
      defaultFill: "none",
    },
    {
      id: "advanced/bracket-left",
      label: "Left Bracket",
      keywords: ["bracket", "square bracket", "group", "["],
      defaultSize: { w: 30, h: 140 },
      svgBody: '<path d="M90,1 H30 V99 H90" fill="none" />',
      defaultFill: "none",
    },
    {
      id: "advanced/bracket-right",
      label: "Right Bracket",
      keywords: ["bracket", "square bracket", "group", "]"],
      defaultSize: { w: 30, h: 140 },
      svgBody: '<path d="M10,1 H70 V99 H10" fill="none" />',
      defaultFill: "none",
    },
    {
      id: "advanced/frame",
      label: "Frame",
      keywords: ["frame", "region", "scope", "diagram frame", "sd", "boundary", "container"],
      defaultSize: { w: 320, h: 220 },
      svgBody: '<rect x="1" y="1" width="98" height="98" /><path d="M1,14 H30 L35,8 V1" fill="none" />',
      // The name goes in the tab at the top-left, the way UML and SysML frames are named.
      defaultFill: "none",
      labelBox: { x: 0, y: 0, w: 34, h: 14 },
    },
    {
      id: "advanced/titled-box",
      label: "Titled Box",
      keywords: ["header", "title", "card", "panel", "section", "box with heading"],
      defaultSize: { w: 200, h: 140 },
      svgBody: '<rect x="1" y="1" width="98" height="98" /><line x1="1" y1="22" x2="99" y2="22" fill="none" />',
      // The title goes in the band; the body is left for what the box holds.
      labelBox: { x: 0, y: 0, w: 100, h: 22 },
    },
    {
      id: "advanced/swimlane-vertical",
      label: "Vertical Swimlane",
      keywords: ["swimlane", "lane", "column", "role", "responsibility", "kanban"],
      defaultSize: { w: 200, h: 420 },
      svgBody: '<rect x="1" y="1" width="98" height="98" /><line x1="1" y1="10" x2="99" y2="10" fill="none" />',
      defaultFill: "none",
      labelBox: { x: 0, y: 0, w: 100, h: 10 },
    },
  ],
};

export default section;
