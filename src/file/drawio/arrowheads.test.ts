// X2 (D133), on the audit's ER fixture: the relationship keeps its crow's-foot ends.
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { decodeDrawio } from "./drawioImport";

it("the audit's ER relationship arrives one-to-many, not as an arrow at both ends", async () => {
  const result = await decodeDrawio(readFileSync("src/file/drawio/fixtures/audit/er-table.drawio", "utf8"), "er-table.drawio");
  expect(result.ok).toBe(true);
  if (!result.ok) return;
  const edges = Object.values(result.doc.diagrams).flatMap((d) => d.edges);
  expect(edges.some((e) => e.style.startArrow === "er-one" && e.style.endArrow === "crows-foot")).toBe(true);
});
