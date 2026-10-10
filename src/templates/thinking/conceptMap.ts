// A concept map.
//
// The thing that makes a concept map different from a mind map is that **every link is a verb**.
// "Customer — places → Order" is a claim you can argue with; an unlabelled line between the two
// is not. So every edge here carries its phrase, and the test for this batch enforces it.
import { ACCENT, PLAIN, RELATES, SOFT, link, node, page } from "./thinkKit";
import { templateDoc } from "../starters/basicFlowchart";

const BOX = "general/rounded-rect";

// Read top to bottom: what retention depends on, what those build, and what they hold down.
// Every link is a gentle curve between facing sides, and none passes a concept it does not join.
const diagram = page(
  "dConceptMap",
  "Concept map",
  [
    node("cmCentral", BOX, "Customer\nretention", 420, 60, 190, 70, 1, ACCENT),

    node("cmOnboard", BOX, "Onboarding", 100, 230, 170, 60, 2, PLAIN),
    node("cmValue", BOX, "Time to first value", 420, 230, 190, 60, 3, PLAIN),
    node("cmSupport", BOX, "Support quality", 760, 230, 180, 60, 4, PLAIN),

    node("cmHabit", BOX, "Habit", 100, 410, 170, 60, 5, SOFT),
    node("cmTrust", BOX, "Trust", 430, 410, 170, 60, 6, SOFT),

    node("cmChurn", BOX, "Churn", 260, 590, 170, 60, 7, SOFT),
    node("cmPrice", BOX, "Perceived price", 620, 590, 190, 60, 8, SOFT),
  ],
  [
    link("cmA", "cmCentral", "cmOnboard", RELATES, "starts with", ["left", "top"]),
    link("cmB", "cmCentral", "cmValue", RELATES, "depends on", ["bottom", "top"]),
    link("cmC", "cmCentral", "cmSupport", RELATES, "is helped by", ["right", "top"]),
    link("cmD", "cmOnboard", "cmHabit", RELATES, "builds", ["bottom", "top"]),
    link("cmE", "cmValue", "cmTrust", RELATES, "earns", ["bottom", "top"]),
    link("cmF", "cmSupport", "cmTrust", RELATES, "reinforces", ["bottom", "right"]),
    link("cmG", "cmTrust", "cmChurn", RELATES, "reduces", ["bottom", "right"]),
    link("cmH", "cmHabit", "cmChurn", RELATES, "reduces", ["bottom", "left"]),
    link("cmI", "cmTrust", "cmPrice", RELATES, "softens", ["bottom", "left"]),
  ],
);

// Trust's two outgoing links leave its underside at their own points.
diagram.edges = diagram.edges.map((e) => {
  if (e.id.startsWith("cmG")) return { ...e, source: { ...e.source, anchor: { x: 0.3, y: 1 } } };
  if (e.id.startsWith("cmI")) return { ...e, source: { ...e.source, anchor: { x: 0.7, y: 1 } } };
  return e;
});

export default templateDoc("Concept map", [diagram]);
