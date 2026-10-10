import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CoachMarks } from "./CoachMarks";
import { buildDemoDoc } from "./demoDiagram";
import { clearDemoDismissed, clearTourDone, readTourDone } from "./onboardingStorage";
import { TOUR_FINISHED, useDocStore } from "../model/store";

// The tour points at real DOM nodes; jsdom reports zero-size rects for everything, so the
// target lookup is stubbed to a plausible box. Without this the tour would (correctly) abort.
function stubTarget() {
  vi.spyOn(document, "querySelector").mockReturnValue({
    getBoundingClientRect: () => ({ left: 200, top: 300, width: 220, height: 150 }),
  } as unknown as Element);
}

describe("CoachMarks", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    clearDemoDismissed();
    clearTourDone();
    useDocStore.getState().startDemo(buildDemoDoc());
    useDocStore.getState().setTourStep(0);
    stubTarget();
  });

  it("shows nothing until the tour starts", () => {
    render(<CoachMarks />);
    expect(screen.queryByTestId("nd-coach-step-1")).toBeNull();
  });

  it("shows step 1 with the looping nested-box animation", () => {
    useDocStore.getState().setTourStep(1);
    render(<CoachMarks />);
    expect(screen.getByTestId("nd-coach-step-1")).toHaveTextContent("This box holds a whole diagram");
    // The animation is the part that survives someone dismissing everything, so it must be there.
    expect(screen.getByTestId("nd-nested-loop")).toBeInTheDocument();
    expect(screen.getByTestId("nd-coach-spot")).toBeInTheDocument();
  });

  it("step 1 points at ⤢, not double-click, and opening the box by any route advances to step 2", () => {
    // Double-click renames a Nested Block; ⤢, the right-click menu and the context bar open it.
    useDocStore.getState().setTourStep(1);
    render(<CoachMarks />);
    const card = screen.getByTestId("nd-coach-step-1");
    expect(card).toHaveTextContent("Click ⤢ to open it");
    expect(card.textContent).not.toMatch(/double-click/i);
    const root = useDocStore.getState().doc.diagrams[useDocStore.getState().navStack[0]];
    act(() => useDocStore.getState().navigateInto(root.nodes.find((n) => n.type === "nested")!.id));
    expect(useDocStore.getState().ui.onboarding.tourStep).toBe(2);
  });

  it("shows step 2 pointing at the breadcrumb trail, without the animation", () => {
    // Step 2 only makes sense one level deep — at the root it would be telling the user how to
    // leave a diagram they haven't entered, so the component ends the tour instead.
    const root = useDocStore.getState().doc.diagrams[useDocStore.getState().navStack[0]];
    act(() => useDocStore.getState().navigateInto(root.nodes.find((n) => n.type === "nested")!.id));
    useDocStore.getState().setTourStep(2);
    render(<CoachMarks />);
    expect(screen.getByTestId("nd-coach-step-2")).toHaveTextContent("The trail shows where you are");
    expect(screen.queryByTestId("nd-nested-loop")).toBeNull();
  });

  it("Skip ends the tour and records it so it never runs again", () => {
    useDocStore.getState().setTourStep(1);
    render(<CoachMarks />);
    fireEvent.click(screen.getByTestId("nd-coach-skip"));
    expect(useDocStore.getState().ui.onboarding.tourStep).toBe(TOUR_FINISHED);
    expect(readTourDone()).toBe(true);
    expect(screen.queryByTestId("nd-coach-step-1")).toBeNull();
  });

  it("Escape ends the whole tour from any step", () => {
    const root = useDocStore.getState().doc.diagrams[useDocStore.getState().navStack[0]];
    act(() => useDocStore.getState().navigateInto(root.nodes.find((n) => n.type === "nested")!.id));
    useDocStore.getState().setTourStep(2);
    render(<CoachMarks />);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(useDocStore.getState().ui.onboarding.tourStep).toBe(TOUR_FINISHED);
    expect(readTourDone()).toBe(true);
  });

  it("aborts silently when its target element is missing, rather than floating a tooltip", () => {
    vi.restoreAllMocks();
    vi.spyOn(document, "querySelector").mockReturnValue(null);
    useDocStore.getState().setTourStep(1);
    render(<CoachMarks />);
    expect(screen.queryByTestId("nd-coach-step-1")).toBeNull();
    expect(useDocStore.getState().ui.onboarding.tourStep).toBe(TOUR_FINISHED);
  });

  it("clearing the sample also ends the tour, since its targets are about to vanish", () => {
    useDocStore.getState().setTourStep(1);
    act(() => useDocStore.getState().startBlankCanvas());
    expect(useDocStore.getState().ui.onboarding.tourStep).toBe(TOUR_FINISHED);
    expect(readTourDone()).toBe(true);
  });
});
