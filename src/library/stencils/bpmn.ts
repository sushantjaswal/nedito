// BPMN 2.0 basic shapes — the subset the OMG specification calls the "descriptive" conformance
// class, which is what non-technical readers are actually shown.
//
// BPMN's grammar is carried almost entirely by border weight and by what sits inside a shape:
// a start event, an intermediate event and an end event are the same circle with a thin, double
// and thick outline. Border weight is a *style*, so an end event could in principle be a plain
// circle the author thickens — but a reader picking shapes from a palette should not have to
// know that, and a template that relied on it would look like a bug the first time someone
// reset the line width. So each event is its own stencil with its geometry baked in.
//
// Pool and lane live here rather than in a section of their own: a swimlane diagram *is* a pool
// with lanes, which is where the idea comes from, and two shapes do not justify a section. Their
// keywords carry "swimlane" and "cross-functional" so someone who has never heard of BPMN still
// finds them.
//
// One compromise in the pool and lane: BPMN writes the participant's name *rotated* inside the
// name band, and a label here cannot be rotated. So the band is narrow and the name is written
// left-aligned into it, which reads correctly at the sizes these are actually used at. The band
// is 6% rather than a fixed width because svgBody is authored in a 100-unit box that stretches
// with the shape — at 14% a full-width lane had a 150px band with the name stranded in the
// middle of the diagram, on top of the first task.
//
// Original SVG geometry per CLAUDE.md's provenance guardrail.
import type { StencilSection } from "./types";

const section: StencilSection = {
  id: "bpmn",
  name: "BPMN",
  shapes: [
    // ---------------------------------------------------------------- containers
    {
      id: "bpmn/pool",
      label: "Pool",
      keywords: ["bpmn", "swimlane", "cross-functional", "participant", "organisation", "container", "process"],
      defaultSize: { w: 720, h: 260 },
      // The name band runs down the left edge, where BPMN puts the participant's name.
      svgBody: '<rect x="1" y="1" width="98" height="98" /><line x1="6" y1="1" x2="6" y2="99" fill="none" />',
      defaultFill: "none",
      labelBox: { x: 0, y: 0, w: 6, h: 100, vertical: true },
    },
    {
      id: "bpmn/lane",
      label: "Lane",
      keywords: ["bpmn", "swimlane", "cross-functional", "role", "band", "row", "responsibility"],
      defaultSize: { w: 700, h: 120 },
      svgBody: '<rect x="1" y="1" width="98" height="98" /><line x1="6" y1="1" x2="6" y2="99" fill="none" />',
      defaultFill: "none",
      labelBox: { x: 0, y: 0, w: 6, h: 100, vertical: true },
    },

    // ---------------------------------------------------------------- events
    {
      id: "bpmn/start-event",
      label: "Start Event",
      keywords: ["bpmn", "start", "begin", "trigger", "event", "circle", "thin"],
      defaultSize: { w: 56, h: 56 },
      // Thin single outline — the lightest mark in the notation, because nothing precedes it.
      svgBody: '<circle cx="50" cy="50" r="47" />',
      labelBox: "below",
    },
    {
      id: "bpmn/intermediate-event",
      label: "Intermediate Event",
      keywords: ["bpmn", "intermediate", "event", "catch", "throw", "timer", "double circle"],
      defaultSize: { w: 56, h: 56 },
      // Double outline: something happens here, but it neither starts nor ends the process.
      svgBody: '<circle cx="50" cy="50" r="47" /><circle cx="50" cy="50" r="39" fill="none" />',
      labelBox: "below",
    },
    {
      id: "bpmn/end-event",
      label: "End Event",
      keywords: ["bpmn", "end", "finish", "stop", "terminate", "event", "thick circle"],
      defaultSize: { w: 56, h: 56 },
      // Thick outline, drawn as a ring so the weight survives the shape's own stroke setting.
      svgBody: '<circle cx="50" cy="50" r="47" /><circle cx="50" cy="50" r="41" fill="none" stroke-width="6" />',
      labelBox: "below",
    },

    // ---------------------------------------------------------------- activities
    {
      id: "bpmn/task",
      label: "Task",
      keywords: ["bpmn", "task", "activity", "step", "action", "work", "rounded"],
      defaultSize: { w: 160, h: 80 },
      svgBody: '<rect x="1" y="1" width="98" height="98" rx="12" />',
    },
    {
      id: "bpmn/subprocess",
      label: "Sub-process",
      keywords: ["bpmn", "subprocess", "collapsed", "nested", "expand", "activity", "plus"],
      defaultSize: { w: 160, h: 80 },
      // The + marker is BPMN's "there is more inside this" sign — the notation's own nod at
      // exactly what a Nested Block does properly.
      svgBody:
        '<rect x="1" y="1" width="98" height="98" rx="12" /><rect x="42" y="78" width="16" height="16" fill="none" /><path d="M50,81 v10 M45,86 h10" fill="none" />',
    },

    // ---------------------------------------------------------------- gateways
    {
      id: "bpmn/gateway-exclusive",
      label: "Exclusive Gateway (XOR)",
      keywords: ["bpmn", "gateway", "exclusive", "xor", "decision", "either or", "branch", "diamond"],
      defaultSize: { w: 80, h: 80 },
      // The X is what makes it exclusive; an empty diamond means the same thing but says less.
      svgBody: '<polygon points="50,1 99,50 50,99 1,50" /><path d="M35,35 L65,65 M65,35 L35,65" fill="none" />',
      labelBox: "below",
    },
    {
      id: "bpmn/gateway-parallel",
      label: "Parallel Gateway (AND)",
      keywords: ["bpmn", "gateway", "parallel", "and", "fork", "join", "concurrent", "split", "diamond"],
      defaultSize: { w: 80, h: 80 },
      svgBody: '<polygon points="50,1 99,50 50,99 1,50" /><path d="M50,30 v40 M30,50 h40" fill="none" />',
      labelBox: "below",
    },
    {
      id: "bpmn/gateway-inclusive",
      label: "Inclusive Gateway (OR)",
      keywords: ["bpmn", "gateway", "inclusive", "or", "one or more", "branch", "diamond"],
      defaultSize: { w: 80, h: 80 },
      svgBody: '<polygon points="50,1 99,50 50,99 1,50" /><circle cx="50" cy="50" r="18" fill="none" />',
      labelBox: "below",
    },

    // ---------------------------------------------------------------- artifacts
    {
      id: "bpmn/data-object",
      label: "Data Object",
      keywords: ["bpmn", "data", "document", "artifact", "input", "output", "file"],
      defaultSize: { w: 70, h: 90 },
      svgBody: '<path d="M8,1 L68,1 L92,25 L92,99 L8,99 Z" /><path d="M68,1 L68,25 L92,25" fill="none" />',
      labelBox: "below",
    },
    {
      id: "bpmn/data-store",
      label: "Data Store",
      keywords: ["bpmn", "data store", "database", "repository", "persistence", "cylinder"],
      defaultSize: { w: 90, h: 80 },
      svgBody:
        '<path d="M6,18 v64 a44,16 0 0 0 88,0 v-64" /><ellipse cx="50" cy="18" rx="44" ry="16" /><path d="M6,18 a44,16 0 0 0 88,0" fill="none" />',
      labelBox: "below",
    },
    {
      id: "bpmn/annotation",
      label: "Annotation",
      keywords: ["bpmn", "annotation", "note", "comment", "text", "explain"],
      defaultSize: { w: 150, h: 70 },
      // An open bracket, not a box: an annotation is attached to something, not a step in itself.
      svgBody: '<path d="M22,1 L1,1 L1,99 L22,99" fill="none" />',
    },

    // Event, task and gateway markers BPMN modellers reach for every day.
    {
      id: "bpmn/message-start-event",
      label: "Message Start Event",
      keywords: ["bpmn", "start", "message", "email", "received", "event", "trigger"],
      defaultSize: { w: 56, h: 56 },
      svgBody: '<circle cx="50" cy="50" r="47" /><path d="M34,40 H66 V62 H34 Z M34,40 L50,52 L66,40" fill="none" />',
      labelBox: "below",
    },
    {
      id: "bpmn/timer-start-event",
      label: "Timer Start Event",
      keywords: ["bpmn", "start", "timer", "schedule", "clock", "event", "cron"],
      defaultSize: { w: 56, h: 56 },
      svgBody: '<circle cx="50" cy="50" r="47" /><circle cx="50" cy="50" r="22" fill="none" /><path d="M50,36 V50 L60,56 M50,30 V33 M50,67 V70 M30,50 H33 M67,50 H70" fill="none" />',
      labelBox: "below",
    },
    {
      id: "bpmn/message-intermediate-event",
      label: "Message Event",
      keywords: ["bpmn", "intermediate", "message", "catch", "wait for", "event"],
      defaultSize: { w: 56, h: 56 },
      svgBody: '<circle cx="50" cy="50" r="47" /><circle cx="50" cy="50" r="39" fill="none" /><path d="M34,40 H66 V62 H34 Z M34,40 L50,52 L66,40" fill="none" />',
      labelBox: "below",
    },
    {
      id: "bpmn/timer-intermediate-event",
      label: "Timer Event",
      keywords: ["bpmn", "intermediate", "timer", "wait", "delay", "timeout", "event"],
      defaultSize: { w: 56, h: 56 },
      svgBody: '<circle cx="50" cy="50" r="47" /><circle cx="50" cy="50" r="39" fill="none" /><circle cx="50" cy="50" r="22" fill="none" /><path d="M50,36 V50 L60,56 M50,30 V33 M50,67 V70 M30,50 H33 M67,50 H70" fill="none" />',
      labelBox: "below",
    },
    {
      id: "bpmn/error-end-event",
      label: "Error End Event",
      keywords: ["bpmn", "end", "error", "failure", "exception", "event"],
      defaultSize: { w: 56, h: 56 },
      svgBody: '<circle cx="50" cy="50" r="47" /><circle cx="50" cy="50" r="41" fill="none" stroke-width="6" /><path d="M32,68 L42,34 L56,56 L68,32 L60,68 L48,48 Z" fill="none" />',
      labelBox: "below",
    },
    {
      id: "bpmn/terminate-end-event",
      label: "Terminate End Event",
      keywords: ["bpmn", "end", "terminate", "stop all", "kill", "event"],
      defaultSize: { w: 56, h: 56 },
      svgBody: '<circle cx="50" cy="50" r="47" /><circle cx="50" cy="50" r="41" fill="none" stroke-width="6" /><circle cx="50" cy="50" r="24" stroke="none" fill="#1e2733" />',
      labelBox: "below",
    },
    {
      id: "bpmn/user-task",
      label: "User Task",
      keywords: ["bpmn", "task", "user", "human", "manual", "person", "activity"],
      defaultSize: { w: 160, h: 80 },
      svgBody: '<rect x="1" y="1" width="98" height="98" rx="12" /><circle cx="15" cy="15" r="5" fill="none" /><path d="M7,30 Q7,21 15,21 Q23,21 23,30 Z" fill="none" />',
    },
    {
      id: "bpmn/service-task",
      label: "Service Task",
      keywords: ["bpmn", "task", "service", "automated", "system", "api", "activity"],
      defaultSize: { w: 160, h: 80 },
      svgBody: '<rect x="1" y="1" width="98" height="98" rx="12" /><circle cx="15" cy="17" r="7" fill="none" /><circle cx="15" cy="17" r="2.5" fill="none" /><path d="M15,7 V9 M15,25 V27 M5,17 H7 M23,17 H25" fill="none" />',
    },
    {
      id: "bpmn/send-task",
      label: "Send Task",
      keywords: ["bpmn", "task", "send", "message", "notify", "email", "activity"],
      defaultSize: { w: 160, h: 80 },
      svgBody: '<rect x="1" y="1" width="98" height="98" rx="12" /><path d="M7,9 H25 V22 H7 Z M7,9 L16,16 L25,9" fill="none" />',
    },
    {
      id: "bpmn/call-activity",
      label: "Call Activity",
      keywords: ["bpmn", "call activity", "reusable", "global", "subprocess", "activity"],
      defaultSize: { w: 160, h: 80 },
      svgBody: '<rect x="2" y="2" width="96" height="96" rx="12" stroke-width="5" />',
    },
    {
      id: "bpmn/gateway-event",
      label: "Event-Based Gateway",
      keywords: ["bpmn", "gateway", "event based", "race", "first event wins", "diamond"],
      defaultSize: { w: 80, h: 80 },
      svgBody: '<polygon points="50,1 99,50 50,99 1,50" /><circle cx="50" cy="50" r="22" fill="none" /><circle cx="50" cy="50" r="17" fill="none" /><polygon points="50,38 61,46 57,59 43,59 39,46" fill="none" />',
      labelBox: "below",
    },
    {
      id: "bpmn/group",
      label: "Group",
      keywords: ["bpmn", "group", "category", "boundary", "dashed"],
      defaultSize: { w: 240, h: 160 },
      svgBody: '<rect x="1" y="1" width="98" height="98" rx="6" stroke-dasharray="8 3 2 3" />',
      defaultFill: "none",
      labelBox: { x: 0, y: 0, w: 100, h: 16 },
    },
  ],
};

export default section;
