import { beforeEach, describe, expect, it, vi } from "vitest";
import { APP_VERSION } from "../app/version";
import { clearAutosave, readAutosave, saveAutosave } from "./autosave";
import { CURRENT_FORMAT_VERSION, decodeDoc } from "./documentFormat";
import type { DiagramDocument } from "../model/types";

function doc(): DiagramDocument {
  return {
    formatVersion: CURRENT_FORMAT_VERSION,
    meta: { title: "t", created: "", modified: "", appVersion: "0" },
    rootDiagramIds: ["root"],
    diagrams: { root: { id: "root", title: "Page 1", nodes: [], edges: [] } },
  };
}

describe("autosave", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("readAutosave returns null when nothing was saved", () => {
    expect(readAutosave()).toBeNull();
  });

  it("saveAutosave then readAutosave round-trips a decodable doc", () => {
    saveAutosave(doc());
    const text = readAutosave();
    expect(text).not.toBeNull();
    const result = decodeDoc(text!);
    expect(result.ok).toBe(true);
    // Everything comes back as saved, except that the write records the app that made it (D110).
    if (result.ok) expect(result.doc).toEqual({ ...doc(), meta: { ...doc().meta, appVersion: APP_VERSION } });
  });

  it("clearAutosave removes the saved entry", () => {
    saveAutosave(doc());
    clearAutosave();
    expect(readAutosave()).toBeNull();
  });

  it("saveAutosave does not throw when localStorage.setItem throws", () => {
    const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota exceeded");
    });
    expect(() => saveAutosave(doc())).not.toThrow();
    spy.mockRestore();
  });

  it("readAutosave returns null (not throw) when localStorage.getItem throws", () => {
    const spy = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(readAutosave()).toBeNull();
    spy.mockRestore();
  });
});

// D79: autosave used to fail silently, so a document that outgrew browser storage simply stopped
// being saved. Pictures make that easy to reach, so the outcome is now reported.
describe("autosave says when it stops working", () => {
  beforeEach(() => localStorage.clear());

  it("reports a failed write, and recovers when a later one succeeds", async () => {
    const { isAutosaveWorking } = await import("./autosave");
    const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("quota", "QuotaExceededError");
    });
    expect(saveAutosave(doc())).toBe(false);
    expect(isAutosaveWorking()).toBe(false);
    spy.mockRestore();
    expect(saveAutosave(doc())).toBe(true);
    expect(isAutosaveWorking()).toBe(true);
  });

  it("tells subscribers only when the state changes", async () => {
    const { subscribeAutosave } = await import("./autosave");
    const seen = vi.fn();
    const unsubscribe = subscribeAutosave(seen);
    saveAutosave(doc()); // still working: no change
    expect(seen).not.toHaveBeenCalled();
    const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("full");
    });
    saveAutosave(doc());
    saveAutosave(doc()); // still failing: no second call
    expect(seen).toHaveBeenCalledTimes(1);
    spy.mockRestore();
    saveAutosave(doc());
    expect(seen).toHaveBeenCalledTimes(2);
    unsubscribe();
  });
});
