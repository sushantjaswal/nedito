import { act, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CoachMarks } from "./CoachMarks";
import { useTourUpgrade } from "./useTourUpgrade";
import { buildDemoDoc } from "./demoDiagram";
import {
  CURRENT_TOUR_VERSION,
  clearDemoDismissed,
  clearTourDone,
  clearTourVersion,
  readTourVersion,
  writeTourDone,
  writeTourVersion,
} from "./onboardingStorage";
import { TOUR_FINISHED, TOUR_LAST_STEP, createEmptyDoc, useDocStore } from "../model/store";
import { copyImageWithLiveLink } from "../share/copyImageLink";

// Mocked at the module boundary, not at navigator.clipboard: the real call rasterises the
// diagram through a <canvas>, which jsdom cannot do, so it would hang rather than fail. What
// the clipboard actually receives is covered by share/copyImageLink.test.ts; what matters here
// is what the tour card does with each outcome.
vi.mock("../share/copyImageLink", () => ({ copyImageWithLiveLink: vi.fn() }));
const copyMock = vi.mocked(copyImageWithLiveLink);

// The tour points at real DOM nodes; jsdom reports zero-size rects for everything, so the
// target lookup is stubbed to a plausible box. Without this the tour would (correctly) abort.
function stubTarget() {
  vi.spyOn(document, "querySelector").mockReturnValue({
    getBoundingClientRect: () => ({ left: 200, top: 300, width: 220, height: 150 }),
  } as unknown as Element);
}

function atStep3() {
  act(() => useDocStore.getState().setTourStep(3));
}

describe("tour step 3 — take it anywhere", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    clearDemoDismissed();
    clearTourDone();
    clearTourVersion();
    vi.stubGlobal("URL", { createObjectURL: vi.fn(() => "blob:mock"), revokeObjectURL: vi.fn() });
    copyMock.mockReset();
    useDocStore.getState().startDemo(buildDemoDoc());
    useDocStore.getState().setTourStep(0);
    stubTarget();
  });

  it("names the live-link command and counts itself as the third of three", () => {
    atStep3();
    render(<CoachMarks />);

    const card = screen.getByTestId("nd-coach-step-3");
    expect(card).toHaveTextContent("Take it anywhere, still clickable");
    expect(card).toHaveTextContent("Copy image with live link");
    expect(card).toHaveTextContent(`3 of ${TOUR_LAST_STEP}`);
  });

  // The spec caps step 3 at three short sentences. With the PowerPoint and Word lines inline it
  // runs to four, so they live behind a disclosure instead of lengthening the card.
  it("keeps the export options behind 'More ways to share' rather than in the body", () => {
    atStep3();
    render(<CoachMarks />);

    expect(screen.queryByTestId("nd-coach-more-panel")).toBeNull();
    fireEvent.click(screen.getByTestId("nd-coach-more-ways"));

    const panel = screen.getByTestId("nd-coach-more-panel");
    expect(panel).toHaveTextContent("Export to PowerPoint");
    expect(panel).toHaveTextContent("Export to Word");
  });

  it("'Show me' asks the File menu to open and highlights its export entries", () => {
    atStep3();
    render(<CoachMarks />);
    fireEvent.click(screen.getByTestId("nd-coach-more-ways"));

    const before = useDocStore.getState().ui.exportMenuRequest;
    fireEvent.click(screen.getByTestId("nd-coach-show-exports"));

    expect(useDocStore.getState().ui.exportMenuRequest).toBe(before + 1);
    expect(useDocStore.getState().ui.exportHighlight).toBe(true);
  });

  it("'Copy it now' copies, then offers Done to finish", async () => {
    copyMock.mockResolvedValue({ ok: true, level: "ok", url: "https://x.test/#d=a&v=2" });
    atStep3();
    render(<CoachMarks />);

    await act(async () => {
      fireEvent.click(screen.getByTestId("nd-coach-next"));
    });

    await waitFor(() => expect(screen.getByTestId("nd-coach-copied")).toBeInTheDocument());
    expect(screen.getByTestId("nd-coach-next")).toHaveTextContent("Done");
    // Nothing left to skip past once the thing has been done.
    expect(screen.queryByTestId("nd-coach-skip")).toBeNull();
  });

  // The honest failure mode: the browser refuses the clipboard. The tour must not claim
  // something happened, and must leave the user with the link rather than nothing.
  it("hands over the link on the Notice surface when the clipboard is refused", async () => {
    copyMock.mockResolvedValue({
      ok: false,
      level: "ok",
      url: "https://x.test/#d=a&v=2",
      error: "Your browser wouldn't let the app write to the clipboard.",
    });
    atStep3();
    render(<CoachMarks />);

    await act(async () => {
      fireEvent.click(screen.getByTestId("nd-coach-next"));
    });

    await waitFor(() => expect(useDocStore.getState().ui.notice).not.toBeNull());
    expect(useDocStore.getState().ui.notice?.tone).toBe("warn");
    expect(useDocStore.getState().ui.onboarding.tourStep).toBe(TOUR_FINISHED);
  });

  it("Skip at step 3 still marks the whole tour done", () => {
    atStep3();
    render(<CoachMarks />);
    fireEvent.click(screen.getByTestId("nd-coach-skip"));

    expect(useDocStore.getState().ui.onboarding.tourStep).toBe(TOUR_FINISHED);
    expect(readTourVersion()).toBe(CURRENT_TOUR_VERSION);
  });

  it("records the tour version on completion, so the new step is never re-offered", () => {
    atStep3();
    act(() => useDocStore.getState().setTourStep(TOUR_FINISHED));
    expect(readTourVersion()).toBe(CURRENT_TOUR_VERSION);
  });
});

describe("useTourUpgrade — the returning v1 user", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    clearDemoDismissed();
    clearTourDone();
    clearTourVersion();
    useDocStore.getState().loadDoc(createEmptyDoc());
    useDocStore.setState((s) => ({
      ui: {
        ...s.ui,
        viewerMode: false,
        onboarding: { ...s.ui.onboarding, demoActive: false, tourStep: 0, newStepOnly: false },
      },
    }));
  });

  function giveThemADiagram() {
    act(() => {
      useDocStore.getState().addShapeNode("general/rect", { x: 10, y: 10 }, { w: 120, h: 60 });
    });
  }

  it("shows only the new step to someone who finished the old tour", () => {
    writeTourDone();
    writeTourVersion(1);

    const { rerender } = renderHook(() => useTourUpgrade());
    giveThemADiagram();
    rerender();

    const { onboarding } = useDocStore.getState().ui;
    expect(onboarding.tourStep).toBe(TOUR_LAST_STEP);
    expect(onboarding.newStepOnly).toBe(true);
  });

  it("labels it 'New:' and drops the step counter, which would be a lie", () => {
    writeTourDone();
    writeTourVersion(1);
    stubTarget();

    const { rerender } = renderHook(() => useTourUpgrade());
    giveThemADiagram();
    rerender();

    render(<CoachMarks />);
    const card = screen.getByTestId("nd-coach-step-3");
    expect(card).toHaveTextContent("New: Take it anywhere");
    expect(card).not.toHaveTextContent(`of ${TOUR_LAST_STEP}`);
  });

  it("records the version as soon as it is shown, so it never appears twice", () => {
    writeTourDone();
    writeTourVersion(1);

    const { rerender } = renderHook(() => useTourUpgrade());
    giveThemADiagram();
    rerender();

    expect(readTourVersion()).toBe(CURRENT_TOUR_VERSION);
  });

  it("waits for a diagram — the step is about sharing this one", () => {
    writeTourDone();
    writeTourVersion(1);

    renderHook(() => useTourUpgrade());
    expect(useDocStore.getState().ui.onboarding.tourStep).toBe(0);
  });

  it("leaves a user who is already on the current version alone", () => {
    writeTourDone();
    writeTourVersion(CURRENT_TOUR_VERSION);

    const { rerender } = renderHook(() => useTourUpgrade());
    giveThemADiagram();
    rerender();

    expect(useDocStore.getState().ui.onboarding.tourStep).toBe(0);
  });

  // Someone who never finished the old tour is not upgrading; they get the whole thing when it
  // runs, and must not be handed the last step out of context.
  it("leaves a user who never took the tour alone", () => {
    const { rerender } = renderHook(() => useTourUpgrade());
    giveThemADiagram();
    rerender();

    expect(useDocStore.getState().ui.onboarding.tourStep).toBe(0);
  });

  it("never runs in the read-only share viewer", () => {
    writeTourDone();
    writeTourVersion(1);
    useDocStore.setState((s) => ({ ui: { ...s.ui, viewerMode: true } }));

    const { rerender } = renderHook(() => useTourUpgrade());
    giveThemADiagram();
    rerender();

    expect(useDocStore.getState().ui.onboarding.tourStep).toBe(0);
  });
});
