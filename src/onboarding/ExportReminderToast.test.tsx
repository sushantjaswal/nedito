import { act, fireEvent, render, renderHook, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ExportReminderToast } from "./ExportReminderToast";
import { FIRST_THRESHOLD, REARM_INTERVAL } from "./exportReminder";
import { buildDemoDoc } from "./demoDiagram";
import { clearActionsSinceExport, clearDemoDismissed, readActionsSinceExport } from "./onboardingStorage";
import { useExportReminder } from "./useExportReminder";
import { createEmptyDoc, useDocStore } from "../model/store";
import { BRAND } from "../app/brand";

/** Drives the counter the way the app does, one named mutation at a time. */
function makeChanges(n: number) {
  act(() => {
    for (let i = 0; i < n; i += 1) useDocStore.getState().noteDocumentMutation();
  });
}

/** A settled editor: no sample, no tour, no export yet, nothing on screen. */
function resetOnboarding() {
  useDocStore.setState((s) => ({
    ui: {
      ...s.ui,
      viewerMode: false,
      onboarding: {
        demoActive: false,
        demoDismissed: true,
        tourStep: 4,
        newStepOnly: false,
        actionsSinceExport: 0,
        remindersShown: 0,
        reminderOpen: false,
        lastExportAt: null,
      },
    },
  }));
}

describe("export reminder - counting and thresholds", () => {
  beforeEach(() => {
    localStorage.clear();
    clearDemoDismissed();
    clearActionsSinceExport();
    useDocStore.getState().loadDoc(createEmptyDoc());
    resetOnboarding();
  });

  it("counts each mutating action and persists the running total", () => {
    makeChanges(3);
    expect(useDocStore.getState().ui.onboarding.actionsSinceExport).toBe(3);
    // Persisted so a reload doesn't hand the user a clean slate they haven't earned.
    expect(readActionsSinceExport()).toBe(3);
  });

  it("stays shut until the fifteenth change, then opens", () => {
    makeChanges(FIRST_THRESHOLD - 1);
    expect(useDocStore.getState().ui.onboarding.reminderOpen).toBe(false);
    makeChanges(1);
    expect(useDocStore.getState().ui.onboarding.reminderOpen).toBe(true);
  });

  it("does not reopen straight after Later - it takes another 40 changes", () => {
    makeChanges(FIRST_THRESHOLD);
    act(() => useDocStore.getState().dismissExportReminder());
    expect(useDocStore.getState().ui.onboarding.reminderOpen).toBe(false);

    makeChanges(REARM_INTERVAL - 1);
    expect(useDocStore.getState().ui.onboarding.reminderOpen).toBe(false);
    makeChanges(1);
    expect(useDocStore.getState().ui.onboarding.reminderOpen).toBe(true);
  });

  it("gives up after two reminders in a session", () => {
    makeChanges(FIRST_THRESHOLD);
    act(() => useDocStore.getState().dismissExportReminder());
    makeChanges(REARM_INTERVAL);
    act(() => useDocStore.getState().dismissExportReminder());

    makeChanges(500);
    expect(useDocStore.getState().ui.onboarding.reminderOpen).toBe(false);
  });

  it("an export zeroes the counter and closes the reminder", () => {
    makeChanges(FIRST_THRESHOLD);
    act(() => useDocStore.getState().noteExport());

    const { onboarding } = useDocStore.getState().ui;
    expect(onboarding.actionsSinceExport).toBe(0);
    expect(onboarding.reminderOpen).toBe(false);
    expect(readActionsSinceExport()).toBe(0);
  });

  it("holds its tongue for a minute after that export", () => {
    act(() => useDocStore.getState().noteExport());
    makeChanges(FIRST_THRESHOLD);
    expect(useDocStore.getState().ui.onboarding.reminderOpen).toBe(false);
  });

  it("says nothing while the untouched sample is on screen", () => {
    act(() => useDocStore.getState().startDemo(buildDemoDoc()));
    makeChanges(FIRST_THRESHOLD + 5);
    expect(useDocStore.getState().ui.onboarding.reminderOpen).toBe(false);
  });

  it("does not talk over the coach-mark tour", () => {
    act(() => useDocStore.getState().setTourStep(1));
    makeChanges(FIRST_THRESHOLD + 5);
    expect(useDocStore.getState().ui.onboarding.reminderOpen).toBe(false);
  });

  it("counts nothing in the read-only share viewer", () => {
    useDocStore.setState((s) => ({ ui: { ...s.ui, viewerMode: true } }));
    makeChanges(FIRST_THRESHOLD + 5);
    expect(useDocStore.getState().ui.onboarding.actionsSinceExport).toBe(0);
    expect(useDocStore.getState().ui.onboarding.reminderOpen).toBe(false);
  });
});

describe("useExportReminder - what counts as a change", () => {
  beforeEach(() => {
    localStorage.clear();
    clearActionsSinceExport();
    useDocStore.getState().loadDoc(createEmptyDoc());
    resetOnboarding();
  });

  it("counts a real editing action without that action knowing about it", () => {
    renderHook(() => useExportReminder());
    act(() => {
      useDocStore.getState().addShapeNode("general/rect", { x: 10, y: 10 }, { w: 120, h: 60 });
    });
    expect(useDocStore.getState().ui.onboarding.actionsSinceExport).toBe(1);
  });

  // Opening a file, starting a new diagram and restoring an autosave all replace `doc` too.
  // None of them is an unsaved change the user made.
  it("does not count loading a different document as an edit", () => {
    renderHook(() => useExportReminder());
    act(() => useDocStore.getState().loadDoc(createEmptyDoc()));
    expect(useDocStore.getState().ui.onboarding.actionsSinceExport).toBe(0);
  });

  it("does not count selection or viewport churn", () => {
    renderHook(() => useExportReminder());
    act(() => useDocStore.getState().toggleGrid());
    act(() => useDocStore.getState().setSelection([]));
    expect(useDocStore.getState().ui.onboarding.actionsSinceExport).toBe(0);
  });
});

describe("ExportReminderToast", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    clearActionsSinceExport();
    vi.stubGlobal("URL", { createObjectURL: vi.fn(() => "blob:mock"), revokeObjectURL: vi.fn() });
    useDocStore.getState().loadDoc(createEmptyDoc());
    resetOnboarding();
  });

  it("renders nothing until a reminder is due", () => {
    render(<ExportReminderToast />);
    expect(screen.queryByTestId("nd-export-reminder")).toBeNull();
  });

  it("names the number of changes and takes the extension from BRAND", () => {
    makeChanges(FIRST_THRESHOLD);
    render(<ExportReminderToast />);
    const toast = screen.getByTestId("nd-export-reminder");
    expect(toast).toHaveTextContent("Save a copy while you");
    expect(toast).toHaveTextContent(`made ${FIRST_THRESHOLD} changes`);
    expect(screen.getByTestId("nd-export-reminder-download")).toHaveTextContent(`Download ${BRAND.fileExt}`);
  });

  it("keeps to the disclosure copy rule", () => {
    makeChanges(FIRST_THRESHOLD);
    render(<ExportReminderToast />);
    const text = screen.getByTestId("nd-export-reminder").textContent?.toLowerCase() ?? "";
    for (const forbidden of ["secure", "encrypted", "private"]) expect(text).not.toContain(forbidden);
  });

  it("downloads a real file and resets the counter", () => {
    makeChanges(FIRST_THRESHOLD);
    render(<ExportReminderToast />);
    fireEvent.click(screen.getByTestId("nd-export-reminder-download"));

    expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
    expect(useDocStore.getState().ui.onboarding.actionsSinceExport).toBe(0);
    expect(screen.queryByTestId("nd-export-reminder")).toBeNull();
  });

  it("Later closes it and spends one of the session's reminders", () => {
    makeChanges(FIRST_THRESHOLD);
    render(<ExportReminderToast />);
    fireEvent.click(screen.getByTestId("nd-export-reminder-later"));

    expect(screen.queryByTestId("nd-export-reminder")).toBeNull();
    expect(useDocStore.getState().ui.onboarding.remindersShown).toBe(1);
    // Dismissing must never be mistaken for saving.
    expect(useDocStore.getState().ui.onboarding.actionsSinceExport).toBe(FIRST_THRESHOLD);
  });

  it("closes on the dismiss button as well", () => {
    makeChanges(FIRST_THRESHOLD);
    render(<ExportReminderToast />);
    fireEvent.click(screen.getByTestId("nd-export-reminder-close"));
    expect(screen.queryByTestId("nd-export-reminder")).toBeNull();
  });
});
