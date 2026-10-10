// Rebuilds every committed example.
//
//   npx vite-node examples/build.ts
//
// vite-node ships with Vitest, so this needs nothing beyond `npm install`. (The Azure example's
// README used to say `npx tsx`, which is not a dependency of this project and would have been
// fetched from the network on the spot.)
//
// Each builder only *describes* its document; writing happens here, once, after validation, so a
// builder can also be imported by examples.test.ts to prove the committed file is still exactly
// what it produces.
import { writeFileSync } from "node:fs";
import path from "node:path";
import { encodeDoc } from "../src/file/documentFormat";
import { validateDoc } from "../src/model/validate";
import { EXAMPLES } from "./catalogue";

let failed = false;
for (const example of EXAMPLES) {
  const doc = (await example.load()).default;
  const errors = validateDoc(doc);
  if (errors.length > 0) {
    failed = true;
    console.error(`${example.file} is invalid:`);
    for (const e of errors) console.error("  ", e.code, JSON.stringify(e));
    continue;
  }
  const out = path.join("examples", example.file);
  writeFileSync(out, encodeDoc(doc), "utf-8");
  const diagrams = Object.values(doc.diagrams);
  console.log(
    `wrote ${out}: ${diagrams.length} diagrams, ` +
      `${diagrams.reduce((n, d) => n + d.nodes.length, 0)} nodes, ` +
      `${diagrams.reduce((n, d) => n + d.edges.length, 0)} edges`,
  );
}
if (failed) process.exit(1);
