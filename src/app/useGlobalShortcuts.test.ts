import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setCanvasInstance, setStepZoom } from "../canvas/canvasApi";
import { useDocStore } from "../model/store";
import { SHAPES_MARKER } from "./systemClipboard";
import { PASTE_EVENT_GRACE_MS, useGlobalShortcuts } from "./useGlobalShortcuts";
import { openFilePicker, saveCopy } from "./fileActions";

// Ctrl+O and Ctrl+S (R2, D91) reach the app menu's own Open and Save a copy.
vi.mock("./fileActions", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./fileActions")>()),
  openFilePicker: vi.fn(),
  saveCopy: vi.fn(),
}));

function resetStore() {
  const initial = useDocStore.getState();
  const rootId = initial.doc.rootDiagramIds[0];
  useDocStore.setState({
    doc: {
      ...initial.doc,
      rootDiagramIds: [rootId],
      diagrams: { [rootId]: { id: rootId, title: "Page 1", nodes: [], edges: [] } },
    },
    navStack: [rootId],
    selection: { nodeIds: [], edgeIds: [] },
    ui: { ...initial.ui, shortcutsDialogOpen: false },
  });
  useDocStore.temporal.getState().clear();
}

/** Presses a key with Ctrl; returns false if the app cancelled the keydown. */
function press(key: string, opts: Partial<KeyboardEventInit> = {}): boolean {
  return window.dispatchEvent(new KeyboardEvent("keydown", { key, ctrlKey: true, bubbles: true, cancelable: true, ...opts }));
}

/** A clipboard as the browser hands it to copy/cut/paste events; jsdom has no DataTransfer. */
function fakeClipboard() {
  const text = new Map<string, string>();
  const items: { kind: "file"; getAsFile: () => File }[] = [];
  return {
    setData: (type: string, value: string) => void text.set(type, value),
    getData: (type: string) => text.get(type) ?? "",
    items: Object.assign(items, { add: (file: File) => void items.push({ kind: "file", getAsFile: () => file }) }),
  };
}

/** Fires a copy/cut/paste event the way the browser does after Ctrl+C/X/V. */
function clipboardEvent(
  type: "copy" | "cut" | "paste",
  fill?: (data: ReturnType<typeof fakeClipboard>) => void,
  target: EventTarget = window,
) {
  const data = fakeClipboard();
  fill?.(data);
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, "clipboardData", { value: data });
  target.dispatchEvent(event);
  return { data, event };
}

describe("useGlobalShortcuts", () => {
  beforeEach(() => {
    resetStore();
    renderHook(() => useGlobalShortcuts());
  });
  afterEach(() => {
    setCanvasInstance(null);
    setStepZoom(null);
  });

  it("Ctrl+K opens the command palette, and other shortcuts wait while it is open", () => {
    expect(press("k")).toBe(false);
    expect(useDocStore.getState().ui.paletteOpen).toBe(true);
    press("o");
    expect(openFilePicker).not.toHaveBeenCalled();
    useDocStore.getState().setPaletteOpen(false);
  });

  it("Ctrl+O opens a file and Ctrl+S saves a copy, instead of the browser's own", () => {
    vi.mocked(openFilePicker).mockClear();
    vi.mocked(saveCopy).mockClear();
    expect(press("o")).toBe(false);
    expect(openFilePicker).toHaveBeenCalledTimes(1);
    expect(press("s")).toBe(false);
    expect(saveCopy).toHaveBeenCalledTimes(1);
  });

  // Clone-and-connect, which the ＋ handles' click also does.
  it("Alt+Shift+Arrow adds a connected copy of the one selected shape on that side", () => {
    const s = useDocStore.getState();
    const a = s.addShapeNode("general/rect", { x: 0, y: 0 }, { w: 100, h: 60 });
    s.setSelection([a]);
    expect(press("ArrowRight", { ctrlKey: false, altKey: true, shiftKey: true })).toBe(false);
    const page = () => useDocStore.getState().doc.diagrams[useDocStore.getState().currentDiagramId()];
    expect(page().nodes).toHaveLength(2);
    const copy = page().nodes.find((n) => n.id !== a)!;
    expect(copy.position.x).toBeGreaterThan(100);
    expect(copy.position.y).toBe(0);
    expect(page().edges).toHaveLength(1);
    // The original did not move: this is not a nudge.
    expect(page().nodes.find((n) => n.id === a)!.position).toEqual({ x: 0, y: 0 });
  });

  it("Ctrl+Shift+K opens the shortcuts dialog, and Escape closes it", () => {
    press("k", { shiftKey: true });
    expect(useDocStore.getState().ui.shortcutsDialogOpen).toBe(true);
    press("Escape", { ctrlKey: false });
    expect(useDocStore.getState().ui.shortcutsDialogOpen).toBe(false);
  });

  it("swallows other shortcuts while the dialog is open", () => {
    useDocStore.getState().addShapeNode("general/rect", { x: 0, y: 0 }, { w: 100, h: 60 });
    useDocStore.getState().clearSelection();
    press("k", { shiftKey: true });
    expect(useDocStore.getState().ui.shortcutsDialogOpen).toBe(true);

    press("a");
    expect(useDocStore.getState().selection.nodeIds).toEqual([]); // Ctrl+A ignored while open
  });

  it("Ctrl+A selects every node and edge", () => {
    const a = useDocStore.getState().addShapeNode("general/rect", { x: 0, y: 0 }, { w: 100, h: 60 });
    useDocStore.getState().clearSelection();
    press("a");
    expect(useDocStore.getState().selection.nodeIds).toEqual([a]);
  });

  it("Ctrl+X cuts the selection (removes it and fills the clipboard for paste)", () => {
    const a = useDocStore.getState().addShapeNode("general/rect", { x: 0, y: 0 }, { w: 100, h: 60 });
    useDocStore.getState().setSelection([a]);
    press("x");

    const diagramId = useDocStore.getState().currentDiagramId();
    expect(useDocStore.getState().doc.diagrams[diagramId].nodes).toHaveLength(0);

    useDocStore.getState().pasteClipboard();
    expect(useDocStore.getState().doc.diagrams[diagramId].nodes).toHaveLength(1);
  });

  // D79: copy, cut and paste run on the browser's clipboard events, which only fire if the
  // keypress is not cancelled — and the paste event is the only way an image copied in another
  // app arrives.
  describe("the system clipboard", () => {
    const nodeCount = () => {
      const s = useDocStore.getState();
      return s.doc.diagrams[s.currentDiagramId()].nodes.length;
    };

    it("does not cancel Ctrl+C / Ctrl+X / Ctrl+V, so the browser fires the clipboard events", () => {
      for (const key of ["c", "x", "v"]) expect(press(key)).toBe(true);
    });

    it("marks the system clipboard when shapes are copied, so a stale image can't win the next paste", () => {
      const a = useDocStore.getState().addShapeNode("general/rect", { x: 0, y: 0 }, { w: 100, h: 60 });
      useDocStore.getState().setSelection([a]);
      press("c");
      const { data, event } = clipboardEvent("copy");
      expect(data.getData("text/plain")).toBe(SHAPES_MARKER);
      expect(event.defaultPrevented).toBe(true);
    });

    it("pastes the shapes copied here when the system clipboard holds no image", () => {
      const a = useDocStore.getState().addShapeNode("general/rect", { x: 0, y: 0 }, { w: 100, h: 60 });
      useDocStore.getState().setSelection([a]);
      press("c");
      clipboardEvent("copy");
      const before = nodeCount();
      press("v");
      clipboardEvent("paste", (d) => d.setData("text/plain", SHAPES_MARKER));
      expect(nodeCount()).toBe(before + 1);
    });

    it("still pastes the shapes when the browser fires no paste event at all", () => {
      vi.useFakeTimers();
      try {
        const a = useDocStore.getState().addShapeNode("general/rect", { x: 0, y: 0 }, { w: 100, h: 60 });
        useDocStore.getState().setSelection([a]);
        press("c");
        const before = nodeCount();
        press("v");
        expect(nodeCount()).toBe(before); // waiting for the paste event
        vi.advanceTimersByTime(PASTE_EVENT_GRACE_MS);
        expect(nodeCount()).toBe(before + 1);
      } finally {
        vi.useRealTimers();
      }
    });

    it("does not also paste the shapes when the paste event brings an image", async () => {
      vi.useFakeTimers();
      try {
        const a = useDocStore.getState().addShapeNode("general/rect", { x: 0, y: 0 }, { w: 100, h: 60 });
        useDocStore.getState().setSelection([a]);
        press("c");
        const before = nodeCount();
        press("v");
        const svg = new File(['<svg xmlns="http://www.w3.org/2000/svg" width="40" height="20"/>'], "clip.svg", { type: "image/svg+xml" });
        clipboardEvent("paste", (d) => d.items.add(svg));
        vi.advanceTimersByTime(PASTE_EVENT_GRACE_MS * 2);
        vi.useRealTimers();
        await vi.waitFor(() => expect(nodeCount()).toBe(before + 1));
        const s = useDocStore.getState();
        expect(s.doc.diagrams[s.currentDiagramId()].nodes.at(-1)).toMatchObject({ shapeRef: "image" });
      } finally {
        vi.useRealTimers();
      }
    });

    it("places an image copied in another app as a picture", async () => {
      const svg = new File(['<svg xmlns="http://www.w3.org/2000/svg" width="40" height="20"/>'], "clip.svg", { type: "image/svg+xml" });
      const before = nodeCount();
      clipboardEvent("paste", (d) => d.items.add(svg));
      await vi.waitFor(() => expect(nodeCount()).toBe(before + 1));
      const s = useDocStore.getState();
      const added = s.doc.diagrams[s.currentDiagramId()].nodes.at(-1)!;
      expect(added).toMatchObject({ type: "shape", shapeRef: "image" });
    });

    it("leaves a text field's own copy and paste alone", () => {
      const input = document.createElement("input");
      document.body.appendChild(input);
      input.focus();
      const before = nodeCount();
      const { event } = clipboardEvent("paste", (d) => d.setData("text/plain", "typed text"), input);
      expect(event.defaultPrevented).toBe(false);
      expect(nodeCount()).toBe(before);
      input.remove();
    });
  });

  it("Ctrl+Shift+H delegates to the canvas instance's fitView", () => {
    const fitView = vi.fn();
    setCanvasInstance({
      screenToFlowPosition: (p) => p,
      getViewport: () => ({ x: 0, y: 0, zoom: 1 }),
      setViewport: vi.fn(),
      fitView,
    });

    press("h", { shiftKey: true });
    expect(fitView).toHaveBeenCalledTimes(1);
  });

  it("Ctrl+= and Ctrl+- delegate to the registered stepZoom in each direction", () => {
    const step = vi.fn();
    setStepZoom(step);

    press("=");
    expect(step).toHaveBeenLastCalledWith(1);

    press("-");
    expect(step).toHaveBeenLastCalledWith(-1);

    expect(step).toHaveBeenCalledTimes(2);
  });
});
