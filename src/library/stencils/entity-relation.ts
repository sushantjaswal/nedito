// Standard Entity-Relationship (Chen notation) shapes — a published, vendor-neutral modeling
// convention. Original SVG geometry, drawn for Nedito, not copied or traced from any other tool's stencils (see NOTICE).
import type { StencilSection } from "./types";

const section: StencilSection = {
  id: "entity-relation",
  name: "Entity Relation",
  shapes: [
    { id: "entity-relation/entity", keywords: ["er", "erd", "chen", "table", "object", "noun"], label: "Entity", defaultSize: { w: 120, h: 70 }, svgBody: '<rect x="1" y="1" width="98" height="98" />' },
    {
      id: "entity-relation/weak-entity",
      keywords: ["er", "erd", "chen", "dependent", "identifying", "double box"],
      label: "Weak Entity",
      defaultSize: { w: 120, h: 70 },
      svgBody: '<rect x="1" y="1" width="98" height="98" /><rect x="6" y="9" width="88" height="82" fill="none" />',
    },
    {
      id: "entity-relation/relationship",
      keywords: ["er", "erd", "chen", "verb", "associates", "diamond"],
      label: "Relationship",
      defaultSize: { w: 110, h: 75 },
      svgBody: '<polygon points="50,1 99,50 50,99 1,50" />',
    },
    {
      id: "entity-relation/weak-relationship",
      keywords: ["er", "erd", "chen", "identifying", "dependent", "double diamond"],
      label: "Weak Relationship",
      defaultSize: { w: 110, h: 75 },
      svgBody: '<polygon points="50,1 99,50 50,99 1,50" /><polygon points="50,13 88,50 50,87 12,50" fill="none" />',
    },
    {
      id: "entity-relation/attribute",
      keywords: ["er", "erd", "chen", "field", "column", "property", "oval"],
      label: "Attribute",
      defaultSize: { w: 110, h: 75 },
      svgBody: '<ellipse cx="50" cy="50" rx="49" ry="49" />',
    },
    {
      id: "entity-relation/multivalued-attribute",
      keywords: ["er", "erd", "chen", "repeating", "many values", "double oval"],
      label: "Multi-valued Attribute",
      defaultSize: { w: 110, h: 75 },
      svgBody: '<ellipse cx="50" cy="50" rx="49" ry="49" /><ellipse cx="50" cy="50" rx="42" ry="39" fill="none" />',
    },
    {
      id: "entity-relation/key-attribute",
      keywords: ["er", "erd", "chen", "primary key", "identifier", "unique", "underlined"],
      label: "Key Attribute",
      defaultSize: { w: 110, h: 75 },
      // The key's name is underlined: the rule sits just under a centred one-line name.
      svgBody: '<ellipse cx="50" cy="50" rx="49" ry="49" /><line x1="28" y1="66" x2="72" y2="66" fill="none" />',
    },
    {
      id: "entity-relation/derived-attribute",
      keywords: ["er", "erd", "chen", "computed", "calculated", "dashed oval"],
      label: "Derived Attribute",
      defaultSize: { w: 110, h: 75 },
      svgBody: '<ellipse cx="50" cy="50" rx="49" ry="49" stroke-dasharray="6,4" />',
    },
    {
      // ISA (is-a) hierarchy/subtype triangle, connecting a supertype entity to its subtypes.
      id: "entity-relation/isa-triangle",
      keywords: ["er", "erd", "chen", "inheritance", "generalization", "specialization", "subtype"],
      label: "ISA Triangle",
      defaultSize: { w: 100, h: 70 },
      svgBody: '<polygon points="50,2 98,98 2,98" />',
    },
    {
      id: "entity-relation/associative-entity",
      keywords: ["er", "erd", "chen", "junction", "join table", "many to many", "bridge"],
      label: "Associative Entity",
      defaultSize: { w: 120, h: 90 },
      svgBody:
        '<rect x="16" y="18" width="68" height="64" /><polygon points="50,1 99,50 50,99 1,50" fill="none" />',
    },
    {
      id: "entity-relation/table",
      label: "Entity Table (crow's foot)",
      keywords: ["er", "erd", "crow's foot", "crows foot", "ie", "martin", "table", "schema", "columns", "relational"],
      defaultSize: { w: 180, h: 120 },
      // Crow's-foot ER draws an entity as its table: a name band over the column list. The model
      // has no table primitive, so the band is drawn and the columns are typed into the label —
      // the same compromise uml/class makes for its compartments.
      //
      // Deliberately *no* vertical rule for a PK/FK key column, though the notation often has
      // one: a label is a single centred block of text, so a column rule would cut through the
      // words rather than separate them, promising a structure the text cannot keep.
      svgBody: '<rect x="1" y="1" width="98" height="98" /><line x1="1" y1="24" x2="99" y2="24" fill="none" />',
      // The table's name goes in its band.
      labelBox: { x: 0, y: 0, w: 100, h: 24 },
    },
  ],
};

export default section;
