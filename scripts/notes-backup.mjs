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
import { copyFileSync, existsSync, readdirSync } from "node:fs";
import { basename, join, resolve } from "node:path";

const GOVERNANCE = ["CLAUDE.md", "PROGRESS.md", "CLAUDE_HISTORY.md"];
const PROJECT = process.cwd();

/**
 * The working documents a change is worked out in — scope and spec documents, audit reports —
 * which belong in the notes repository beside the governance files. Matched by name rather than
 * listed, so a new one is carried over without this script learning its name, and the names match
 * what this project's .gitignore keeps out of the public repository. Only the project root is
 * looked at: these are working documents, not part of docs/.
 */
const WORKING_DOCUMENT = /^(Nedito_.*|.*Scope.*|.*Spec.*|security-audit-.*)\.md$/i;

function workingDocuments() {
  try {
    return readdirSync(PROJECT, { withFileTypes: true })
      .filter((e) => e.isFile() && WORKING_DOCUMENT.test(e.name) && !GOVERNANCE.includes(e.name))
      .map((e) => e.name)
      .sort();
  } catch {
    return [];
  }
}

const FILES = [...GOVERNANCE, ...workingDocuments()];
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
  if (missing.includes(f)) console.log(`notes:backup: ${f} is not in this folder; skipped.`);
  else copyFileSync(join(PROJECT, f), join(NOTES, f));
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
