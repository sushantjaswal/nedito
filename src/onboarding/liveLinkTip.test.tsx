import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { documentHasNestedBlock, liveLinkTipMessage, shouldShowLiveLinkTip } from "./liveLinkTip";
import { clearLiveLinkTipShown, readLiveLinkTipShown, writeLiveLinkTipShown } from "./onboardingStorage";
import { Notice } from "../app/Notice";
import { createEmptyDoc, useDocStore } from "../model/store";
import { copyImageWithLiveLink } from "../share/copyImageLink";
import type { DiagramDocument } from "../model/types";

// Mocked at the module boundary: the real call rasterises through a <canvas>, which jsdom
// cannot do, so it would hang rather than fail. What the clipboard receives is covered by
// share/copyImageLink.test.ts.
vi.mock("../share/copyImageLink", () => ({ copyImageWithLiveLink: vi.fn() }));
const copyMock = vi.mocked(copyImageWithLiveLink);

function settled(patch: Partial<Parameters<typeof shouldShowLiveLinkTip>[0]> = {}) {
  return { alreadyShown: false, viewerMode: false, tourInProgress: false, ...patch };
}

describe("shouldShowLiveLinkTip", () => {
  it("speaks up the first time", () => {
    expect(shouldShowLiveLinkTip(settled())).toBe(true);
  });

  it("never twice", () => {
    expect(shouldShowLiveLinkTip(settled({ alreadyShown: true }))).toBe(false);
  });

  it("stays out of the read-only viewer, which has no document of its own", () => {
    expect(shouldShowLiveLinkTip(settled({ viewerMode: true }))).toBe(false);
  });

  it("does not talk over the coach marks", () => {
    expect(shouldShowLiveLinkTip(settled({ tourInProgress: true }))).toBe(false);
  });
});

describe("liveLinkTipMessage", () => {
  it("names the live-link command", () => {
    expect(liveLinkTipMessage(false)).toContain("Copy image with live link");
    expect(liveLinkTipMessage(false)).toContain("clickable in Word and PowerPoint");
  });

  // L3's rider: the PowerPoint export line is only worth saying when there is something to
  // zoom into. On a flat diagram it advertises a feature whose point is invisible.
  it("adds the PowerPoint export only when the document has a nested block", () => {
    expect(liveLinkTipMessage(false)).not.toContain("Export ▾ › PowerPoint");
    expect(liveLinkTipMessage(true)).toContain("Export ▾ › PowerPoint");
  });

  it("keeps to the disclosure copy rule", () => {
    for (const nested of [true, false]) {
      const text = liveLinkTipMessage(nested).toLowerCase();
      for (const forbidden of ["secure", "encrypted", "private"]) expect(text).not.toContain(forbidden);
    }
  });
});

describe("documentHasNestedBlock", () => {
  function docWith(nested: boolean): DiagramDocument {
    const doc = createEmptyDoc();
    const page = doc.diagrams[doc.rootDiagramIds[0]];
    page.nodes.push(
      nested
        ? {
            id: "n1",
            type: "nested",
            childDiagramId: "child",
            position: { x: 0, y: 0 },
            size: { w: 10, h: 10 },
            z: 1,
            style: {},
            collapsed: { icons: [] },
            ports: [],
          }
        : { id: "s1", type: "shape", shapeRef: "general/rect", position: { x: 0, y: 0 }, size: { w: 10, h: 10 }, z: 1, style: {} },
    );
    return doc;
  }

  it("sees a nested block anywhere in the document", () => {
    expect(documentHasNestedBlock(docWith(true))).toBe(true);
    expect(documentHasNestedBlock(docWith(false))).toBe(false);
  });

  it("says no for an empty document", () => {
    expect(documentHasNestedBlock(createEmptyDoc())).toBe(false);
  });
});

describe("the tip on the Notice surface", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    clearLiveLinkTipShown();
    copyMock.mockReset();
    useDocStore.getState().loadDoc(createEmptyDoc());
    useDocStore.getState().dismissNotice();
  });

  function showTip() {
    act(() =>
      useDocStore.getState().showNotice({
        message: liveLinkTipMessage(false),
        tone: "info",
        action: "copy-live-link",
      }),
    );
  }

  it("offers a Try it button rather than the download one", () => {
    showTip();
    render(<Notice />);
    expect(screen.getByTestId("nd-notice-action")).toHaveTextContent("Try it");
  });

  it("Try it copies and says so, replacing the tip", async () => {
    copyMock.mockResolvedValue({ ok: true, level: "ok", url: "https://x.test/#d=a&v=2" });
    showTip();
    render(<Notice />);

    await act(async () => {
      fireEvent.click(screen.getByTestId("nd-notice-action"));
    });

    await waitFor(() => expect(screen.getByTestId("nd-notice")).toHaveTextContent("Copied."));
    expect(copyMock).toHaveBeenCalledTimes(1);
  });

  // A "Try it" that silently does nothing visible is worse than no button at all.
  it("Try it says so when the clipboard refuses, and hands over the link", async () => {
    copyMock.mockResolvedValue({
      ok: false,
      level: "ok",
      url: "https://x.test/#d=a&v=2",
      error: "Your browser wouldn't let the app write to the clipboard.",
    });
    showTip();
    render(<Notice />);

    await act(async () => {
      fireEvent.click(screen.getByTestId("nd-notice-action"));
    });

    await waitFor(() => expect(useDocStore.getState().ui.notice?.tone).toBe("warn"));
    expect(screen.getByTestId("nd-notice-url")).toHaveValue("https://x.test/#d=a&v=2");
  });

  it("the download-doc action still works and still says what it does", () => {
    vi.stubGlobal("URL", { createObjectURL: vi.fn(() => "blob:mock"), revokeObjectURL: vi.fn() });
    act(() => useDocStore.getState().showNotice({ message: "Too big.", tone: "warn", action: "download-doc" }));
    render(<Notice />);

    const button = screen.getByTestId("nd-notice-action");
    expect(button).toHaveTextContent("Download the file instead");
    fireEvent.click(button);
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
  });
});

describe("the once-ever flag", () => {
  beforeEach(() => {
    localStorage.clear();
    clearLiveLinkTipShown();
  });

  it("starts unset and sticks once written", () => {
    expect(readLiveLinkTipShown()).toBe(false);
    writeLiveLinkTipShown();
    expect(readLiveLinkTipShown()).toBe(true);
  });
});
