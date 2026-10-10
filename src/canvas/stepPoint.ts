// Where a presentation step is, for Walkthrough's dot (A6, D123). Apart from stepGeometry.ts,
// which the exporter imports: this reads the exporter's edge geometry, and the two would cycle.
import { buildEdgePath } from "./edgeRouting";
import { edgePathInput } from "../file/svgExport";
import type { Diagram } from "../model/types";

/** Where a step is: a shape's centre, or a line's middle. */
export function stepPoint(diagram: Diagram, id: string): { x: number; y: number } | null {
  const node = diagram.nodes.find((n) => n.id === id);
  if (node) return { x: node.position.x + node.size.w / 2, y: node.position.y + node.size.h / 2 };
  const edge = diagram.edges.find((e) => e.id === id);
  if (!edge) return null;
  const input = edgePathInput(edge, new Map(diagram.nodes.map((n) => [n.id, n])));
  return input ? buildEdgePath(input).midPos : null;
}
