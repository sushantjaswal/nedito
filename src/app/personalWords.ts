import { createHash } from "node:crypto";

// For tests only; nothing the app ships imports this. The personal words the repository must
// never carry (CLAUDE.md's working agreements, CLAUDE_HISTORY.md D145), stored as SHA-256 hashes
// of their lowercase form so that the guard does not publish the very words it keeps out.
const PERSONAL_WORD_HASHES = new Set([
  "be58414e65f0f8ab95c6b21b7ddd62aa5b56f718b037fdbf95908b4919fc7cd5",
  "7d2ac5fa2cafacbcdff7070ac5a69b6f19da0c1b1b265b903632b474eca3948a",
  "922ff4b10ca1cab4fc6e43e7a63243eaced1acba1f7e8b85ea730c71dad8d62b",
  "fc349e7ade01a1ee1b949d994f81544ec19100c2bb387176fc17a750e831c164",
]);

/** The hashes of the personal words in a text, a word being any run of letters and digits. */
export function personalWordsIn(text: string): string[] {
  const words = new Set(text.toLowerCase().match(/[a-z0-9]+/g) ?? []);
  return [...words].map((w) => createHash("sha256").update(w).digest("hex")).filter((h) => PERSONAL_WORD_HASHES.has(h));
}
