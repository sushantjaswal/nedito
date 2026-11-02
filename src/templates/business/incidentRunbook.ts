// An incident response runbook, with each phase a Nested Block holding its steps.
//
// A runbook is read twice, by people in opposite states of mind. Before an incident someone
// reviews it and wants the whole response on one page: alert, triage, severity, mitigate,
// verify, review. During an incident someone is holding a pager at 3am and wants only the
// phase they are in, step by step, with nothing else on screen.
//
// Those are the two levels. Each phase opens into its own steps, so one document serves the
// review and the response — and the phase a responder is standing in is the only thing in
// front of them. The mitigate phase keeps two extra ports because its two loose ends are
// facts about the response, not about the phase: the status page it has to keep updating, and
// the way back in when a mitigation did not work.
import type { Diagram, NestedNode } from "../../model/types";
import { templateDoc, tid } from "../starters/basicFlowchart";
import { ACCENT, FLOW, MESSAGE, PLAIN, TINTS, ZONE, link, node, page } from "./bizKit";

const ROUND = "general/rounded-rect";
const GATE = "flowchart/decision";

// ------------------------------------------------------------- the phases, one level down

/** Triage: work out what is happening and who is running it, before touching anything. */
const triage: Diagram = page(
  "dTriage",
  "Triage",
  [
    node("itAck", ROUND, "Acknowledge\nthe page", 60, 240, 180, 64, 1, ACCENT),
    node("itScope", ROUND, "Confirm the alert\nand its scope", 290, 240, 180, 70, 2, PLAIN),
    node("itChan", ROUND, "Open an incident\nchannel", 290, 380, 180, 64, 3, PLAIN),
    node("itImpact", ROUND, "Assess customer\nimpact", 530, 240, 180, 70, 4, PLAIN),
    node("itRoles", ROUND, "Name the lead\nand the scribe", 530, 380, 180, 70, 5, PLAIN),
    node("itSev", ROUND, "Set the severity", 770, 235, 180, 80, 6, ACCENT),
  ],
  [
    link("ite1", "itAck", "itScope", FLOW, undefined, ["right", "left"]),
    link("ite2", "itAck", "itChan", FLOW, undefined, ["right", "left"]),
    link("ite3", "itScope", "itImpact", FLOW, undefined, ["right", "left"]),
    link("ite4", "itChan", "itRoles", FLOW, undefined, ["right", "left"]),
    link("ite5", "itImpact", "itSev", FLOW, undefined, ["right", "left"]),
    link("ite6", "itRoles", "itSev", FLOW, undefined, ["right", "left"]),
  ],
);

/** Mitigate: stop the bleeding, one region at a time, and tell people while you do it. */
const mitigate: Diagram = page(
  "dMitigate",
  "Mitigate",
  [
    node("imIn", ROUND, "Incident declared", 60, 240, 180, 64, 1, ACCENT),
    node("imOptions", ROUND, "Choose a mitigation:\nroll back, flag, scale", 290, 235, 190, 80, 2, PLAIN),
    node("imApply", ROUND, "Apply it to\none region first", 530, 240, 180, 70, 3, PLAIN),
    node("imWatch", ROUND, "Watch the\nerror rate", 770, 240, 180, 70, 4, PLAIN),
    node("imOut", ROUND, "Mitigated", 1010, 240, 180, 64, 5, ACCENT),
    node("imComms", ROUND, "Update the\nstatus page", 530, 420, 180, 70, 6, ZONE),
  ],
  [
    link("ime1", "imIn", "imOptions", FLOW, undefined, ["right", "left"]),
    link("ime2", "imOptions", "imApply", FLOW, undefined, ["right", "left"]),
    link("ime3", "imApply", "imWatch", FLOW, undefined, ["right", "left"]),
    link("ime4", "imWatch", "imOut", FLOW, undefined, ["right", "left"]),
    link("ime5", "imApply", "imComms", MESSAGE, "every 30 min", ["bottom", "top"]),
  ],
);

/** Post-incident review: what happened, why, and what changes because of it. */
const review: Diagram = page(
  "dReview",
  "Post-incident review",
  [
    node("ipIn", ROUND, "Incident closed", 60, 240, 180, 64, 1, ACCENT),
    node("ipTimeline", ROUND, "Build the timeline\nfrom the channel", 290, 240, 180, 70, 2, PLAIN),
    node("ipCause", ROUND, "Find contributing\ncauses", 530, 240, 180, 70, 3, PLAIN),
    node("ipActions", ROUND, "Agree actions,\nowners and dates", 770, 240, 180, 70, 4, PLAIN),
    node("ipOut", ROUND, "Review published", 1010, 240, 180, 64, 5, ACCENT),
    node("ipBlame", "general/note", "No blame:\nfix the system", 530, 400, 180, 70, 6, ZONE),
  ],
  [
    link("ipe1", "ipIn", "ipTimeline", FLOW, undefined, ["right", "left"]),
    link("ipe2", "ipTimeline", "ipCause", FLOW, undefined, ["right", "left"]),
    link("ipe3", "ipCause", "ipActions", FLOW, undefined, ["right", "left"]),
    link("ipe4", "ipActions", "ipOut", FLOW, undefined, ["right", "left"]),
    link("ipe5", "ipCause", "ipBlame", MESSAGE, undefined, ["bottom", "top"]),
  ],
);

// ----------------------------------------------------------------- the response on one page

function phase(
  slug: string,
  title: string,
  summary: string,
  child: Diagram,
  x: number,
  z: number,
  ports: NestedNode["ports"],
): NestedNode {
  return {
    id: tid(slug),
    type: "nested",
    childDiagramId: child.id,
    position: { x, y: 200 },
    size: { w: 260, h: 150 },
    z,
    style: {},
    label: { text: title, align: "center" },
    collapsed: { icons: [], summary },
    ports,
  };
}

const triagePhase = phase("iTriage", "Triage", "acknowledge · scope · roles · severity", triage, 280, 2, [
  { id: tid("iTriageIn"), side: "left", offset: 0.5, innerNodeId: tid("itAck"), label: "page" },
  { id: tid("iTriageOut"), side: "right", offset: 0.5, innerNodeId: tid("itSev"), label: "severity" },
]);

const mitigatePhase = phase("iMitigate", "Mitigate", "choose · apply · watch · tell people", mitigate, 900, 4, [
  { id: tid("iMitIn"), side: "left", offset: 0.5, innerNodeId: tid("imIn"), label: "declared" },
  { id: tid("iMitRetry"), side: "top", offset: 0.5, innerNodeId: tid("imOptions"), label: "try another" },
  { id: tid("iMitOut"), side: "right", offset: 0.5, innerNodeId: tid("imOut"), label: "mitigated" },
  { id: tid("iMitComms"), side: "bottom", offset: 0.5, innerNodeId: tid("imComms"), label: "updates" },
]);

const reviewPhase = phase("iReview", "Post-incident review", "timeline · causes · actions", review, 1460, 7, [
  { id: tid("iRevIn"), side: "left", offset: 0.5, innerNodeId: tid("ipIn"), label: "closed" },
  { id: tid("iRevOut"), side: "right", offset: 0.5, innerNodeId: tid("ipOut"), label: "published" },
]);

// Left to right as the response runs, with the two things that are not part of the run below
// it: the ticket a low-severity alert becomes, and the status page somebody has to keep.
const response: Diagram = page(
  "dResponse",
  "Incident response",
  [
    node("iAlert", ROUND, "Alert fires and\npages the on-call", 40, 243, 180, 64, 1, ACCENT),
    triagePhase,
    node("iSev", GATE, "Severity?", 600, 225, 180, 100, 3, TINTS.bad),
    mitigatePhase,
    node("iVerify", ROUND, "Service verified\nhealthy", 1220, 243, 180, 64, 5, PLAIN),
    reviewPhase,
    node("iActions", ROUND, "Action items\ntracked to done", 1780, 240, 180, 70, 6, ACCENT),
    node("iTicket", ROUND, "Raise a ticket\nfor the next sprint", 600, 430, 180, 70, 8, ZONE),
    node("iStatus", ROUND, "Status page and\ncustomer updates", 900, 430, 260, 70, 9, ZONE),
  ],
  [
    {
      id: tid("ire1"),
      source: { nodeId: tid("iAlert") },
      target: { nodeId: triagePhase.id, portId: triagePhase.ports[0].id },
      style: { ...FLOW, sourceHandle: "right" },
    },
    {
      id: tid("ire2"),
      source: { nodeId: triagePhase.id, portId: triagePhase.ports[1].id },
      target: { nodeId: tid("iSev") },
      style: { ...FLOW, targetHandle: "left" },
    },
    {
      id: tid("ire3"),
      source: { nodeId: tid("iSev") },
      target: { nodeId: mitigatePhase.id, portId: mitigatePhase.ports[0].id },
      style: { ...FLOW, sourceHandle: "right" },
      label: { text: "Sev 1 or 2", fontSize: 10, color: "#66707D" },
    },
    link("ire4", "iSev", "iTicket", FLOW, "Sev 3", ["bottom", "top"]),
    {
      id: tid("ire5"),
      source: { nodeId: mitigatePhase.id, portId: mitigatePhase.ports[2].id },
      target: { nodeId: tid("iVerify") },
      style: { ...FLOW, targetHandle: "left" },
    },
    // Verification failing goes back into the choice of mitigation, one level down.
    {
      id: tid("ire6"),
      source: { nodeId: tid("iVerify") },
      target: { nodeId: mitigatePhase.id, portId: mitigatePhase.ports[1].id },
      style: { ...FLOW, sourceHandle: "top" },
      label: { text: "still failing", fontSize: 10, color: "#66707D" },
    },
    {
      id: tid("ire7"),
      source: { nodeId: tid("iVerify") },
      target: { nodeId: reviewPhase.id, portId: reviewPhase.ports[0].id },
      style: { ...FLOW, sourceHandle: "right" },
    },
    {
      id: tid("ire8"),
      source: { nodeId: reviewPhase.id, portId: reviewPhase.ports[1].id },
      target: { nodeId: tid("iActions") },
      style: { ...FLOW, targetHandle: "left" },
    },
    {
      id: tid("ire9"),
      source: { nodeId: mitigatePhase.id, portId: mitigatePhase.ports[3].id },
      target: { nodeId: tid("iStatus") },
      style: { ...MESSAGE, targetHandle: "top" },
    },
  ],
);

export default templateDoc("Incident response", [response, triage, mitigate, review]);
