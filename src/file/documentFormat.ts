// .nedito encode/decode. See CLAUDE.md ".nedito file format (open format)": pretty-printed
// UTF-8 JSON, self-identifying via "format"/"formatVersion", stable key order for clean Git
// diffs, validated against the model invariants on open, never throws on a bad file.
import { BRAND } from "../app/brand";
import { APP_VERSION } from "../app/version";
import { prunedAssets } from "../model/assets";
import { hasFreeEnd } from "../model/edgeEnds";
import { hasOwnLook } from "../model/look";
import { hasMotion } from "../model/motion";
import { pruneOrders } from "../model/presentation";
import { splitSharedPorts } from "../model/nesting";
import { validateDoc } from "../model/validate";
import type { DiagramDocument, Diagram } from "../model/types";
import { KNOWN_FORMAT_IDS, migrate } from "./migrations";

// v2 (2026-08-20): Port.innerNodeId became optional, so a port can exist in a legitimate
// "unmapped, waiting to be linked" state (see model/types.ts's Port). Old files load
// unchanged — every v1 port is mapped — but a v2 file *can* contain something a v1 app would
// reject as a DANGLING_PORT, so the version bump is what turns that into decodeDoc's clean
// "created with a newer version, please update" message instead of a confusing validation
// failure. See docs/FORMAT.md and file/migrations/.
//
// v3 (2026-09-28): images of the user's own — an `assets` table and `ShapeNode.imageId`
// (CLAUDE_HISTORY.md D79). A document is written as v3 *only when it contains an image*: v3 adds
// nothing a v2 document can hold, so a diagram without images stays v2 and still opens in an app
// that predates images. The bump exists so that an older app shown an image says "newer
// version" instead of drawing blank shapes.
//
// v4 (2026-10-03): an edge end may be free at a `point` instead of on a node — a line drawn from the
// Lines section, or a connection let go on open canvas (CLAUDE_HISTORY.md D86). Written as v4 *only
// when a document has such an end*: an older app would read it as a missing node and lose the line,
// and the bump turns that into its "newer version" message instead.
// v5 (2026-10-05): Nedito's own default look (R6, CLAUDE_HISTORY.md D95). Shapes and edges drawn
// before it carry `style.look = "classic"`; an unmarked one is drawn in the new look. Written as v5
// whenever anything unmarked exists: an older app would draw it in the classic look, and worse, a
// v4 file read back here is migrated by marking everything classic — which would silently restyle
// new work saved as v4.
export const CURRENT_FORMAT_VERSION = 6;

/** The lowest format version that can describe this document. */
function versionFor(assets: DiagramDocument["assets"], freeLines: boolean, ownLook: boolean, motion: boolean): number {
  // Motion (D116): only a document that uses it says v6, so every other file stays readable by
  // an app that predates motion, and an animated one is refused there rather than opened, its
  // motion dropped and saved over.
  if (motion) return 6;
  if (ownLook) return 5;
  if (freeLines) return 4;
  return assets ? 3 : 2;
}

function hasFreeLines(doc: DiagramDocument): boolean {
  return Object.values(doc.diagrams).some((d) => d.edges.some(hasFreeEnd));
}

/**
 * The `formatVersion` encodeDoc writes for this document. Anything that states the version
 * outside the file — a share link's `v=` — must use this, not CURRENT_FORMAT_VERSION, or an
 * older app would refuse a link to a diagram it can read perfectly well.
 */
export function writtenVersion(doc: DiagramDocument): number {
  return versionFor(prunedAssets(doc), hasFreeLines(doc), hasOwnLook(doc), hasMotion(doc));
}

function sortedDiagrams(diagrams: Record<string, Diagram>): Record<string, Diagram> {
  const sorted: Record<string, Diagram> = {};
  for (const id of Object.keys(diagrams).sort()) {
    sorted[id] = diagrams[id];
  }
  return sorted;
}

// Key order matters here (not just for humans): JSON.stringify visits object keys in
// insertion order, and CLAUDE.md requires "format"/"formatVersion" first so a file
// self-identifies from its opening bytes.
export function encodeDoc(doc: DiagramDocument): string {
  // Only the pictures some node still shows: a deleted image's asset stays in memory for undo,
  // but never reaches a file.
  const assets = prunedAssets(doc);
  const envelope = {
    format: BRAND.formatId,
    // Computed, not doc.formatVersion: saving is what upgrades a file. An opened v1 doc is
    // migrated to the in-memory shape on load, so writing back the version it arrived as would
    // mislabel it. See versionFor for why this is not simply CURRENT_FORMAT_VERSION.
    formatVersion: versionFor(assets, hasFreeLines(doc), hasOwnLook(doc), hasMotion(doc)),
    // The app that writes the file, for the same reason (FORMAT.md: "which app version last
    // wrote the file"); read from package.json (app/version.ts), never written out (D110).
    meta: { ...doc.meta, appVersion: APP_VERSION },
    rootDiagramIds: doc.rootDiagramIds,
    // A presentation's order loses the steps whose shapes were deleted (A6, D123): kept in memory
    // for undo, never written.
    diagrams: sortedDiagrams(pruneOrders(doc.diagrams)),
    // Last, so the diagrams read first and the long base64 lines sit at the end of the file.
    ...(assets ? { assets } : {}),
  };
  return JSON.stringify(envelope, null, 2);
}

export type DecodeResult = { ok: true; doc: DiagramDocument } | { ok: false; error: string };

export function decodeDoc(text: string): DecodeResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, error: "This file isn't valid JSON." };
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return { ok: false, error: `This doesn't look like a ${BRAND.name} document.` };
  }
  const raw = parsed as Record<string, unknown>;

  if (typeof raw.format !== "string" || !KNOWN_FORMAT_IDS.includes(raw.format)) {
    return { ok: false, error: `This isn't a ${BRAND.name} file (unrecognized format "${String(raw.format)}").` };
  }
  if (typeof raw.formatVersion !== "number") {
    return { ok: false, error: "This file is missing a format version." };
  }
  if (raw.formatVersion > CURRENT_FORMAT_VERSION) {
    return {
      ok: false,
      error: `This file was created with a newer version of ${BRAND.name} (format v${raw.formatVersion}, this app supports up to v${CURRENT_FORMAT_VERSION}). Please update the app to open it.`,
    };
  }

  const migrated = migrate(raw);

  if (
    typeof migrated.meta !== "object" ||
    migrated.meta === null ||
    !Array.isArray(migrated.rootDiagramIds) ||
    typeof migrated.diagrams !== "object" ||
    migrated.diagrams === null
  ) {
    return { ok: false, error: "This file is missing required fields (meta, rootDiagramIds, or diagrams)." };
  }

  // Repaired, not migrated: no schema ever changed, so there is nothing to bump a
  // formatVersion for. Documents written before a nested node refused to give one port a
  // second edge can contain ports several edges share, which renders as one visible ghost
  // hiding the rest — see model/nesting.ts's splitSharedPorts. Additive and lossless, so
  // running it on every open costs nothing for the documents that don't need it.
  if (migrated.assets !== undefined && (typeof migrated.assets !== "object" || migrated.assets === null || Array.isArray(migrated.assets))) {
    return { ok: false, error: "This file's image table is malformed." };
  }

  const doc: DiagramDocument = splitSharedPorts({
    // In memory a document is always the current shape (migrations run above; v2→v3 needs
    // none). What a file is *written* as is decided separately, by versionFor.
    formatVersion: CURRENT_FORMAT_VERSION,
    meta: migrated.meta as DiagramDocument["meta"],
    rootDiagramIds: migrated.rootDiagramIds as string[],
    diagrams: migrated.diagrams as DiagramDocument["diagrams"],
    ...(migrated.assets ? { assets: migrated.assets as DiagramDocument["assets"] } : {}),
  });

  const errors = validateDoc(doc);
  if (errors.length > 0) {
    const extra = errors.length > 1 ? ` (+${errors.length - 1} more issue${errors.length > 2 ? "s" : ""})` : "";
    return { ok: false, error: `This file failed validation: ${errors[0].message}${extra}` };
  }

  return { ok: true, doc };
}
