// Silent restore.
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BRAND } from "./brand";
import { readAutosave, readUnreadableAutosave, saveAutosave } from "../file/autosave";
import { createEmptyDoc, useDocStore } from "../model/store";
import type { DiagramDocument } from "../model/types";
import { RestoreOnLoad } from "./RestoreOnLoad";
import { FADE_MS, RESTORED_NOTE_MS } from "./restoreActions";

const remember = vi.hoisted(() => ({ result: true, calls: [] as unknown[] }));
vi.mock("../file/recentDocs", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../file/recentDocs")>()),
  rememberDocument: vi.fn(async (doc: unknown) => {
    remember.calls.push(doc);
    return remember.result;
  }),
}));

function docWithShape(label: string): DiagramDocument {
  const doc = createEmptyDoc();
  const root = doc.rootDiagramIds[0];
  doc.diagrams[root].nodes.push({
    id: "n1",
    type: "shape",
    shapeRef: "general/rect",
    position: { x: 0, y: 0 },
    size: { w: 100, h: 60 },
    z: 0,
    style: {},
    label: { text: label },
  });
  return doc;
}

const state = () => useDocStore.getState();
const labels = () => Object.values(state().doc.diagrams).flatMap((d) => d.nodes.map((n) => n.label?.text));

describe("restoring on load", () => {
  beforeEach(() => {
    localStorage.clear();
    remember.result = true;
    remember.calls.length = 0;
    state().loadDoc(createEmptyDoc());
    useDocStore.setState((s) => ({ ui: { ...s.ui, notice: null } }));
  });
  afterEach(() => vi.useRealTimers());

  it("brings autosaved work back by itself and says so, with no question asked", () => {
    saveAutosave(docWithShape("Checkout"));
    render(<RestoreOnLoad />);
    expect(labels()).toEqual(["Checkout"]);
    expect(screen.getByRole("status")).toHaveTextContent("Restored your last diagram");
    expect(screen.queryByText(/restore\?/)).not.toBeInTheDocument();
  });

  it("does nothing when nothing was autosaved, so the first-visit sample can load", () => {
    render(<RestoreOnLoad />);
    expect(screen.queryByTestId("nd-restored-note")).not.toBeInTheDocument();
    expect(labels()).toEqual([]);
  });

  it("restores an empty autosave quietly, with no note", () => {
    saveAutosave(createEmptyDoc());
    render(<RestoreOnLoad />);
    expect(screen.queryByTestId("nd-restored-note")).not.toBeInTheDocument();
  });

  it("fades the note after a few seconds, but not while the pointer is on it", () => {
    vi.useFakeTimers();
    saveAutosave(docWithShape("Checkout"));
    render(<RestoreOnLoad />);
    const note = screen.getByTestId("nd-restored-note");
    fireEvent.pointerEnter(note);
    act(() => void vi.advanceTimersByTime(RESTORED_NOTE_MS + FADE_MS + 100));
    expect(screen.getByTestId("nd-restored-note")).toBeInTheDocument();
    fireEvent.pointerLeave(note);
    act(() => void vi.advanceTimersByTime(RESTORED_NOTE_MS + FADE_MS + 100));
    expect(screen.queryByTestId("nd-restored-note")).not.toBeInTheDocument();
  });

  it("Start new keeps the restored diagram under Recent before clearing the canvas", async () => {
    const restored = docWithShape("Checkout");
    saveAutosave(restored);
    render(<RestoreOnLoad />);
    remember.calls.length = 0;
    await act(async () => void fireEvent.click(screen.getByTestId("nd-restored-start-new")));
    // Kept first, and awaited, before anything replaced it (loadDoc then remembers it again,
    // harmlessly: the same diagram keeps one entry).
    expect((remember.calls[0] as DiagramDocument).meta.created).toBe(restored.meta.created);
    expect(labels()).toEqual([]);
    expect(state().ui.notice?.message).toMatch(new RegExp(`under Recent in the ${BRAND.name} menu`));
    expect(screen.queryByTestId("nd-restored-note")).not.toBeInTheDocument();
  });

  it("asks first when this browser can't keep it under Recent, and keeps it if the answer is no", async () => {
    remember.result = false;
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    saveAutosave(docWithShape("Checkout"));
    render(<RestoreOnLoad />);
    await act(async () => void fireEvent.click(screen.getByTestId("nd-restored-start-new")));
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(labels()).toEqual(["Checkout"]);
    confirm.mockRestore();
  });

  it("never drops an autosave that fails validation: it is set aside and the problem is shown", () => {
    localStorage.setItem(`${BRAND.storagePrefix}:autosave`, "{ this is not a diagram");
    render(<RestoreOnLoad />);
    expect(screen.getByRole("alert")).toHaveTextContent("couldn't be restored");
    expect(readUnreadableAutosave()).toBe("{ this is not a diagram");
    expect(labels()).toEqual([]);
  });

  it("keeps showing a set-aside autosave on the next visit until it is dismissed", () => {
    localStorage.setItem(`${BRAND.storagePrefix}:autosave`, "{ broken");
    const first = render(<RestoreOnLoad />);
    first.unmount();
    // Meanwhile the new, empty work was autosaved over the live key.
    saveAutosave(createEmptyDoc());
    render(<RestoreOnLoad />);
    expect(screen.getByTestId("nd-restore-problem")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("nd-restore-problem-dismiss"));
    expect(screen.queryByTestId("nd-restore-problem")).not.toBeInTheDocument();
    expect(readUnreadableAutosave()).toBeNull();
    // Dismissing the broken copy leaves the good autosave alone.
    expect(readAutosave()).not.toBeNull();
  });
});
