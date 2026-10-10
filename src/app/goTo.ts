// Finding and going to a named shape anywhere in the document — the command palette's "Go to"
// (R2, D91).
import { useDocStore } from "../model/store";
import type { DiagramDocument } from "../model/types";
import { getCanvasInstance } from "../canvas/canvasApi";

/** Every named shape and Nested Block in the document, with the diagram it is on. */
export function namedNodes(doc: DiagramDocument): { nodeId: string; diagramId: string; name: string; where: string; nested: boolean }[] {
  const out: { nodeId: string; diagramId: string; name: string; where: string; nested: boolean }[] = [];
  for (const diagram of Object.values(doc.diagrams)) {
    for (const node of diagram.nodes) {
      const name = node.label?.text?.trim();
      if (!name) continue;
      out.push({ nodeId: node.id, diagramId: diagram.id, name: name.replace(/\s+/g, " "), where: diagram.title, nested: node.type === "nested" });
    }
  }
  return out;
}

/** Goes to a shape anywhere in the document: opens the level it is on, selects it, and frames it. */
export function goToNode(diagramId: string, nodeId: string): void {
  const s = useDocStore.getState();
  s.navigateToDiagram(diagramId);
  useDocStore.getState().setSelection([nodeId]);
  // The canvas swaps diagrams on the next render; frame the shape once it is there.
  window.setTimeout(() => void getCanvasInstance()?.fitView({ nodes: [{ id: nodeId }], duration: 200, padding: 0.6, maxZoom: 1 }), 60);
}
