// Backs up the local working notes — CLAUDE.md, PROGRESS.md and CLAUDE_HISTORY.md, which are kept
// out of this public repository (.gitignore) — to a private notes repository.
//
//   npm run notes:backup
//
// Copies the three files into a local clone of the notes repository, commits with the date and the
// current commit of this repository, and pushes. Safe to run again and again: when nothing changed
// it says so and makes no commit. Also run by the post-merge hook in .githooks/ (see README,
// "Running it locally").
//
// Where the clone is comes from the environment, never from this file: NEDITO_NOTES_REPO, or by
// default a folder called nedito-notes beside this project. The notes repository's address, for
// the clone command printed when the clone is missing, is worked out from this repository's own
// origin remote.
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";

const GOVERNANCE = ["CLAUDE.md", "PROGRESS.md", "CLAUDE_HISTORY.md"];
const PROJECT = process.cwd();

/**
 * The markdown this project is allowed to keep, and nothing else — the same list CLAUDE.md states
 * and .gitignore enforces. Stated as what may stay rather than what must go: a filename cannot
 * carry intent, so a deny list always misses the next document someone writes.
 */
const ALLOWED = new Set(["README.md", "LICENSE.md", "CONTRIBUTING.md", "SECURITY.md", "CODE_OF_CONDUCT.md", "FORMAT.md", "CHANGELOG.md"]);

/** Never walked: a dependency's own markdown is its business, and build output is not a document. */
const SKIP_DIRS = new Set(["node_modules", ".git", "dist", "dist-ssr", "coverage", "test-results", "playwright-report", "blob-report", ".wrangler", ".vite"]);

/**
 * Every markdown file in this project that belongs in the notes repository, as a path relative to
 * the project, deepest paths included: audits and reports live under docs/, not only at the root.
 */
function documents(dir = PROJECT) {
  const out = [];
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) out.push(...documents(full));
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith(".md") && !ALLOWED.has(entry.name)) {
      out.push(relative(PROJECT, full).split("\\").join("/"));
    }
  }
  return out.sort();
}

const FILES = documents();
const NOTES = resolve(process.env.NEDITO_NOTES_REPO || join(PROJECT, "..", `${basename(PROJECT)}-notes`));

/** Runs git, returning its trimmed output; on failure, prints git's own message and exits. */
function git(cwd, ...args) {
  const r = spawnSync("git", args, { cwd, encoding: "utf8" });
  if (r.status !== 0) {
    console.error(`notes:backup: git ${args.join(" ")} failed:\n${(r.stderr || r.stdout).trim()}`);
    process.exit(1);
  }
  return r.stdout.trim();
}

// A clone without the notes (a contributor's, say) has nothing to back up: say so quietly. Judged
// on the governance files, since the working documents come and go.
const missing = FILES.filter((f) => !existsSync(join(PROJECT, f)));
if (GOVERNANCE.every((f) => missing.includes(f))) {
  console.log("notes:backup: none of the notes files are here; nothing to back up.");
  process.exit(0);
}

if (!existsSync(join(NOTES, ".git"))) {
  const origin = spawnSync("git", ["remote", "get-url", "origin"], { cwd: PROJECT, encoding: "utf8" }).stdout?.trim() ?? "";
  const remote = origin ? origin.replace(/(\.git)?$/, "").replace(/$/, "-notes.git") : "<the notes repository's URL>";
  console.log(`notes:backup: no clone of the notes repository at ${NOTES}.`);
  console.log("Clone it there once, then run this again:");
  console.log(`\n  git clone ${remote} "${NOTES}"\n`);
  console.log("Or set NEDITO_NOTES_REPO to where your clone is.");
  process.exit(1);
}

for (const f of FILES) {
  if (missing.includes(f)) {
    console.log(`notes:backup: ${f} is not in this folder; skipped.`);
    continue;
  }
  // A document under docs/ keeps its folder, so where it sat here is still readable there.
  mkdirSync(dirname(join(NOTES, f)), { recursive: true });
  copyFileSync(join(PROJECT, f), join(NOTES, f));
}

git(NOTES, "add", "--", ...FILES.filter((f) => !missing.includes(f)));
if (git(NOTES, "status", "--porcelain") === "") {
  console.log("notes:backup: the notes have not changed since the last backup; nothing to do.");
  process.exit(0);
}

const sha = git(PROJECT, "rev-parse", "--short", "HEAD");
const date = new Date().toISOString().slice(0, 10);
git(NOTES, "commit", "--quiet", "-m", `Back up notes, ${date}, at nedito ${sha}`);
git(NOTES, "push", "--quiet", "-u", "origin", "HEAD");
const changed = git(NOTES, "show", "--stat", "--format=", "HEAD").split("\n").filter(Boolean);
console.log(`notes:backup: backed up and pushed (nedito ${sha}).`);
for (const line of changed) console.log(`  ${line.trim()}`);
