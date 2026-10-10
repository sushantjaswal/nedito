import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ShareDialog } from "./ShareDialog";
import { encodeDocToFragment, formatShareSize, readSharePath } from "./urlCodec";
import { SHARE_URL_MAX_CHARS } from "./constants";
import { createEmptyDoc, useDocStore } from "../model/store";

function openDialog() {
  act(() => useDocStore.getState().openShareDialog());
}

describe("formatShareSize", () => {
  it("reads as the spec's indicator", () => {
    expect(formatShareSize(4200)).toBe("Link size: 4.2 KB of 16 KB");
  });

  it("uses the same units as the limit it is measured against", () => {
    expect(formatShareSize(SHARE_URL_MAX_CHARS)).toBe("Link size: 16.0 KB of 16 KB");
  });
});

describe("the &p= path parameter", () => {
  it("is absent unless the sharer asked to open at a level", async () => {
    const fragment = await encodeDocToFragment(createEmptyDoc());
    expect(readSharePath(fragment)).toBeNull();
  });

  it("round-trips the diagram the reader should land on", async () => {
    const fragment = await encodeDocToFragment(createEmptyDoc(), { openAtDiagramId: "abc123" });
    expect(readSharePath(fragment)).toBe("abc123");
  });

  it("survives an id that needs escaping rather than corrupting the fragment", async () => {
    const fragment = await encodeDocToFragment(createEmptyDoc(), { openAtDiagramId: "a&b=c" });
    expect(readSharePath(fragment)).toBe("a&b=c");
  });
});

describe("ShareDialog", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    useDocStore.getState().loadDoc(createEmptyDoc());
    useDocStore.getState().closeShareDialog();
  });

  it("stays shut until File > Share opens it", () => {
    render(<ShareDialog />);
    expect(screen.queryByTestId("nd-share-dialog")).toBeNull();
  });

  it("shows the link, its size and the privacy line", async () => {
    openDialog();
    render(<ShareDialog />);

    const field = (await screen.findByTestId("nd-share-url")) as HTMLInputElement;
    await waitFor(() => expect(field.value).toContain("#d="));
    expect(field.readOnly).toBe(true);
    expect(screen.getByTestId("nd-share-size")).toHaveTextContent(/Link size: \d+\.\d KB of 16 KB/);
    expect(screen.getByTestId("nd-share-privacy")).toHaveTextContent("Nothing is uploaded");
  });

  // The copy accuracy rule (never "secure", "encrypted" or "private by design"), applied to the copy that makes the privacy
  // claim: browser storage and a URL are neither secure nor private, and saying so would be a
  // promise this app cannot keep. "Nothing is uploaded" is true and checkable.
  it("never claims the link is secure, encrypted or private", async () => {
    openDialog();
    render(<ShareDialog />);
    const dialog = await screen.findByTestId("nd-share-dialog");
    await waitFor(() => expect(screen.getByTestId("nd-share-size")).toBeInTheDocument());

    const text = dialog.textContent?.toLowerCase() ?? "";
    for (const forbidden of ["secure", "encrypted", "private"]) expect(text).not.toContain(forbidden);
  });

  it("copies the link, and selects it even when the clipboard API refuses", async () => {
    const writeText = vi.fn().mockRejectedValue(new Error("denied"));
    vi.stubGlobal("navigator", { clipboard: { writeText } });

    openDialog();
    render(<ShareDialog />);
    const field = (await screen.findByTestId("nd-share-url")) as HTMLInputElement;
    await waitFor(() => expect(field.value).toContain("#d="));

    const select = vi.spyOn(field, "select");
    await act(async () => {
      fireEvent.click(screen.getByTestId("nd-share-copy"));
    });

    expect(writeText).toHaveBeenCalledWith(field.value);
    expect(select).toHaveBeenCalled();
  });

  it("closes on Escape", async () => {
    openDialog();
    render(<ShareDialog />);
    await screen.findByTestId("nd-share-dialog");

    fireEvent.keyDown(window, { key: "Escape" });
    expect(useDocStore.getState().ui.shareDialogOpen).toBe(false);
  });

  // "Open at this level" is meaningless at the top: there is no level to open at.
  it("offers 'Open at this level' only when the sharer is inside a nested block", async () => {
    openDialog();
    const { rerender } = render(<ShareDialog />);
    await screen.findByTestId("nd-share-dialog");
    expect(screen.queryByTestId("nd-share-open-at-level")).toBeNull();

    act(() => {
      const s = useDocStore.getState();
      const { nestedNodeId } = s.addNestedNode({ x: 0, y: 0 }, { w: 200, h: 140 });
      s.navigateInto(nestedNodeId);
    });
    rerender(<ShareDialog />);
    expect(await screen.findByTestId("nd-share-open-at-level")).toBeInTheDocument();
  });

  it("adds &p= to the link when that box is ticked", async () => {
    act(() => {
      const s = useDocStore.getState();
      const { nestedNodeId } = s.addNestedNode({ x: 0, y: 0 }, { w: 200, h: 140 });
      s.navigateInto(nestedNodeId);
    });
    const childId = useDocStore.getState().currentDiagramId();

    openDialog();
    render(<ShareDialog />);
    const field = (await screen.findByTestId("nd-share-url")) as HTMLInputElement;
    await waitFor(() => expect(field.value).toContain("#d="));
    expect(readSharePath(new URL(field.value).hash)).toBeNull();

    await act(async () => {
      fireEvent.click(screen.getByTestId("nd-share-open-at-level"));
    });
    await waitFor(() => expect(readSharePath(new URL(field.value).hash)).toBe(childId));
  });
});
