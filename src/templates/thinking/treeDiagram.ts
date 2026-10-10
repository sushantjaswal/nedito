// A plain hierarchy tree.
//
// No arrowheads: a tree's direction is carried by its layout, and heads on every branch make a
// crowded tree look like a flowchart. Three levels, because two does not show the pattern and
// four does not fit on a page at a readable size. Each branch's children are listed beneath it,
// indented, as a work breakdown is drawn.
import { ACCENT, BRANCH, PLAIN, SOFT, indent, link, node, page } from "./thinkKit";
import { templateDoc } from "../starters/basicFlowchart";

const BOX = "general/rounded-rect";

const LEAVES: [string, string[]][] = [
  ["Discovery", ["Interviews", "Desk research", "Analytics review"]],
  ["Design", ["Concepts", "Prototype", "Usability test"]],
  ["Delivery", ["Build", "Pilot", "Launch"]],
];

const COL = 300;
const X0 = 60;
const diagram = page(
  "dTree",
  "Tree diagram",
  [
    node("trRoot", BOX, "Programme", X0 + COL - 10, 40, 220, 60, 1, ACCENT),
    ...LEAVES.flatMap(([branch, leaves], b) => [
      node(`trB${b}`, BOX, branch, X0 + b * COL, 170, 220, 56, 2 + b, PLAIN),
      // Indented beneath their branch, so the tree reads down each column.
      ...leaves.map((leaf, i) => node(`trL${b}x${i}`, BOX, leaf, X0 + b * COL + 40, 270 + i * 76, 210, 52, 6 + b * 3 + i, SOFT)),
    ]),
  ],
  [
    ...LEAVES.flatMap(([, leaves], b) => [
      link(`trRB${b}`, "trRoot", `trB${b}`, BRANCH, undefined, ["bottom", "top"]),
      ...leaves.map((_, i) => indent(`trBL${b}x${i}`, `trB${b}`, `trL${b}x${i}`)),
    ]),
  ],
);

export default templateDoc("Tree diagram", [diagram]);
