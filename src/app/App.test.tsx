import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SETTLE_TIMEOUT_MS, settleLazyLoads } from "../testLazyLoads";
import { saveAutosave } from "../file/autosave";
import { writeCollapsedSections } from "../library/collapsedSections";
import { useDocStore } from "../model/store";
import { docAtDepth1, emptyDoc } from "../share/testDocs";
import { encodeDocToFragment } from "../share/urlCodec";
import { App } from "./App";
import { BRAND } from "./brand";

const AUTOSAVE_KEY = `${BRAND.storagePrefix}:autosave`;

function setHash(fragment: string): void {
  window.location.hash = fragment;
}

beforeEach(() => {
  // The document store is a module singleton shared by every test in the file, so viewer mode
  // set by one case would otherwise still be on in the next.
  useDocStore.getState().exitViewerMode();
  useDocStore.getState().loadDoc(emptyDoc());
  localStorage.clear();
  writeCollapsedSections(new Set());
  setHash("");
  // A share link's recipient must never be shown the first-visit sample; suppressing it here
  // keeps these tests about the share flow rather than about onboarding.
  localStorage.setItem(`${BRAND.storagePrefix}:demoDismissed`, "true");
});

afterEach(() => {
  setHash("");
  vi.restoreAllMocks();
});

describe("App — no share link", () => {
  it("renders the ordinary editor", async () => {
    render(<App />);
    expect(await screen.findByTestId("nd-shape-library")).toBeInTheDocument();
    expect(screen.queryByTestId("nd-viewer-shell")).not.toBeInTheDocument();
    expect(useDocStore.getState().ui.viewerMode).toBe(false);
  });
});

describe("App — opening a share link", () => {
  it("renders the read-only viewer instead of the editor", async () => {
    setHash(await encodeDocToFragment(docAtDepth1()));
    render(<App />);

    expect(await screen.findByTestId("nd-viewer-shell")).toBeInTheDocument();
    expect(screen.getByTestId("nd-viewer-readonly")).toHaveTextContent("read-only");
    // The editor's authoring surfaces are not merely disabled — they are not mounted.
    expect(screen.queryByTestId("nd-shape-library")).not.toBeInTheDocument();
    expect(screen.queryByTestId("nd-canvas-chip")).not.toBeInTheDocument();
    expect(screen.queryByTestId("nd-context-bar")).not.toBeInTheDocument();
    expect(screen.queryByTestId("nd-restored-note")).not.toBeInTheDocument();
  });

  it("loads the shared document and marks the store read-only", async () => {
    setHash(await encodeDocToFragment(docAtDepth1()));
    render(<App />);
    await screen.findByTestId("nd-viewer-shell");

    const state = useDocStore.getState();
    expect(state.ui.viewerMode).toBe(true);
    expect(state.doc.diagrams.root.nodes).toHaveLength(3);
  });

  it("shows the breadcrumb trail, so nesting can still be navigated", async () => {
    setHash(await encodeDocToFragment(docAtDepth1()));
    render(<App />);
    expect(await screen.findByTestId("nd-breadcrumbs")).toBeInTheDocument();
  });

  // The single most important guarantee in this feature.
  it("leaves the recipient's autosaved work completely untouched", async () => {
    const own = emptyDoc("my-own-work");
    saveAutosave(own);
    const before = localStorage.getItem(AUTOSAVE_KEY);

    setHash(await encodeDocToFragment(docAtDepth1()));
    render(<App />);
    await screen.findByTestId("nd-viewer-shell");

    // Long enough to cover useAutosave's 800ms debounce, had it been running at all.
    await new Promise((resolve) => setTimeout(resolve, 1200));
    expect(localStorage.getItem(AUTOSAVE_KEY)).toBe(before);
    expect(localStorage.getItem(AUTOSAVE_KEY)).toContain("my-own-work");
  });
});

describe("App — a link that cannot be read", () => {
  it("shows an error card rather than a blank canvas", async () => {
    setHash("d=this-is-not-a-real-payload&v=2");
    render(<App />);

    const card = await screen.findByTestId("nd-share-error");
    expect(card).toHaveTextContent(/couldn.t be opened/i);
    expect(card).toHaveTextContent(/damaged/i);
    expect(screen.queryByTestId("nd-viewer-shell")).not.toBeInTheDocument();
  });

  it("does not enter viewer mode or disturb the document", async () => {
    setHash("d=broken&v=2");
    render(<App />);
    await screen.findByTestId("nd-share-error");
    expect(useDocStore.getState().ui.viewerMode).toBe(false);
  });

  it("offers a way through to the normal editor", async () => {
    setHash("d=broken&v=2");
    render(<App />);
    await userEvent.click(await screen.findByTestId("nd-share-error-dismiss"));
    expect(await screen.findByTestId("nd-shape-library")).toBeInTheDocument();
  });
});

describe("App — Edit a copy", () => {
  it("hands the shared document to the full editor and leaves viewer mode", async () => {
    setHash(await encodeDocToFragment(docAtDepth1()));
    render(<App />);
    await userEvent.click(await screen.findByTestId("nd-viewer-edit-copy"));

    expect(await screen.findByTestId("nd-shape-library")).toBeInTheDocument();
    const state = useDocStore.getState();
    expect(state.ui.viewerMode).toBe(false);
    // Still the shared diagram — "edit a copy", not "start over".
    expect(state.doc.diagrams.root.nodes).toHaveLength(3);
  });

  it("clears the payload from the address bar, so a reload doesn't reopen the viewer", async () => {
    setHash(await encodeDocToFragment(docAtDepth1()));
    render(<App />);
    await userEvent.click(await screen.findByTestId("nd-viewer-edit-copy"));
    await screen.findByTestId("nd-shape-library");
    expect(window.location.hash).toBe("");
  });

  it("asks first when the recipient has their own unsaved work, and honours a refusal", async () => {
    saveAutosave(emptyDoc("my-own-work"));
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);

    setHash(await encodeDocToFragment(docAtDepth1()));
    render(<App />);
    await userEvent.click(await screen.findByTestId("nd-viewer-edit-copy"));

    expect(confirmSpy).toHaveBeenCalledOnce();
    // Refused: still in the viewer, nothing taken over.
    expect(screen.getByTestId("nd-viewer-shell")).toBeInTheDocument();
    expect(useDocStore.getState().ui.viewerMode).toBe(true);
  });

  it("does not ask when there is no work to lose", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    setHash(await encodeDocToFragment(docAtDepth1()));
    render(<App />);
    await userEvent.click(await screen.findByTestId("nd-viewer-edit-copy"));

    await screen.findByTestId("nd-shape-library");
    expect(confirmSpy).not.toHaveBeenCalled();
  });

  it("does not let the silent restore or the sample replace the copy", async () => {
    // A first-time visitor following a link: no autosave, no demoDismissed flag — precisely
    // the state in which the first-visit sample would otherwise load over the shared document.
    localStorage.clear();
    writeCollapsedSections(new Set());
    saveAutosave(emptyDoc("my-own-work"));
    vi.spyOn(window, "confirm").mockReturnValue(true);

    setHash(await encodeDocToFragment(docAtDepth1()));
    render(<App />);
    await userEvent.click(await screen.findByTestId("nd-viewer-edit-copy"));
    await screen.findByTestId("nd-shape-library");

    expect(screen.queryByTestId("nd-restored-note")).not.toBeInTheDocument();
    await waitFor(() => {
      expect(useDocStore.getState().doc.diagrams.root.nodes).toHaveLength(3);
    });
    expect(useDocStore.getState().ui.onboarding.demoActive).toBe(false);
  });
});

// Wait for the lazy loads rendering started, before Vitest tears the environment down.
afterAll(settleLazyLoads, SETTLE_TIMEOUT_MS);
