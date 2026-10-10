// D81: one broken region must not take the app, or autosave, down with it.
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { settleLazyLoads } from "../testLazyLoads";
import { ErrorBoundary } from "./ErrorBoundary";

let shouldThrow = true;
function Flaky() {
  if (shouldThrow) throw new Error("boom");
  return <p>working again</p>;
}

describe("ErrorBoundary", () => {
  beforeEach(() => {
    shouldThrow = true;
    vi.spyOn(console, "error").mockImplementation(() => {}); // React and the boundary both log
  });
  afterEach(() => vi.restoreAllMocks());

  it("shows a notice for the broken region, and leaves its neighbours alone", () => {
    render(
      <>
        <ErrorBoundary area="the status bar">
          <Flaky />
        </ErrorBoundary>
        <p>the canvas</p>
      </>,
    );
    expect(screen.getByTestId("nd-crash-region")).toHaveTextContent("The status bar hit a problem");
    expect(screen.getByText("the canvas")).toBeInTheDocument();
  });

  it("tries again on request", async () => {
    render(
      <ErrorBoundary area="the status bar">
        <Flaky />
      </ErrorBoundary>,
    );
    shouldThrow = false;
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(screen.getByText("working again")).toBeInTheDocument();
  });

  it("as the last resort, offers the diagram itself as a file", async () => {
    const save = vi.fn();
    vi.doMock("../file/saveDocument", () => ({ saveDocument: save }));
    vi.resetModules();
    const { ErrorBoundary: Fresh } = await import("./ErrorBoundary");
    render(
      <Fresh area="the app" whole>
        <Flaky />
      </Fresh>,
    );
    await userEvent.click(screen.getByRole("button", { name: "Save a copy of the diagram" }));
    expect(save).toHaveBeenCalledTimes(1);
    vi.doUnmock("../file/saveDocument");
  });
});

// The incident that prompted this: the status bar threw, the whole shell unmounted, and autosave
// (a hook in AppShell) silently stopped. With the regions bounded, it keeps saving.
describe("AppShell with a broken region", () => {
  afterEach(() => {
    vi.doUnmock("./StatusBar");
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it("keeps autosaving while the status bar is broken", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.doMock("./StatusBar", () => ({
      StatusBar: () => {
        throw new Error("status bar broke");
      },
    }));
    vi.resetModules();
    const { AppShell } = await import("./AppShell");
    const { useDocStore } = await import("../model/store");
    localStorage.clear();
    vi.useFakeTimers();
    try {
      render(<AppShell />);
      expect(screen.getByTestId("nd-crash-region")).toHaveTextContent("The status bar hit a problem");
      expect(screen.getByTestId("nd-canvas")).toBeInTheDocument();

      act(() => {
        useDocStore.setState((s) => ({ ui: { ...s.ui, onboarding: { ...s.ui.onboarding, demoActive: false } } }));
        useDocStore.getState().addShapeNode("general/rect", { x: 0, y: 0 }, { w: 100, h: 60 });
      });
      act(() => vi.advanceTimersByTime(1000));
      const saved = Object.keys(localStorage).find((k) => k.endsWith(":autosave"));
      expect(saved).toBeDefined();
      expect(localStorage.getItem(saved!)).toContain('"general/rect"');
    } finally {
      vi.useRealTimers();
    }
  });
});

// Wait for the lazy loads rendering started, before Vitest tears the environment down.
afterAll(settleLazyLoads);
