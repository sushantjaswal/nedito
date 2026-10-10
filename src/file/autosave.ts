// localStorage autosave. Keyed under BRAND.storagePrefix so a future rename can migrate the
// key once on first launch (see CLAUDE.md brand indirection rename policy) without ever
// orphaning a user's in-progress diagram.
import { BRAND } from "../app/brand";
import { encodeDoc } from "./documentFormat";
import type { DiagramDocument } from "../model/types";

const AUTOSAVE_KEY = `${BRAND.storagePrefix}:autosave`;

// localStorage can throw (quota exceeded, private browsing, disabled storage) — autosave is
// strictly best-effort and must never crash the app. But it must never fail *silently* either:
// it used to, so a document that outgrew browser storage simply stopped being autosaved, and the
// user found out only by losing work. Pictures made that easy to reach (CLAUDE_HISTORY.md D79),
// so the outcome is now published and the status bar says when autosave is off.
export function saveAutosave(doc: DiagramDocument): boolean {
  let ok = true;
  try {
    localStorage.setItem(AUTOSAVE_KEY, encodeDoc(doc));
  } catch {
    ok = false;
    // A failed write can leave the previous autosave behind. Keep it: a stale copy is still
    // better than none, and the status bar now says the latest changes are not in it.
  }
  setAutosaveWorking(ok);
  return ok;
}

// ---- whether the last autosave succeeded, for the status bar. Session state, not the document.
type Listener = () => void;
let working = true;
const listeners = new Set<Listener>();

function setAutosaveWorking(next: boolean): void {
  if (next === working) return;
  working = next;
  for (const l of listeners) l();
}

/** False once an autosave has failed, until one succeeds again. */
export function isAutosaveWorking(): boolean {
  return working;
}

export function subscribeAutosave(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function readAutosave(): string | null {
  try {
    return localStorage.getItem(AUTOSAVE_KEY);
  } catch {
    return null;
  }
}

export function clearAutosave(): void {
  try {
    localStorage.removeItem(AUTOSAVE_KEY);
  } catch {
    /* best-effort */
  }
}

// ---- an autosave that failed validation on load (R5, D94). Set aside under its own key the
// moment it is found, so the next autosave cannot overwrite it, until the user downloads or
// dismisses it — a broken copy may still hold work worth recovering by hand.
const UNREADABLE_KEY = `${BRAND.storagePrefix}:autosaveUnreadable`;

export function keepUnreadableAutosave(text: string): void {
  try {
    localStorage.setItem(UNREADABLE_KEY, text);
  } catch {
    /* best-effort: the banner still offers it for download this session */
  }
}

export function readUnreadableAutosave(): string | null {
  try {
    return localStorage.getItem(UNREADABLE_KEY);
  } catch {
    return null;
  }
}

export function clearUnreadableAutosave(): void {
  try {
    localStorage.removeItem(UNREADABLE_KEY);
  } catch {
    /* best-effort */
  }
}
