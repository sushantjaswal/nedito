// Recent diagrams: the last few documents this browser has had open, kept so that replacing one
// (New, Open, a template, a Recent entry, R5's "Start new") never loses it (R2, CLAUDE_HISTORY.md
// D91). A browser cannot reopen a file from disk without asking for it again, so Recent keeps the
// documents themselves rather than file paths.
//
// Stored in the browser's own IndexedDB — not localStorage, whose ~5 MB would hold only a couple
// of diagrams with pictures in them. Nothing leaves the browser, so the "Local only · nothing
// uploaded" claim stays literally true. No dependency: IndexedDB is a platform API.
//
// Each entry is the document as a `.nedito` file would hold it (encodeDoc), so reopening one goes
// through decodeDoc's validation exactly like opening a file — a damaged entry is reported, never
// loaded half-broken. A document is identified by its `meta.created` stamp, which survives edits:
// remembering the same diagram again replaces its entry rather than adding a second.
import { BRAND, LEGACY_BRANDS } from "../app/brand";
import { decodeDoc, encodeDoc, type DecodeResult } from "./documentFormat";
import type { DiagramDocument } from "../model/types";

export const RECENT_LIMIT = 8;

export interface RecentEntry {
  key: string;
  title: string;
  savedAt: number;
  /** Shapes across every page and level, so an entry can say how much is in it. */
  shapeCount: number;
}

interface StoredEntry extends RecentEntry {
  file: string;
}

/** Where entries live. IndexedDB in the browser; an in-memory stand-in in tests. */
export interface RecentBackend {
  all(): Promise<StoredEntry[]>;
  put(entry: StoredEntry): Promise<void>;
  remove(key: string): Promise<void>;
}

/** True when a document has anything in it worth keeping. */
export function hasContent(doc: DiagramDocument): boolean {
  return Object.values(doc.diagrams).some((d) => d.nodes.length > 0 || d.edges.length > 0);
}

function keyOf(doc: DiagramDocument): string {
  return `${doc.meta.created}|${doc.rootDiagramIds[0] ?? ""}`;
}

/**
 * Remembers a document as the most recent entry, keeping at most RECENT_LIMIT. Empty ones are
 * skipped. True once it is stored; false when it was empty or this browser has nowhere to keep it.
 */
export async function rememberDocument(doc: DiagramDocument, backend: RecentBackend | null = defaultBackend()): Promise<boolean> {
  if (!backend || !hasContent(doc)) return false;
  const entry: StoredEntry = {
    key: keyOf(doc),
    title: doc.meta.title || "Untitled diagram",
    savedAt: Date.now(),
    shapeCount: Object.values(doc.diagrams).reduce((n, d) => n + d.nodes.filter((x) => x.type !== "group").length, 0),
    file: encodeDoc(doc),
  };
  await backend.put(entry);
  const all = (await backend.all()).sort((a, b) => b.savedAt - a.savedAt);
  for (const old of all.slice(RECENT_LIMIT)) await backend.remove(old.key);
  return true;
}

/** The remembered documents, newest first, without their content. */
export async function listRecent(backend: RecentBackend | null = defaultBackend()): Promise<RecentEntry[]> {
  if (!backend) return [];
  const all = (await backend.all()).sort((a, b) => b.savedAt - a.savedAt).slice(0, RECENT_LIMIT);
  return all.map(({ key, title, savedAt, shapeCount }) => ({ key, title, savedAt, shapeCount }));
}

/** One remembered document, validated as an opened file is. */
export async function loadRecent(key: string, backend: RecentBackend | null = defaultBackend()): Promise<DecodeResult> {
  const entry = backend ? (await backend.all()).find((e) => e.key === key) : undefined;
  if (!entry) return { ok: false, error: "That diagram is no longer in Recent." };
  return decodeDoc(entry.file);
}

// ---------------------------------------------------------------------------- IndexedDB

const dbNameFor = (prefix: string) => `${prefix}-recent`;
const DB_NAME = dbNameFor(BRAND.storagePrefix);
const STORE = "documents";

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** Opens a Recent database; `create` false refuses to make one that does not exist yet. */
function openDb(name: string, create = true): Promise<IDBDatabase> {
  const req = indexedDB.open(name, 1);
  req.onupgradeneeded = () => {
    // Only a database that does not exist yet is "upgraded" from version 0.
    if (!create) {
      req.transaction?.abort();
      return;
    }
    if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE, { keyPath: "key" });
  };
  return request(req);
}

function backendFor(name: string, create = true): RecentBackend {
  const withStore = async <T,>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> => {
    const db = await openDb(name, create);
    try {
      return await request(run(db.transaction(STORE, mode).objectStore(STORE)));
    } finally {
      db.close();
    }
  };
  return {
    all: () => withStore("readonly", (s) => s.getAll() as IDBRequest<StoredEntry[]>),
    put: async (entry) => void (await withStore("readwrite", (s) => s.put(entry))),
    remove: async (key) => void (await withStore("readwrite", (s) => s.delete(key))),
  };
}

const indexedDbBackend = backendFor(DB_NAME);

/**
 * Copies every entry `from` has into `to`, skipping any `to` already holds (it is newer), and
 * reports whether all of them are now in `to` — the confirmation that lets the old copy go.
 */
export async function copyRecent(from: RecentBackend, to: RecentBackend): Promise<boolean> {
  const entries = await from.all();
  const have = new Set((await to.all()).map((e) => e.key));
  for (const entry of entries) if (!have.has(entry.key)) await to.put(entry);
  const now = new Set((await to.all()).map((e) => e.key));
  return entries.every((e) => now.has(e.key));
}

/**
 * The Recent list's half of the rename's storage migration (app/storageMigration.ts, D100): each
 * earlier database is copied into the current one, and deleted only once every entry is confirmed
 * there. Nothing to do, and nothing created, where no earlier database exists.
 */
export async function migrateLegacyRecent(): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  for (const legacy of LEGACY_BRANDS) {
    const name = dbNameFor(legacy.storagePrefix);
    try {
      if (await copyRecent(backendFor(name, false), indexedDbBackend)) indexedDB.deleteDatabase(name);
    } catch {
      // No such database (the open was refused), or blocked storage: nothing to carry over now.
    }
  }
}

/** IndexedDB when the browser has it; none (Recent stays empty) where it does not. */
function defaultBackend(): RecentBackend | null {
  return typeof indexedDB === "undefined" ? null : indexedDbBackend;
}

/** For tests: a backend held in memory. */
export function memoryBackend(): RecentBackend {
  const map = new Map<string, StoredEntry>();
  return {
    all: async () => [...map.values()],
    put: async (e) => void map.set(e.key, e),
    remove: async (k) => void map.delete(k),
  };
}
