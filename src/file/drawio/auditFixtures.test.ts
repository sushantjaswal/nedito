// The draw.io import audit's fixtures (docs/drawio-import-audit.md, D112): every one imports and
// produces a valid document. The audit's findings are not asserted here — each fix (X1–X6) turns
// its own findings into assertions against these files.
import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { validateDoc } from "../../model/validate";
import { decodeDrawio } from "./drawioImport";

const DIR = "src/file/drawio/fixtures/audit";
const FILES = readdirSync(DIR).filter((f) => f.endsWith(".drawio"));

describe("draw.io audit fixtures", () => {
  it("covers the five areas the audit names", () => {
    expect(FILES.sort()).toEqual([
      "cloud-pictures.drawio",
      "containers-layers.drawio",
      "er-table.drawio",
      "flow-basics.drawio",
      "multipage-compressed.drawio",
    ]);
  });

  it.each(FILES)("%s imports into a valid document, every page present", async (file) => {
    const text = readFileSync(`${DIR}/${file}`, "utf8");
    const result = await decodeDrawio(text, file);
    expect(result.ok, result.ok ? "" : result.error).toBe(true);
    if (!result.ok) return;
    expect(validateDoc(result.doc)).toEqual([]);
    const pages = (text.match(/<diagram\b/g) ?? []).length;
    expect(result.doc.rootDiagramIds).toHaveLength(pages);
    for (const id of result.doc.rootDiagramIds) expect(result.doc.diagrams[id].nodes.length).toBeGreaterThan(0);
  });
});
