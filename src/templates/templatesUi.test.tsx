import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TemplateBrowser } from "./TemplateBrowser";
import { ApplyTemplateDialog } from "./ApplyTemplateDialog";
import { EmptyCanvasPanel } from "./EmptyCanvasPanel";
import { loadTemplate } from "./registry";
import { readSidebarTab } from "../library/sidebarTab";
import { createEmptyDoc, useDocStore } from "../model/store";

function resetStore() {
  localStorage.clear();
  useDocStore.getState().loadDoc(createEmptyDoc());
  useDocStore.setState((s) => ({
    ui: {
      ...s.ui,
      viewerMode: false,
      sidebarTab: "shapes",
      pendingTemplateId: null,
      startPanelDismissed: false,
      onboarding: { ...s.ui.onboarding, demoActive: false, demoDismissed: true },
    },
  }));
}

function addAShape() {
  act(() => {
    useDocStore.getState().addShapeNode("general/rect", { x: 10, y: 10 }, { w: 100, h: 50 });
  });
}

describe("TemplateBrowser", () => {
  beforeEach(resetStore);

  it("groups templates under category headers", async () => {
    render(<TemplateBrowser query="" />);
    expect(await screen.findByTestId("nd-template-category-featured")).toBeInTheDocument();
    expect(screen.getByTestId("nd-template-category-process")).toBeInTheDocument();
  });

  it("collapses a category and brings it back", async () => {
    render(<TemplateBrowser query="" />);
    const header = await screen.findByTestId("nd-template-category-process");

    fireEvent.click(header);
    expect(header).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(header);
    expect(header).toHaveAttribute("aria-expanded", "true");
  });

  // The badge points at the differentiator in the picker, rather than leaving it to be found.
  it("badges a template that contains a Nested Block, and only that one", async () => {
    render(<TemplateBrowser query="" />);
    // The badge needs the template's own module, loaded alongside every other card's thumbnail:
    // past waitFor's 1s default when the whole suite runs in parallel (D114).
    await waitFor(
      () => expect(screen.getAllByTestId("nd-template-nested-flowchart-with-subprocess").length).toBeGreaterThan(0),
      { timeout: 5000 },
    );
    expect(screen.queryByTestId("nd-template-nested-basic-flowchart")).toBeNull();
  });

  it("filters on the shared search box, including by keyword", async () => {
    const { rerender } = render(<TemplateBrowser query="" />);
    await screen.findByTestId("nd-template-category-featured");

    rerender(<TemplateBrowser query="brainstorm" />);
    await waitFor(() => expect(screen.queryByTestId("nd-template-category-process")).toBeNull());
    expect(screen.getAllByTestId("nd-template-card-mind-map").length).toBeGreaterThan(0);
  });

  it("says so when nothing matches", async () => {
    render(<TemplateBrowser query="xyzzy-no-such-template" />);
    expect(await screen.findByTestId("nd-template-no-results")).toBeInTheDocument();
  });

  // An empty page has nothing to lose, so asking would be a click in the way.
  it("applies straight into an empty page, without a dialog", async () => {
    render(<TemplateBrowser query="" />);
    const card = (await screen.findAllByTestId("nd-template-card-basic-flowchart"))[0];

    await act(async () => {
      fireEvent.click(card);
    });

    await waitFor(() => {
      const s = useDocStore.getState();
      expect(s.doc.diagrams[s.currentDiagramId()].nodes.length).toBeGreaterThan(0);
    });
    expect(useDocStore.getState().ui.pendingTemplateId).toBeNull();
  });

  it("asks first when the page already has something on it", async () => {
    addAShape();
    render(<TemplateBrowser query="" />);
    const card = (await screen.findAllByTestId("nd-template-card-basic-flowchart"))[0];

    await act(async () => {
      fireEvent.click(card);
    });

    await waitFor(() => expect(useDocStore.getState().ui.pendingTemplateId).toBe("basic-flowchart"));
    // Nothing applied yet: the user has not answered.
    const s = useDocStore.getState();
    expect(s.doc.diagrams[s.currentDiagramId()].nodes).toHaveLength(1);
  });
});

describe("ApplyTemplateDialog", () => {
  beforeEach(resetStore);

  it("stays shut until a template needs a decision", () => {
    render(<ApplyTemplateDialog />);
    expect(screen.queryByTestId("nd-template-dialog")).toBeNull();
  });

  it("offers all three choices, with the safe one focused", async () => {
    act(() => useDocStore.getState().askTemplatePlacement("basic-flowchart"));
    render(<ApplyTemplateDialog />);

    expect(await screen.findByTestId("nd-template-dialog")).toBeInTheDocument();
    expect(screen.getByTestId("nd-template-new-page")).toBeInTheDocument();
    expect(screen.getByTestId("nd-template-replace")).toHaveTextContent("Ctrl+Z");
    expect(screen.getByTestId("nd-template-cancel")).toBeInTheDocument();
    expect(screen.getByTestId("nd-template-new-page")).toHaveFocus();
  });

  it("adds a new page without touching the current one", async () => {
    addAShape();
    const before = useDocStore.getState().doc.rootDiagramIds[0];
    act(() => useDocStore.getState().askTemplatePlacement("basic-flowchart"));
    render(<ApplyTemplateDialog />);

    await act(async () => {
      fireEvent.click(await screen.findByTestId("nd-template-new-page"));
    });

    await waitFor(() => expect(useDocStore.getState().doc.rootDiagramIds).toHaveLength(2));
    expect(useDocStore.getState().doc.diagrams[before].nodes).toHaveLength(1);
  });

  it("replaces the page when asked", async () => {
    addAShape();
    const pageId = useDocStore.getState().doc.rootDiagramIds[0];
    act(() => useDocStore.getState().askTemplatePlacement("basic-flowchart"));
    render(<ApplyTemplateDialog />);

    await act(async () => {
      fireEvent.click(await screen.findByTestId("nd-template-replace"));
    });

    await waitFor(() => expect(useDocStore.getState().doc.diagrams[pageId].nodes.length).toBeGreaterThan(1));
    expect(useDocStore.getState().doc.rootDiagramIds).toHaveLength(1);
  });

  it("cancels on the button and on Escape, changing nothing", async () => {
    addAShape();
    act(() => useDocStore.getState().askTemplatePlacement("basic-flowchart"));
    const { rerender } = render(<ApplyTemplateDialog />);

    fireEvent.click(await screen.findByTestId("nd-template-cancel"));
    expect(useDocStore.getState().ui.pendingTemplateId).toBeNull();

    act(() => useDocStore.getState().askTemplatePlacement("basic-flowchart"));
    rerender(<ApplyTemplateDialog />);
    await screen.findByTestId("nd-template-dialog");
    fireEvent.keyDown(window, { key: "Escape" });
    expect(useDocStore.getState().ui.pendingTemplateId).toBeNull();

    const s = useDocStore.getState();
    expect(s.doc.diagrams[s.currentDiagramId()].nodes).toHaveLength(1);
  });
});

describe("EmptyCanvasPanel", () => {
  beforeEach(resetStore);

  it("offers the featured templates on an empty page", async () => {
    render(<EmptyCanvasPanel />);
    expect(screen.getByTestId("nd-start-panel")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId("nd-start-template-mind-map")).toBeInTheDocument());
  });

  it("disappears as soon as the page has anything on it", () => {
    addAShape();
    render(<EmptyCanvasPanel />);
    expect(screen.queryByTestId("nd-start-panel")).toBeNull();
  });

  // Two introductions competing for a first-time user is worse than either alone.
  it("stays out of the way of the first-visit sample and the share viewer", () => {
    act(() => useDocStore.setState((s) => ({ ui: { ...s.ui, onboarding: { ...s.ui.onboarding, demoActive: true } } })));
    const { rerender } = render(<EmptyCanvasPanel />);
    expect(screen.queryByTestId("nd-start-panel")).toBeNull();

    act(() =>
      useDocStore.setState((s) => ({
        ui: { ...s.ui, viewerMode: true, onboarding: { ...s.ui.onboarding, demoActive: false } },
      })),
    );
    rerender(<EmptyCanvasPanel />);
    expect(screen.queryByTestId("nd-start-panel")).toBeNull();
  });

  it("applies a featured template directly", async () => {
    render(<EmptyCanvasPanel />);
    const tile = await screen.findByTestId("nd-start-template-basic-flowchart");

    await act(async () => {
      fireEvent.click(tile);
    });

    await waitFor(() => {
      const s = useDocStore.getState();
      expect(s.doc.diagrams[s.currentDiagramId()].nodes.length).toBeGreaterThan(0);
    });
  });

  it("'Browse all templates' switches the sidebar", () => {
    render(<EmptyCanvasPanel />);
    fireEvent.click(screen.getByTestId("nd-start-browse-all"));
    expect(useDocStore.getState().ui.sidebarTab).toBe("templates");
  });

  // D81: someone who wants to draw their own diagram can put the panel away.
  describe("dismissing it", () => {
    it.each([
      ["'Start with a blank canvas'", () => fireEvent.click(screen.getByTestId("nd-start-blank-canvas"))],
      ["the close button", () => fireEvent.click(screen.getByRole("button", { name: "Close" }))],
      ["Escape", () => fireEvent.keyDown(window, { key: "Escape" })],
    ])("closes on %s, leaving the page empty", (_, act) => {
      render(<EmptyCanvasPanel />);
      act();
      expect(screen.queryByTestId("nd-start-panel")).toBeNull();
      const s = useDocStore.getState();
      expect(s.doc.diagrams[s.currentDiagramId()].nodes).toHaveLength(0);
    });

    it("stays away on the next empty page for the rest of the visit", () => {
      const { rerender } = render(<EmptyCanvasPanel />);
      fireEvent.click(screen.getByTestId("nd-start-blank-canvas"));
      act(() => {
        useDocStore.getState().addPage();
      });
      rerender(<EmptyCanvasPanel />);
      expect(screen.queryByTestId("nd-start-panel")).toBeNull();
    });
  });
});

describe("the sidebar tab preference", () => {
  beforeEach(resetStore);

  it("is remembered across sessions", () => {
    act(() => useDocStore.getState().setSidebarTab("templates"));
    expect(readSidebarTab()).toBe("templates");
    act(() => useDocStore.getState().setSidebarTab("shapes"));
    expect(readSidebarTab()).toBe("shapes");
  });

  it("falls back to Shapes when storage is unreadable", () => {
    const getItem = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(readSidebarTab()).toBe("shapes");
    getItem.mockRestore();
  });
});

describe("applying a template retires the first-visit sample", () => {
  beforeEach(resetStore);

  it("so it never lands on top of the user's new diagram", async () => {
    act(() =>
      useDocStore.setState((s) => ({
        ui: { ...s.ui, onboarding: { ...s.ui.onboarding, demoActive: true, demoDismissed: false } },
      })),
    );
    const template = (await loadTemplate("basic-flowchart"))!;
    act(() => {
      useDocStore.getState().applyTemplate(template.doc, "into-current");
    });

    const { onboarding } = useDocStore.getState().ui;
    expect(onboarding.demoActive).toBe(false);
    expect(onboarding.demoDismissed).toBe(true);
  });
});
