// Runs before anything else is imported (main.tsx imports this first): the rename's storage
// migration has to finish before any module reads a stored setting at load, and an alias host's
// redirect has to happen before the app draws anything (D100).
import { decideOrigin, type OriginDecision } from "./originGuard";
import { migrateStorage } from "./storageMigration";

migrateStorage();
// The Recent list is IndexedDB, asynchronous, and only read when the app menu opens: fine to
// follow on. Loaded on demand so this module stays free of the document code.
void import("../file/recentDocs").then((m) => m.migrateLegacyRecent()).catch(() => {});

let decision: OriginDecision = { kind: "stay" };
try {
  decision = decideOrigin(window.location, localStorage);
} catch {
  // storage blocked entirely: decideOrigin's own guard covers reads; this covers the rest
}
if (decision.kind === "redirect") window.location.replace(decision.to);

/** This load's origin decision, for main.tsx (stop) and the moved notice (show). */
export const ORIGIN_DECISION: OriginDecision = decision;
