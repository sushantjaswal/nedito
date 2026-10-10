// Standard UML notation shapes (class, actor, package, component, etc.) — UML is a published
// open standard (OMG), not vendor-owned. Original SVG geometry per CLAUDE.md's provenance
// guardrail.
import type { StencilSection } from "./types";

const section: StencilSection = {
  id: "uml",
  name: "UML",
  shapes: [
    {
      id: "uml/class",
      keywords: ["uml", "class diagram", "type", "attributes", "operations"],
      label: "Class",
      defaultSize: { w: 110, h: 110 },
      svgBody: '<rect x="1" y="1" width="98" height="98" /><line x1="1" y1="30" x2="99" y2="30" fill="none" /><line x1="1" y1="65" x2="99" y2="65" fill="none" />',
      // The class name goes in the top compartment.
      labelBox: { x: 0, y: 0, w: 100, h: 30 },
    },
    {
      id: "uml/interface",
      keywords: ["uml", "lollipop", "provided", "contract", "api"],
      label: "Interface",
      defaultSize: { w: 80, h: 100 },
      svgBody: '<circle cx="50" cy="30" r="20" /><line x1="50" y1="50" x2="50" y2="99" fill="none" />',
      labelBox: { x: -100, y: -28, w: 300, h: 28 },
    },
    {
      id: "uml/actor",
      keywords: ["uml", "user", "person", "stick figure", "role", "use case"],
      label: "Actor",
      defaultSize: { w: 70, h: 100 },
      svgBody:
        '<circle cx="50" cy="15" r="13" /><line x1="50" y1="28" x2="50" y2="65" fill="none" /><line x1="20" y1="40" x2="80" y2="40" fill="none" /><line x1="50" y1="65" x2="25" y2="99" fill="none" /><line x1="50" y1="65" x2="75" y2="99" fill="none" />',
      // The name goes under the figure, as UML draws it.
      labelBox: "below",
    },
    {
      id: "uml/object",
      keywords: ["uml", "instance", "object diagram"],
      label: "Object",
      defaultSize: { w: 110, h: 70 },
      // The instance name is underlined; the rule sits just under a centred one-line name.
      svgBody: '<rect x="1" y="1" width="98" height="98" /><line x1="22" y1="66" x2="78" y2="66" fill="none" />',
    },
    {
      id: "uml/package",
      keywords: ["uml", "namespace", "folder", "module", "grouping"],
      label: "Package",
      defaultSize: { w: 110, h: 100 },
      svgBody: '<rect x="1" y="15" width="98" height="84" /><path d="M1,15 V3 H35 L42,15" fill-opacity="0.6" />',
      labelBox: { x: 0, y: 15, w: 100, h: 85 },
    },
    {
      id: "uml/component",
      keywords: ["uml", "module", "service", "deployment"],
      label: "Component",
      defaultSize: { w: 110, h: 100 },
      svgBody: '<rect x="10" y="1" width="89" height="98" /><rect x="1" y="20" width="18" height="14" /><rect x="1" y="62" width="18" height="14" />',
      labelBox: { x: 19, y: 0, w: 81, h: 100 },
    },
    {
      id: "uml/use-case",
      keywords: ["uml", "use case diagram", "oval", "scenario", "goal"],
      label: "Use Case",
      defaultSize: { w: 130, h: 90 },
      svgBody: '<ellipse cx="50" cy="50" rx="49" ry="49" />',
    },
    {
      id: "uml/lifeline",
      keywords: ["uml", "sequence diagram", "participant", "timeline"],
      label: "Lifeline",
      defaultSize: { w: 140, h: 400 },
      svgBody: '<rect x="1" y="1" width="98" height="10" /><line x1="50" y1="11" x2="50" y2="99" stroke-dasharray="4,4" fill="none" />',
      // The participant's name goes in its head box.
      labelBox: { x: 0, y: 0, w: 100, h: 11 },
    },
    {
      // "Socket" notation: a required interface, the crescent counterpart to Interface's
      // "lollipop" (provided interface).
      id: "uml/required-interface",
      keywords: ["uml", "socket", "consumed", "dependency"],
      label: "Required Interface",
      defaultSize: { w: 80, h: 100 },
      svgBody: '<path d="M30,20 A20,20 0 0 1 30,60" fill="none" /><line x1="50" y1="40" x2="50" y2="99" fill="none" />',
      labelBox: "below",
    },
    {
      id: "uml/note",
      keywords: ["uml", "comment", "annotation", "callout"],
      label: "Note",
      defaultSize: { w: 100, h: 100 },
      svgBody:
        '<path d="M1,1 H80 L99,20 V99 H1 Z" /><path d="M80,1 V20 H99 Z" fill-opacity="0.4" stroke-opacity="0.6" />',
    },
    {
      id: "uml/state",
      keywords: ["uml", "state machine", "statechart", "status"],
      label: "State",
      defaultSize: { w: 120, h: 70 },
      // A simple state: a rounded box with its name. (A divider belongs only to a state with
      // internal activities, which a single label cannot fill.)
      svgBody: '<rect x="1" y="1" width="98" height="98" rx="20" ry="20" />',
    },
    {
      id: "uml/initial-node",
      keywords: ["uml", "start", "activity diagram", "begin", "entry"],
      label: "Initial Node",
      defaultSize: { w: 60, h: 60 },
      svgBody: '<circle cx="50" cy="50" r="45" />',
      // UML's initial node is a solid dot.
      defaultFill: "#1e2733",
    },
    {
      id: "uml/final-node",
      keywords: ["uml", "end", "activity diagram", "stop", "exit"],
      label: "Final Node",
      defaultSize: { w: 60, h: 60 },
      svgBody: '<circle cx="50" cy="50" r="45" fill="none" /><circle cx="50" cy="50" r="30" />',
      defaultFill: "#1e2733",
    },
    {
      id: "uml/fork-join",
      keywords: ["uml", "parallel", "concurrency", "synchronisation", "bar"],
      label: "Fork/Join",
      defaultSize: { w: 30, h: 110 },
      svgBody: '<rect x="1" y="1" width="98" height="98" />',
      defaultFill: "#1e2733",
    },
    {
      id: "uml/activation",
      label: "Activation Bar",
      keywords: ["uml", "sequence diagram", "execution", "focus of control", "active"],
      defaultSize: { w: 16, h: 90 },
      // The narrow bar sitting on a lifeline while that participant is doing something.
      svgBody: '<rect x="20" y="1" width="60" height="98" />',
    },
    {
      id: "uml/system-boundary",
      label: "System Boundary",
      keywords: ["uml", "use case diagram", "subject", "scope", "container", "frame"],
      defaultSize: { w: 300, h: 220 },
      // A labelled frame the use cases sit inside; the label rides the top edge.
      svgBody: '<rect x="1" y="1" width="98" height="98" rx="2" />',
      // See-through, so the connections drawn inside it stay visible; the name sits at its head.
      defaultFill: "none",
      labelBox: { x: 0, y: 0, w: 100, h: 14 },
    },
    {
      id: "uml/node",
      label: "Node",
      keywords: ["uml", "deployment diagram", "device", "server", "environment", "3d box"],
      defaultSize: { w: 140, h: 110 },
      // The 3D box of a deployment node.
      svgBody:
        '<path d="M1,22 L22,1 L99,1 L99,77 L78,99 L1,99 Z" /><path d="M1,22 L78,22 L99,1" fill="none" /><line x1="78" y1="22" x2="78" y2="99" fill="none" />',
      labelBox: { x: 0, y: 22, w: 78, h: 78 },
    },
    {
      id: "uml/artifact",
      label: "Artifact",
      keywords: ["uml", "deployment diagram", "file", "jar", "binary", "document"],
      defaultSize: { w: 110, h: 130 },
      svgBody: '<path d="M8,1 L68,1 L92,25 L92,99 L8,99 Z" /><path d="M68,1 L68,25 L92,25" fill="none" />',
      labelBox: { x: 8, y: 25, w: 84, h: 74 },
    },

    // Sequence and activity diagram notation the first set lacked.
    {
      id: "uml/combined-fragment",
      label: "Combined Fragment",
      keywords: ["uml", "sequence diagram", "fragment", "alt", "loop", "opt", "par", "frame"],
      defaultSize: { w: 320, h: 200 },
      svgBody: '<rect x="1" y="1" width="98" height="98" /><path d="M1,14 H22 L27,8 V1" fill="none" />',
      // The operator (alt, loop, opt…) goes in the tab, as UML writes it.
      defaultFill: "none",
      labelBox: { x: 0, y: 0, w: 26, h: 14 },
    },
    {
      id: "uml/decision-node",
      label: "Decision Node",
      keywords: ["uml", "activity diagram", "decision", "merge", "branch", "diamond"],
      defaultSize: { w: 50, h: 50 },
      svgBody: '<polygon points="50,1 99,50 50,99 1,50" />',
      labelBox: "below",
    },
    {
      id: "uml/flow-final-node",
      label: "Flow Final Node",
      keywords: ["uml", "activity diagram", "flow final", "end of flow", "stop"],
      defaultSize: { w: 50, h: 50 },
      svgBody: '<circle cx="50" cy="50" r="45" /><path d="M18,18 L82,82 M82,18 L18,82" fill="none" />',
      labelBox: "below",
    },
    {
      id: "uml/destruction",
      label: "Destruction",
      keywords: ["uml", "sequence diagram", "destroy", "delete", "end of lifeline", "x"],
      defaultSize: { w: 40, h: 40 },
      svgBody: '<path d="M8,8 L92,92 M92,8 L8,92" fill="none" stroke-width="10" />',
      defaultFill: "none",
    },
    {
      id: "uml/send-signal",
      label: "Send Signal",
      keywords: ["uml", "activity diagram", "send", "signal", "message", "event"],
      defaultSize: { w: 150, h: 70 },
      svgBody: '<polygon points="1,1 80,1 99,50 80,99 1,99" />',
    },
    {
      id: "uml/accept-event",
      label: "Accept Event",
      keywords: ["uml", "activity diagram", "accept", "receive", "wait", "event"],
      defaultSize: { w: 150, h: 70 },
      svgBody: '<polygon points="1,1 99,1 99,99 1,99 20,50" />',
    },
  ],
};

export default section;
