import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { BRAND } from "./brand";
import { personalWordsIn } from "./personalWords";

// This repository is public, so anything written in it is published. The project's
// rules forbid personal or machine-specific details in any file here — names, addresses,
// handles, home directories, machine names, local URLs, the names of recordings or screenshots on
// someone's own computer. This scan is the guard, in the same spirit as
// styles/fontTokens.test.ts: a rule nobody checks drifts the first time someone forgets it.
// The personal words themselves are checked by hash (personalWords.ts), so this file does not
// publish the very words it keeps out.

/** The one file that may write BRAND.repository, whose URL carries the owner's handle. */
const REPOSITORY_FILE = "src/app/brand.ts";

/** The one address the repository may carry: the product's own contact. */
const ALLOWED_EMAILS = new Set([BRAND.contact]);

/** The dev and preview servers' ports; any other local URL names someone's own setup. */
const ALLOWED_LOCAL_PORTS = new Set(["5173", "4173"]);

const ROOT = process.cwd();
const SKIP_DIRS = new Set([
  ".git",
  "node_modules",
  "dist",
  "dist-ssr",
  "coverage",
  "test-results",
  "playwright-report",
  "blob-report",
  ".vite",
  ".wrangler",
  "worktrees",
]);
const TEXT = /\.(md|ts|tsx|js|mjs|cjs|json|jsonc|css|html|svg|xml|drawio|nedito|deepdraw|yml|yaml|txt)$|(^|[\\/])(NOTICE|LICENSE|\.gitignore|\.gitattributes)$/;

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    if (SKIP_DIRS.has(entry)) return [];
    const full = join(dir, entry);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

const relative = (file: string) => file.slice(ROOT.length + 1).replace(/\\/g, "/");

const PATTERNS: { what: string; re: RegExp; skip?: (rel: string) => boolean }[] = [
  { what: "a Windows home directory", re: /[A-Za-z]:[\\/]+Users[\\/]+(?!<)/gi },
  { what: "a user profile folder", re: /\bAppData[\\/]/g },
  { what: "a personal media folder", re: /[\\/](Videos|Downloads|Pictures|Desktop)[\\/]/g },
  { what: "a recording's file name", re: /\b\d{14}\.(mp4|mov|mkv|webm)\b|RecForth/gi },
  // Vector path data is full of dotted numbers; a stencil's SVG is not where an address hides.
  {
    what: "a private or loopback IP address",
    re: /(?<![\d.])(?:127\.0\.0\.1|192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(?:1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})(?![\d.])/g,
    skip: (rel) => rel.endsWith(".svg"),
  },
];

describe("no personal or machine-specific details in the repository", () => {
  const files = walk(ROOT)
    .filter((f) => TEXT.test(f))
    .map((f) => ({ rel: relative(f), source: readFileSync(f, "utf8") }));

  it("finds the files it is meant to scan", () => {
    const names = files.map((f) => f.rel);
    expect(names).toContain("README.md");
    expect(names).toContain("CONTRIBUTING.md");
    expect(names).toContain("src/app/brand.ts");
  });

  it("names no one: none of the personal words appears in any file", () => {
    const offenders: string[] = [];
    for (const { rel, source } of files) {
      // The repository's own URL carries the owner's GitHub handle; brand.ts is the one file
      // allowed to write it (BRAND.repository, D149), the way BRAND.contact is the one address.
      const checked = rel === REPOSITORY_FILE ? source.split(BRAND.repository).join("") : source;
      for (const hash of personalWordsIn(checked)) offenders.push(`${rel}: a personal word (sha256 ${hash.slice(0, 12)}…)`);
    }
    expect(offenders).toEqual([]);
  });

  it("writes the repository's URL once, in brand.ts", () => {
    const holders = files.filter((f) => f.source.includes(BRAND.repository)).map((f) => f.rel);
    expect(holders).toEqual([REPOSITORY_FILE]);
    expect(files.find((f) => f.rel === REPOSITORY_FILE)!.source.split(BRAND.repository)).toHaveLength(2);
  });

  it("carries no email address but the product's own contact", () => {
    const offenders: string[] = [];
    for (const { rel, source } of files) {
      for (const [address] of source.matchAll(/[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g)) {
        if (!ALLOWED_EMAILS.has(address)) offenders.push(`${rel}: ${address}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("has no local paths, recordings, private addresses or local URLs on other ports", () => {
    const offenders: string[] = [];
    for (const { rel, source } of files) {
      if (rel === "src/app/personalData.test.ts") continue; // its own patterns are written out above
      for (const { what, re, skip } of PATTERNS) {
        if (skip?.(rel)) continue;
        for (const [hit] of source.matchAll(re)) offenders.push(`${rel}: ${what} (${hit})`);
      }
      for (const [, port] of source.matchAll(/\blocalhost:(\d+)/g)) {
        if (!ALLOWED_LOCAL_PORTS.has(port)) offenders.push(`${rel}: a local URL on port ${port}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
