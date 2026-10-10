import { beforeEach, describe, expect, it, vi } from "vitest";
import { readTheme, writeTheme } from "./theme";

beforeEach(() => {
  localStorage.clear();
});

describe("readTheme", () => {
  it("defaults to light when nothing is stored", () => {
    expect(readTheme()).toBe("light");
  });

  it("returns dark once written", () => {
    writeTheme("dark");
    expect(readTheme()).toBe("dark");
  });

  it("falls back to light for a corrupt/unknown stored value", () => {
    localStorage.setItem("nedito:theme", "purple");
    expect(readTheme()).toBe("light");
  });

  it("readTheme falls back to light when localStorage.getItem throws", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(readTheme()).toBe("light");
    vi.restoreAllMocks();
  });

  it("writeTheme does not throw when localStorage.setItem throws", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(() => writeTheme("dark")).not.toThrow();
    vi.restoreAllMocks();
  });
});
