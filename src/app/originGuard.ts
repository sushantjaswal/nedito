// One canonical address (D100). The app is also served at www.nedito.app, which is its own
// browser origin, with its own autosave that nedito.app cannot read. (The old myconifer.app was
// once handled here too; it is no longer served, D106.)
//
// So on an alias host the app either sends the visitor straight on to the same path, query and
// `#` fragment on nedito.app (the whole shared diagram travels in that fragment), or — when this
// origin holds work of theirs — first says the app has moved and offers to download that work,
// because redirecting would strand it here. Once they have seen that for a given autosave, later
// visits go straight through until it changes.
import { ALIAS_HOSTS, APP_ORIGIN, BRAND, LEGACY_BRANDS } from "./brand";

interface Place {
  hostname: string;
  pathname: string;
  search: string;
  hash: string;
}

type Store = Pick<Storage, "getItem" | "setItem">;

/** Where an alias host's page lives on the canonical host; null on any other host. */
export function canonicalUrlFor(place: Place): string | null {
  if (!ALIAS_HOSTS.includes(place.hostname)) return null;
  return `${APP_ORIGIN}${place.pathname}${place.search}${place.hash}`;
}

const prefixes = () => [BRAND.storagePrefix, ...LEGACY_BRANDS.map((b) => b.storagePrefix)];

/** The autosave this origin holds, under the current prefix or an earlier one; null when none. */
export function localAutosave(store: Store): string | null {
  for (const prefix of prefixes()) {
    for (const key of [`${prefix}:autosave`, `${prefix}:autosaveUnreadable`]) {
      const text = store.getItem(key);
      if (text) return text;
    }
  }
  return null;
}

/** Whether an autosave is work worth keeping: anything drawn, or anything that could not be read. */
export function isWork(autosave: string | null): boolean {
  if (!autosave) return false;
  try {
    const doc = JSON.parse(autosave) as { diagrams?: Record<string, { nodes?: unknown[]; edges?: unknown[] }> };
    return Object.values(doc.diagrams ?? {}).some((d) => (d.nodes?.length ?? 0) > 0 || (d.edges?.length ?? 0) > 0);
  } catch {
    // Unreadable is still someone's work (D94): never drop it silently.
    return true;
  }
}

const ACK_KEY = `${BRAND.storagePrefix}:movedNoticeSeen`;

/** A short fingerprint of an autosave, to tell "the same work they already saw the notice for". */
function fingerprint(text: string): string {
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0;
  return `${text.length}:${h >>> 0}`;
}

export function acknowledgeMove(store: Store = localStorage): void {
  const text = localAutosave(store);
  try {
    if (text) store.setItem(ACK_KEY, fingerprint(text));
  } catch {
    // best-effort: at worst the notice shows again next time
  }
}

export type OriginDecision =
  | { kind: "stay" }
  | { kind: "redirect"; to: string }
  | { kind: "notice"; to: string };

/** What to do with this page load: nothing, go straight to the canonical host, or ask first. */
export function decideOrigin(place: Place, store: Store): OriginDecision {
  const to = canonicalUrlFor(place);
  if (!to) return { kind: "stay" };
  let autosave: string | null = null;
  let seen: string | null = null;
  try {
    autosave = localAutosave(store);
    seen = store.getItem(ACK_KEY);
  } catch {
    // storage blocked: nothing of theirs can be here
  }
  if (!isWork(autosave) || (autosave && seen === fingerprint(autosave))) return { kind: "redirect", to };
  return { kind: "notice", to };
}
