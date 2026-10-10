// Carrying a user's browser storage across a rename (D100; the rename policy: "migrates
// old storagePrefix keys to the new prefix once on first launch. No user file or autosave is ever
// orphaned by a rename").
//
// Everything the app keeps in localStorage is keyed `${storagePrefix}:…` — the autosave,
// preferences, Favorites, recently used shapes, sidebar state, tour state, the sample-seen flag.
// On the first load after a rename each old key is copied to the new prefix (unless the new one
// already exists), and the copy is checked. The old keys are kept until the migration is
// confirmed — on a later load, once every copy has been found intact — and only then removed, so
// a session that ends mid-way, or a copy that fails, never loses anything.
//
// The Recent list lives in IndexedDB (file/recentDocs.ts) and is migrated the same way, from the
// old database to the new one.
import { BRAND, LEGACY_BRANDS } from "./brand";

/** The record of a migration, under the new prefix. */
export const MIGRATION_KEY = `${BRAND.storagePrefix}:migratedFrom`;

interface MigrationRecord {
  from: string;
  keys: string[];
  confirmed: boolean;
}

type Store = Pick<Storage, "getItem" | "setItem" | "removeItem" | "key" | "length">;

function keysWithPrefix(store: Store, prefix: string): string[] {
  const keys: string[] = [];
  for (let i = 0; i < store.length; i++) {
    const key = store.key(i);
    if (key?.startsWith(prefix)) keys.push(key);
  }
  return keys;
}

function readRecord(store: Store): Record<string, MigrationRecord> {
  try {
    const raw = store.getItem(MIGRATION_KEY);
    return raw ? (JSON.parse(raw) as Record<string, MigrationRecord>) : {};
  } catch {
    return {};
  }
}

export interface MigrationOutcome {
  /** Old keys copied to the new prefix this time. */
  copied: number;
  /** Old keys removed this time, because an earlier copy was confirmed intact. */
  removed: number;
}

/**
 * Runs once per load, before anything reads storage. Copies every key under an earlier prefix to
 * the current one, and on a later load, once those copies are confirmed, removes the originals.
 */
export function migrateStorage(store: Store = localStorage): MigrationOutcome {
  const outcome: MigrationOutcome = { copied: 0, removed: 0 };
  try {
    const records = readRecord(store);
    for (const legacy of LEGACY_BRANDS) {
      const from = `${legacy.storagePrefix}:`;
      const to = `${BRAND.storagePrefix}:`;
      const record = records[legacy.storagePrefix];

      if (record && !record.confirmed) {
        // A later load: confirm every copy is still there, then let the originals go.
        const intact = record.keys.every((k) => store.getItem(to + k.slice(from.length)) !== null);
        if (intact) {
          for (const k of record.keys) {
            if (store.getItem(k) !== null) {
              store.removeItem(k);
              outcome.removed++;
            }
          }
          records[legacy.storagePrefix] = { ...record, confirmed: true };
        }
      }

      // Anything under the old prefix not yet copied — the first load, or an old tab that wrote
      // after the first migration — is copied now. A key the new prefix already has is newer and
      // left alone.
      const copied: string[] = [];
      for (const k of keysWithPrefix(store, from)) {
        const value = store.getItem(k);
        if (value === null) continue;
        const target = to + k.slice(from.length);
        if (store.getItem(target) === null) {
          store.setItem(target, value);
          outcome.copied++;
        }
        if (store.getItem(target) !== null) copied.push(k);
      }
      if (copied.length > 0) {
        // Still to be confirmed: these originals go on a later load, once their copies are found.
        const before = records[legacy.storagePrefix]?.keys ?? [];
        const keys = Array.from(new Set([...before, ...copied]));
        records[legacy.storagePrefix] = { from: legacy.storagePrefix, keys, confirmed: false };
      }
    }
    if (Object.keys(records).length > 0) store.setItem(MIGRATION_KEY, JSON.stringify(records));
  } catch {
    // Storage blocked or full: nothing is removed unless its copy was confirmed, so a failure here
    // leaves the old keys where they were, to be migrated on a later load.
  }
  return outcome;
}
