// Format-version migration registry: a breaking change bumps formatVersion and adds a
// migration here, so every older file still opens.
//
// Also the rename-policy map: "after any rename, the app
// writes the new formatId/extension but reads all previous formatIds forever." The ids come from
// brand.ts: the current one first, then every earlier one ("deepdraw", the name until D100).
import { BRAND, LEGACY_BRANDS } from "../../app/brand";

export const KNOWN_FORMAT_IDS: readonly string[] = [BRAND.formatId, ...LEGACY_BRANDS.map((b) => b.formatId)];

export type MigrationFn = (raw: Record<string, unknown>) => Record<string, unknown>;

// v1 -> v2:
//   1. Port.innerNodeId became optional (unmapped ports — see model/types.ts). No stored data
//      has to change: every v1 port is mapped, which is still perfectly valid in v2.
//   2. Drops the literal "Empty" placeholder that v1 wrote into every new nested node's
//      `collapsed.summary`. The collapsed view now derives emptiness live from the child's
//      contents, so that string would otherwise keep showing "Empty" under a thumbnail of a
//      diagram that plainly isn't. Only the exact placeholder is removed — an author who
//      genuinely typed something keeps it.
const migrateV1ToV2: MigrationFn = (raw) => {
  const diagrams = raw.diagrams as Record<string, { nodes?: unknown[] }> | undefined;
  if (diagrams) {
    for (const diagram of Object.values(diagrams)) {
      for (const node of diagram.nodes ?? []) {
        const n = node as { type?: string; collapsed?: { summary?: string } };
        if (n.type === "nested" && n.collapsed?.summary === "Empty") delete n.collapsed.summary;
      }
    }
  }
  return { ...raw, formatVersion: 2 };
};

// v2 -> v3 needs no migration: v3 only adds images (an `assets` table and ShapeNode.imageId), so a
// v2 document is already a valid v3 one. It stays v2 in memory and is written back as v2 unless
// an image is added (see documentFormat.ts's versionFor).
// v3 -> v4 needs none either: v4 only adds free edge ends (EdgeEnd.point), so every v3 edge, attached
// at both ends, is already a valid v4 one. Written as v4 only when a free end exists (versionFor).
// v4 -> v5: DeepDraw's own default look. Unset colours, corners and
// arrowheads now resolve to the new look, so every shape and edge from before it is marked
// `look: "classic"` to keep drawing exactly as it did (see model/look.ts). Groups and Nested
// Blocks draw their own way and are not marked.
const migrateV4ToV5: MigrationFn = (raw) => {
  const diagrams = raw.diagrams as Record<string, { nodes?: unknown[]; edges?: unknown[] }> | undefined;
  const mark = (item: unknown) => {
    const it = item as { style?: Record<string, unknown> };
    it.style = { ...(it.style ?? {}), look: "classic" };
  };
  if (diagrams) {
    for (const diagram of Object.values(diagrams)) {
      for (const node of diagram.nodes ?? []) if ((node as { type?: string }).type === "shape") mark(node);
      for (const edge of diagram.edges ?? []) mark(edge);
    }
  }
  return { ...raw, formatVersion: 5 };
};

// v2 and v3 changed nothing stored (see above), so they simply move on; the chain has to reach v4's
// migration from any older file.
const bumpTo = (version: number): MigrationFn => (raw) => ({ ...raw, formatVersion: version });

const MIGRATIONS: Record<number, MigrationFn> = {
  1: migrateV1ToV2,
  2: bumpTo(3),
  3: bumpTo(4),
  4: migrateV4ToV5,
  // v6 only adds optional motion properties (D116): nothing in a v5 file changes.
  5: bumpTo(6),
  // v7 only adds the optional `comments` array: nothing in a v6 file changes either.
  // (Early v7 files spelled that array `notes` — see renameNotesKey below.)
  6: bumpTo(7),
};

/**
 * The first v7 files called the comments array `notes`, before the feature took the word every
 * reader already knows. Those files are read forever, like every older formatId: the key moves
 * across on the way in, and the document is written back with the current name. No migration step
 * can do this, because such a file already says 7 and so passes the chain untouched.
 */
function renameNotesKey(raw: Record<string, unknown>): Record<string, unknown> {
  if (!("notes" in raw)) return raw;
  const { notes, ...rest } = raw;
  return "comments" in rest ? rest : { ...rest, comments: notes };
}

export function migrate(raw: Record<string, unknown>): Record<string, unknown> {
  let current = renameNotesKey(raw);
  let version = current.formatVersion as number;
  while (typeof version === "number" && MIGRATIONS[version]) {
    current = MIGRATIONS[version](current);
    version = current.formatVersion as number;
  }
  return current;
}
