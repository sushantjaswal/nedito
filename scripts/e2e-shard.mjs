// Runs one part of the end-to-end suite, the parts balanced by how long each spec file takes
// (D151). Playwright's own --shard splits by test count, which left one CI machine with the slow
// files (render parity, onboarding, templates) and the others idle for minutes.
//
//   node scripts/e2e-shard.mjs 2 4        run part 2 of 4
//   node scripts/e2e-shard.mjs --plan 4   print every part's files and estimated time, run nothing
//
// Files are taken slowest first and each given to the part with the least time so far. The times
// are tests/e2e/durations.json, seconds per spec file from a full local run; a spec file that is
// not in it yet counts as the median, so a new file is never left out. Refresh the times now and
// then, after a full `npm run test:e2e`, with --record and the saved output of that run:
//
//   npm run test:e2e > e2e.log
//   node scripts/e2e-shard.mjs --record e2e.log
import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";

const DIR = "tests/e2e";
const TIMES = `${DIR}/durations.json`;
const args = process.argv.slice(2);

if (args[0] === "--record") {
  const seconds = {};
  for (const line of readFileSync(args[1], "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*ok\s.*?tests[\\/]e2e[\\/]([\w.-]+\.spec\.ts):\d+:\d+ .*\(([\d.]+)(m?s)\)\s*$/);
    if (m) seconds[m[1]] = (seconds[m[1]] ?? 0) + Number(m[2]) / (m[3] === "ms" ? 1000 : 1);
  }
  if (Object.keys(seconds).length === 0) throw new Error(`No passing tests found in ${args[1]}.`);
  const sorted = Object.fromEntries(Object.keys(seconds).sort().map((f) => [f, Math.round(seconds[f] * 10) / 10]));
  writeFileSync(TIMES, `${JSON.stringify(sorted, null, 2)}\n`);
  console.log(`Recorded ${Object.keys(sorted).length} spec files in ${TIMES}.`);
  process.exit(0);
}

const plan = args[0] === "--plan";
const total = Number(plan ? args[1] : args[1]);
const part = plan ? 0 : Number(args[0]);
if (!Number.isInteger(total) || total < 1 || (!plan && !(part >= 1 && part <= total))) {
  console.error("Usage: node scripts/e2e-shard.mjs <part> <of>   |   --plan <of>   |   --record <log>");
  process.exit(2);
}

const files = readdirSync(DIR).filter((f) => f.endsWith(".spec.ts")).sort();
const known = JSON.parse(readFileSync(TIMES, "utf8"));
const values = Object.values(known).sort((a, b) => a - b);
const median = values.length ? values[Math.floor(values.length / 2)] : 1;
const cost = (f) => known[f] ?? median;

// A spec file with no recorded time is costed as the median and balanced on a guess. That is how
// m36-comments.spec.ts, 19 tests of it, ended up invisible to the planner: the parts read as even
// while one machine ran two minutes longer than another. Say so where it will be seen — as a
// pull request annotation under Actions — rather than letting the drift stay silent. It warns and
// carries on instead of failing, because a spec file cannot have a measured time until it has run
// at least once, and blocking that would be a chicken and egg.
const unmeasured = files.filter((f) => !(f in known));
if (unmeasured.length > 0) {
  const line = `${unmeasured.length} spec file(s) have no recorded duration and are being balanced as the median (~${Math.round(median)}s each): ${unmeasured.join(", ")}. Refresh with --record after a full run; see the header of this file.`;
  console.warn(`WARNING: ${line}`);
  if (process.env.GITHUB_ACTIONS) console.log(`::warning title=Unmeasured end-to-end spec files::${line}`);
}

const parts = Array.from({ length: total }, () => ({ files: [], seconds: 0 }));
for (const f of [...files].sort((a, b) => cost(b) - cost(a) || a.localeCompare(b))) {
  const lightest = parts.reduce((min, p) => (p.seconds < min.seconds ? p : min));
  lightest.files.push(f);
  lightest.seconds += cost(f);
}

if (plan) {
  parts.forEach((p, i) => console.log(`part ${i + 1}: ~${Math.round(p.seconds)}s  ${p.files.join(" ")}`));
  process.exit(0);
}

const mine = parts[part - 1].files.map((f) => `${DIR}/${f}`);
console.log(`Part ${part} of ${total}: ${mine.length} spec files, about ${Math.round(parts[part - 1].seconds)}s of tests.`);
const run = spawnSync("npx", ["playwright", "test", ...mine], { stdio: "inherit", shell: process.platform === "win32" });
process.exit(run.status ?? 1);
