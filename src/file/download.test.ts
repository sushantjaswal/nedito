import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { downloadBlob, downloadText } from "./download";

describe("downloadBlob", () => {
  let clickSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.stubGlobal("URL", {
      ...URL,
      createObjectURL: vi.fn(() => "blob:mock-url"),
      revokeObjectURL: vi.fn(),
    });
    clickSpy = vi.fn();
    const originalCreateElement = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
      const el = originalCreateElement(tag);
      if (tag === "a") el.click = clickSpy;
      return el;
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("creates a temporary anchor, clicks it with the right filename, and revokes the object URL", () => {
    downloadBlob(new Blob(["hello"]), "diagram.nedito");

    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:mock-url");
  });

  it("downloadText wraps the text in a Blob and downloads it the same way", () => {
    downloadText("hello", "note.txt", "text/plain");
    expect(clickSpy).toHaveBeenCalledTimes(1);
  });
});
