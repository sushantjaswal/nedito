import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Notice } from "./Notice";
import { createEmptyDoc, useDocStore } from "../model/store";

describe("Notice", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    useDocStore.getState().loadDoc(createEmptyDoc());
    useDocStore.getState().dismissNotice();
  });

  it("shows nothing when there is nothing to say", () => {
    render(<Notice />);
    expect(screen.queryByTestId("nd-notice")).toBeNull();
  });

  it("shows a message and dismisses on the close button", () => {
    act(() => useDocStore.getState().showNotice({ message: "Image copied.", tone: "info" }));
    render(<Notice />);

    expect(screen.getByTestId("nd-notice")).toHaveTextContent("Image copied.");
    fireEvent.click(screen.getByTestId("nd-notice-close"));
    expect(screen.queryByTestId("nd-notice")).toBeNull();
  });

  it("offers the file download when a diagram is too large for a link", () => {
    vi.stubGlobal("URL", { createObjectURL: vi.fn(() => "blob:mock"), revokeObjectURL: vi.fn() });
    act(() =>
      useDocStore.getState().showNotice({ message: "Too big for a link.", tone: "warn", action: "download-doc" }),
    );
    render(<Notice />);

    fireEvent.click(screen.getByTestId("nd-notice-action"));
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId("nd-notice")).toBeNull();
  });

  // The honest failure mode for "copy to clipboard": the browser refuses. Telling someone their
  // link exists without showing it would leave them with nothing to act on.
  it("hands over the URL when the clipboard write was the thing that failed", () => {
    act(() =>
      useDocStore
        .getState()
        .showNotice({ message: "Clipboard blocked.", tone: "warn", url: "https://x.test/#d=abc&v=2" }),
    );
    render(<Notice />);

    const field = screen.getByTestId("nd-notice-url") as HTMLInputElement;
    expect(field.value).toBe("https://x.test/#d=abc&v=2");
    expect(field.readOnly).toBe(true);
    expect(screen.getByTestId("nd-notice-copy")).toBeInTheDocument();
  });

  it("selects the URL even when the clipboard API refuses, so Ctrl+C still works", async () => {
    vi.stubGlobal("navigator", { clipboard: { writeText: vi.fn().mockRejectedValue(new Error("denied")) } });
    act(() => useDocStore.getState().showNotice({ message: "Blocked.", tone: "warn", url: "https://x.test/#d=a" }));
    render(<Notice />);

    const field = screen.getByTestId("nd-notice-url") as HTMLInputElement;
    const select = vi.spyOn(field, "select");
    await act(async () => {
      fireEvent.click(screen.getByTestId("nd-notice-copy"));
    });

    expect(select).toHaveBeenCalled();
    // Still on screen: a notice the user can't act on yet must not vanish.
    expect(screen.getByTestId("nd-notice")).toBeInTheDocument();
  });

  it("auto-dismisses a plain message but never one carrying a link or a button", () => {
    vi.useFakeTimers();
    try {
      act(() => useDocStore.getState().showNotice({ message: "Copied.", tone: "info" }));
      const { rerender } = render(<Notice />);
      act(() => void vi.advanceTimersByTime(6500));
      expect(useDocStore.getState().ui.notice).toBeNull();

      act(() => useDocStore.getState().showNotice({ message: "Blocked.", tone: "warn", url: "https://x.test/#d=a" }));
      rerender(<Notice />);
      act(() => void vi.advanceTimersByTime(20000));
      expect(useDocStore.getState().ui.notice).not.toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});
