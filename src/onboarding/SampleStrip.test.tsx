import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { SampleStrip } from "./SampleStrip";
import { buildDemoDoc } from "./demoDiagram";
import { clearDemoDismissed, readDemoDismissed } from "./onboardingStorage";
import { BRAND } from "../app/brand";
import { createEmptyDoc, useDocStore } from "../model/store";

describe("SampleStrip", () => {
  beforeEach(() => {
    localStorage.clear();
    clearDemoDismissed();
    useDocStore.getState().loadDoc(createEmptyDoc());
    useDocStore.setState((s) => ({
      ui: { ...s.ui, onboarding: { ...s.ui.onboarding, demoActive: false, demoDismissed: false, tourStep: 3 } },
    }));
  });

  it("stays hidden when the sample isn't showing", () => {
    render(<SampleStrip />);
    expect(screen.queryByTestId("nd-sample-strip")).toBeNull();
  });

  it("appears while the sample is active and names the product from BRAND", () => {
    useDocStore.getState().startDemo(buildDemoDoc());
    render(<SampleStrip />);
    const strip = screen.getByTestId("nd-sample-strip");
    expect(strip).toBeInTheDocument();
    expect(strip.textContent).toContain(BRAND.name);
    expect(strip.textContent).toContain("sample diagram");
  });

  it("'Start a blank canvas' empties the canvas, hides itself, and retires the sample for good", () => {
    useDocStore.getState().startDemo(buildDemoDoc());
    render(<SampleStrip />);
    fireEvent.click(screen.getByTestId("nd-start-blank"));

    const state = useDocStore.getState();
    const root = state.doc.diagrams[state.doc.rootDiagramIds[0]];
    expect(root.nodes).toHaveLength(0);
    expect(state.ui.onboarding.demoActive).toBe(false);
    expect(state.ui.onboarding.demoDismissed).toBe(true);
    // Persisted, so a reload doesn't bring the sample back.
    expect(readDemoDismissed()).toBe(true);
    expect(screen.queryByTestId("nd-sample-strip")).toBeNull();
  });
});

describe("onboarding store actions", () => {
  beforeEach(() => {
    localStorage.clear();
    clearDemoDismissed();
    useDocStore.setState((s) => ({
      ui: { ...s.ui, onboarding: { ...s.ui.onboarding, demoActive: false, demoDismissed: false, tourStep: 3 } },
    }));
  });

  it("startDemo loads the sample and marks the session as showing it", () => {
    useDocStore.getState().startDemo(buildDemoDoc());
    const state = useDocStore.getState();
    expect(state.ui.onboarding.demoActive).toBe(true);
    expect(state.doc.diagrams[state.doc.rootDiagramIds[0]].nodes.length).toBeGreaterThan(0);
  });

  it("dismissDemo retires the sample without touching the document", () => {
    useDocStore.getState().startDemo(buildDemoDoc());
    const before = useDocStore.getState().doc;
    useDocStore.getState().dismissDemo();

    const state = useDocStore.getState();
    expect(state.ui.onboarding.demoActive).toBe(false);
    expect(state.ui.onboarding.demoDismissed).toBe(true);
    expect(readDemoDismissed()).toBe(true);
    // The user keeps whatever they were editing — dismissing only stops the sample returning.
    expect(state.doc).toBe(before);
  });
});
