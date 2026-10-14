import { beforeEach, describe, expect, it, vi } from "vitest";
import { readLayoutDirection, writeLayoutDirection } from "./layoutDirection";

describe("the remembered layout direction", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("starts out left to right, and comes back as whatever was written", () => {
    expect(readLayoutDirection()).toBe("right");
    writeLayoutDirection("down");
    expect(readLayoutDirection()).toBe("down");
    writeLayoutDirection("right");
    expect(readLayoutDirection()).toBe("right");
  });

  it("falls back to left to right on anything else stored under the key", () => {
    localStorage.setItem("nedito:layoutDirection", "sideways");
    expect(readLayoutDirection()).toBe("right");
  });

  it("survives storage that throws, rather than taking the app down with it", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(readLayoutDirection()).toBe("right");
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota");
    });
    expect(() => writeLayoutDirection("down")).not.toThrow();
  });
});
