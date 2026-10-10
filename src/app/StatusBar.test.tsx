// D79: when autosave stops fitting in browser storage, the status bar says so until it works again.
import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { saveAutosave } from "../file/autosave";
import { useDocStore } from "../model/store";
import { StatusBar } from "./StatusBar";

describe("StatusBar", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    saveAutosave(useDocStore.getState().doc); // leave autosave working for the next test
  });

  it("names the diagram being viewed, with no zoom readout — the zoom bar above has it (D108)", () => {
    const s = useDocStore.getState();
    render(<StatusBar />);
    const context = screen.getByTestId("nd-status-context");
    expect(context).toHaveTextContent(new RegExp(`^${s.doc.diagrams[s.currentDiagramId()].title}$`));
    expect(context.textContent).not.toMatch(/zoom|%/i);

    // Inside a Nested Block it names that level, as before.
    let nestedId = "";
    act(() => {
      nestedId = useDocStore.getState().addNestedNode({ x: 0, y: 0 }, { w: 160, h: 100 }, "Payment Service").nestedNodeId;
      useDocStore.getState().navigateInto(nestedId);
    });
    expect(context).toHaveTextContent(/^Payment Service$/);
    act(() => useDocStore.getState().navigateBack());
  });

  it("says nothing about autosave while it works", () => {
    render(<StatusBar />);
    expect(screen.queryByTestId("nd-autosave-off")).toBeNull();
  });

  it("shows that autosave is off after a write fails, and clears once one succeeds", () => {
    render(<StatusBar />);
    const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("quota", "QuotaExceededError");
    });
    act(() => void saveAutosave(useDocStore.getState().doc));
    expect(screen.getByTestId("nd-autosave-off")).toHaveTextContent(/Autosave off/);

    spy.mockRestore();
    act(() => void saveAutosave(useDocStore.getState().doc));
    expect(screen.queryByTestId("nd-autosave-off")).toBeNull();
  });
});
