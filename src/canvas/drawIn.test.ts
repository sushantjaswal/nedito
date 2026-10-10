// Draw in (A5, D121): only in the viewer, only once a page, never with the reader's motion off.
import { act } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useDocStore } from "../model/store";
import { drawnLength, maybeDrawIn, resetDrawInForTests } from "./drawIn";

function viewing(drawIn: boolean, viewerMode = true) {
  const s = useDocStore.getState();
  const id = s.currentDiagramId();
  const d = s.doc.diagrams[id];
  useDocStore.setState({
    doc: { ...s.doc, diagrams: { ...s.doc.diagrams, [id]: drawIn ? { ...d, motion: { drawIn: true } } : { ...d, motion: undefined } } },
    ui: { ...s.ui, viewerMode, motionEnabled: true, drawingIn: null },
  });
  return id;
}

describe("Draw in", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetDrawInForTests();
  });
  afterEach(() => {
    vi.useRealTimers();
    act(() => useDocStore.setState((s) => ({ ui: { ...s.ui, viewerMode: false, drawingIn: null } })));
  });

  it("plays once in the viewer, then lets go", () => {
    const id = viewing(true);
    act(() => maybeDrawIn());
    expect(useDocStore.getState().ui.drawingIn).toBe(id);
    act(() => void vi.advanceTimersByTime(1200));
    expect(useDocStore.getState().ui.drawingIn).toBeNull();
    // Never again this page — not on a level change, not on a page switch.
    act(() => maybeDrawIn());
    expect(useDocStore.getState().ui.drawingIn).toBeNull();
  });

  it("never in the editor, never when the diagram does not ask, never with motion off", () => {
    viewing(true, false);
    act(() => maybeDrawIn());
    expect(useDocStore.getState().ui.drawingIn).toBeNull();

    resetDrawInForTests();
    viewing(false);
    act(() => maybeDrawIn());
    expect(useDocStore.getState().ui.drawingIn).toBeNull();

    resetDrawInForTests();
    viewing(true);
    act(() => useDocStore.getState().setMotionEnabled(false));
    act(() => maybeDrawIn());
    expect(useDocStore.getState().ui.drawingIn).toBeNull();
    act(() => useDocStore.getState().setMotionEnabled(true));
  });

  it("measures each line, so long and short lines finish together", () => {
    expect(drawnLength("M0,0 L100,0")).toBe(102);
    expect(drawnLength("M0,0 L30,40")).toBe(52);
  });
});
