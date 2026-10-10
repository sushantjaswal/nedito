// Shared pieces for the Software & UML templates.
//
// The edge styles are the point: UML's meaning lives in its line ends, and "inherits from" vs
// "is composed of" is the difference between a hollow triangle and a filled diamond. Those
// arrowheads were added to the Style panel first (canvas/arrowheads.ts), so every one of these
// is something a user can draw by hand — a template must never use notation the app cannot
// otherwise produce.
import type { StyleMap } from "../../model/types";

const INK = "#1E2733";

const BASE: StyleMap = { edgeStyle: "straight", stroke: INK, strokeWidth: 1.25, startArrow: "none", endArrow: "none" };

/** Plain association. */
export const ASSOCIATION: StyleMap = { ...BASE };

/** Directed association / message. */
export const DIRECTED: StyleMap = { ...BASE, endArrow: "open" };

/** Generalization — B inherits from A. Hollow triangle at the parent. */
export const INHERITS: StyleMap = { ...BASE, endArrow: "triangle" };

/** Realization — a class implements an interface. Hollow triangle, dashed line. */
export const REALIZES: StyleMap = { ...BASE, endArrow: "triangle", dash: "dashed" };

/** Composition — the whole owns the part. Filled diamond at the whole. */
export const COMPOSITION: StyleMap = { ...BASE, startArrow: "diamond" };

/** Aggregation — the whole references the part. Hollow diamond at the whole. */
export const AGGREGATION: StyleMap = { ...BASE, startArrow: "diamond-open" };

/** Dependency / include / extend. Dashed with an open head. */
export const DEPENDENCY: StyleMap = { ...BASE, endArrow: "open", dash: "dashed" };

/** Synchronous message in a sequence diagram. */
export const SYNC_MESSAGE: StyleMap = { ...BASE, endArrow: "classic" };

/** Asynchronous message — a thin open head, the UML signal for "does not wait". */
export const ASYNC_MESSAGE: StyleMap = { ...BASE, endArrow: "open" };

/** Return message — dashed, open head. */
export const RETURN_MESSAGE: StyleMap = { ...BASE, endArrow: "open", dash: "dashed" };

/** Orthogonal flow, for activity and state machines. */
export const FLOW: StyleMap = { ...BASE, edgeStyle: "orthogonal", endArrow: "classic" };

/** A C4 relationship: labelled, directed, deliberately plain. */
export const C4_REL: StyleMap = { ...BASE, edgeStyle: "orthogonal", endArrow: "open", stroke: "#66707D" };

export const CLASS_STYLE: StyleMap = { fill: "#FFFFFF", stroke: INK, strokeWidth: 1 };
export const ACCENT_STYLE: StyleMap = { fill: "#EEEBFC", stroke: "#6D5AE6", strokeWidth: 1.25 };
export const MUTED_STYLE: StyleMap = { fill: "#F4F5F7", stroke: "#66707D", strokeWidth: 1 };

/**
 * A class box's three compartments as one label. The stencil draws the divider rules; the text
 * lines up with them well enough to read as real UML without needing a compartment primitive
 * the model does not have.
 */
export function classLabel(name: string, attributes: string[], operations: string[]): string {
  return [name, "", ...attributes, "", ...operations].join("\n");
}
