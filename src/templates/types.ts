// Template catalogue types.
//
// A template *is* a DiagramDocument — the same thing a user saves — so it gets the same validation,
// the same renderer and the same nesting. Nothing about a template is a special case at the
// model layer, which is what keeps "a template with a nested block" from being a separate
// feature from "a diagram with a nested block".
import type { DiagramDocument } from "../model/types";

export const TEMPLATE_CATEGORIES = [
  "featured",
  "process",
  "software",
  "data",
  "architecture",
  "business",
  "thinking",
] as const;

export type TemplateCategory = (typeof TEMPLATE_CATEGORIES)[number];

export const CATEGORY_LABELS: Record<TemplateCategory, string> = {
  featured: "Featured",
  process: "Process",
  software: "Software & UML",
  data: "Data",
  architecture: "Architecture & Cloud",
  business: "Business",
  thinking: "Thinking & Planning",
};

export interface TemplateMeta {
  id: string;
  name: string;
  category: TemplateCategory;
  /** One line, shown on hover/focus. */
  description: string;
  /** Extra search terms beyond the name — same idea as StencilDef.keywords. */
  keywords: string[];
  /** Offered on the empty-canvas panel. Six of these, per the spec. */
  featured: boolean;
}

export interface TemplateDef extends TemplateMeta {
  /**
   * Whether the template contains a Nested Block. **Derived, never hand-set** (the spec is
   * explicit): a hand-set flag is a second source of truth that goes stale the moment someone
   * edits the document and forgets the metadata.
   */
  usesNesting: boolean;
  doc: DiagramDocument;
}

export function derivesNesting(doc: DiagramDocument): boolean {
  return Object.values(doc.diagrams).some((d) => d.nodes.some((n) => n.type === "nested"));
}
