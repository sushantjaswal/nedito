// What a presentation does to the open level (A6, D123): Build once a level in the viewer, Spotlight
// cycling there, both only as a preview in the editor, Walkthrough's numbers everywhere — and the
// reader's motion switch and trace have the last word.
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useDocStore } from "../model/store";
import type { PresentationMode } from "../model/motion";
import { BUILD_HOLD_MS, BUILD_START_MS, BUILD_STEP_MS, resetPresentationForTests, SPOTLIGHT_STEP_MS, usePresentation } from "./usePresentation";

let ids: { a: string; b: string; e: string };

function setUp(mode: PresentationMode, viewerMode: boolean) {
  act(() => {
    const s = useDocStore.getState();
    s.loadDoc({ ...s.doc, diagrams: { [s.doc.rootDiagramIds[0]]: { ...s.doc.diagrams[s.doc.rootDiagramIds[0]], nodes: [], edges: [], motion: undefined } } });
    const t = useDocStore.getState();
    const a = t.addShapeNode("general/rect", { x: 0, y: 0 }, { w: 100, h: 60 });
    const b = t.addShapeNode("general/rect", { x: 300, y: 0 }, { w: 100, h: 60 });
    const e = t.connect({ sourceNodeId: a, sourceHandleId: "right", targetNodeId: b, targetHandleId: "left" })!;
    t.setPresentationMode(mode);
    ids = { a, b, e };
    useDocStore.setState((s) => ({ ui: { ...s.ui, viewerMode, motionEnabled: true, presentationPreview: null }, trace: null }));
  });
}

function hook() {
  return renderHook(() => {
    const s = useDocStore.getState();
    const id = s.currentDiagramId();
    return usePresentation(useDocStore((st) => st.doc.diagrams[id]), id);
  });
}

describe("usePresentation", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetPresentationForTests();
  });
  afterEach(() => {
    vi.useRealTimers();
    act(() => useDocStore.setState((s) => ({ ui: { ...s.ui, viewerMode: false, motionEnabled: true, presentationPreview: null }, trace: null })));
  });

  it("Build plays once a level in the viewer: steps appear in order, then the diagram is simply whole", () => {
    setUp("build", true);
    const { result, unmount } = hook();
    expect([...(result.current.hidden ?? [])].sort()).toEqual([ids.a, ids.b, ids.e].sort());
    act(() => void vi.advanceTimersByTime(BUILD_START_MS));
    expect(result.current.hidden?.has(ids.a)).toBe(false);
    expect(result.current.hidden?.has(ids.b)).toBe(true);
    // The line waits for the later of its ends.
    expect(result.current.hidden?.has(ids.e)).toBe(true);
    act(() => void vi.advanceTimersByTime(BUILD_STEP_MS));
    expect(result.current.hidden?.size).toBe(0);
    act(() => void vi.advanceTimersByTime(BUILD_HOLD_MS));
    expect(result.current.hidden).toBeNull();
    unmount();
    // Back on the level: not again.
    expect(hook().result.current.hidden).toBeNull();
  });

  it("Build never plays in the editor, except as a preview the author starts", () => {
    setUp("build", false);
    const { result } = hook();
    expect(result.current.hidden).toBeNull();
    expect(result.current.badge).toBe("draft");
    act(() => useDocStore.getState().setPresentationPreview(true));
    expect(result.current.hidden?.size).toBe(3);
    // While previewing, the author sees what readers see: no outline numbers.
    expect(result.current.badge).toBeNull();
    act(() => void vi.advanceTimersByTime(BUILD_START_MS + BUILD_STEP_MS + BUILD_HOLD_MS));
    expect(useDocStore.getState().ui.presentationPreview).toBeNull();
    expect(result.current.hidden).toBeNull();
  });

  it("with the reader's motion off, Build shows the whole diagram and Spotlight dims nothing", () => {
    setUp("build", true);
    act(() => useDocStore.setState((s) => ({ ui: { ...s.ui, motionEnabled: false } })));
    expect(hook().result.current.hidden).toBeNull();
    resetPresentationForTests();
    setUp("spotlight", true);
    act(() => useDocStore.setState((s) => ({ ui: { ...s.ui, motionEnabled: false } })));
    expect(hook().result.current.lit).toBeNull();
  });

  it("Spotlight moves from step to step in the viewer, and a reader's trace takes over while it lasts", () => {
    setUp("spotlight", true);
    const { result } = hook();
    expect(result.current.lit?.nodes).toEqual(new Set([ids.a]));
    act(() => void vi.advanceTimersByTime(SPOTLIGHT_STEP_MS));
    expect(result.current.lit?.nodes).toEqual(new Set([ids.b]));
    act(() => void vi.advanceTimersByTime(SPOTLIGHT_STEP_MS));
    expect(result.current.lit?.nodes).toEqual(new Set([ids.a]));
    act(() => useDocStore.getState().setTrace([ids.b]));
    expect(result.current.lit).toBeNull();
  });

  it("Walkthrough numbers its steps for readers and author alike, and its dot needs two steps and motion", () => {
    setUp("walkthrough", true);
    const { result } = hook();
    expect(result.current.badge).toBe("walkthrough");
    expect([...(result.current.steps ?? new Map()).entries()]).toEqual([
      [ids.a, 1],
      [ids.b, 2],
    ]);
    expect(result.current.walking).toBe(true);
    expect(result.current.hidden).toBeNull();
    act(() => useDocStore.setState((s) => ({ ui: { ...s.ui, motionEnabled: false } })));
    expect(result.current.walking).toBe(false);
    expect(result.current.steps?.size).toBe(2);
  });

  it("no mode: nothing at all", () => {
    setUp("walkthrough", true);
    act(() => useDocStore.setState((s) => ({ ui: { ...s.ui, viewerMode: false } })));
    act(() => useDocStore.getState().setPresentationMode(null));
    const { result } = hook();
    expect(result.current).toMatchObject({ mode: null, steps: null, badge: null, hidden: null, lit: null, walking: false });
  });
});
