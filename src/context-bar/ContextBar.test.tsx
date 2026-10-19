// The context bar and canvas chip: every control the right panel had
// is reachable from them, offered for the same selections, acting the same way.
import { act, fireEvent, renderHook, screen } from "@testing-library/react";
import { useImageActions } from "../format-panel/selectionKinds";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { useDocStore } from "../model/store";
import { barButtonsFor, selectionBounds } from "./barButtons";
import { renderBar, resetStore } from "./renderBar.testutil";

const state = () => useDocStore.getState();
const page = () => state().doc.diagrams[state().currentDiagramId()];
const node = (id: string) => page().nodes.find((n) => n.id === id);
const addRect = (x = 0) => state().addShapeNode("general/rect", { x, y: 0 }, { w: 100, h: 60 });
const barIds = () => screen.queryAllByTestId(/^nd-bar-/).map((b) => b.dataset.testid!.slice("nd-bar-".length));

describe("the context bar", () => {
  beforeEach(resetStore);

  it("shows nothing when nothing is selected — the canvas chip holds the diagram's settings", () => {
    renderBar();
    expect(screen.queryByTestId("nd-context-bar")).not.toBeInTheDocument();
    expect(screen.getByTestId("nd-canvas-chip")).toBeInTheDocument();
  });

  // Note sits on every bar, whatever is selected: it was once a line at the bottom of a different
  // popover for each kind of selection, and nobody found it. It comes before More, because three
  // dots mean "everything else" and nothing follows them.
  it("offers Fill, Line, Text, Arrange, Motion, Trace, Note and More for a shape, in that order", () => {
    state().setSelection([addRect()]);
    renderBar();
    expect(barIds()).toEqual(["fill", "line", "text", "arrange", "motion", "trace", "note", "more"]);
    const bar = screen.getByTestId("nd-context-bar");
    expect(bar).toHaveAttribute("role", "toolbar");
    expect(bar).toHaveAttribute("aria-label", "Selection");
  });

  it("opens each group's controls in a popover, one at a time", async () => {
    state().setSelection([addRect()]);
    renderBar();
    const user = userEvent.setup();
    await user.click(screen.getByTestId("nd-bar-text"));
    expect(screen.getByTestId("nd-text-section")).toBeInTheDocument();
    expect(screen.getByTestId("nd-bar-text")).toHaveAttribute("aria-expanded", "true");
    await user.click(screen.getByTestId("nd-bar-arrange"));
    expect(screen.getByTestId("nd-arrange-section")).toBeInTheDocument();
    expect(screen.queryByTestId("nd-text-section")).not.toBeInTheDocument();
    await user.click(screen.getByTestId("nd-bar-arrange"));
    expect(screen.queryByTestId("nd-arrange-section")).not.toBeInTheDocument();
  });

  it("Fill's colour control updates the selected shape's style", async () => {
    const id = addRect();
    state().setSelection([id]);
    renderBar();
    await userEvent.click(screen.getByTestId("nd-bar-fill"));
    fireEvent.change(screen.getByLabelText("Fill color"), { target: { value: "#ff0000" } });
    expect(node(id)?.style.fill).toBe("#ff0000");
  });

  it("gives a shape's line width its own named row, apart from its colour", async () => {
    state().setSelection([addRect()]);
    renderBar();
    await userEvent.click(screen.getByTestId("nd-bar-line"));
    const row = screen.getByLabelText("Line width").closest("div")!;
    expect(row.textContent).toContain("Width");
    expect(row.querySelector('input[type="color"]')).toBeNull();
  });

  // The width used to sit unnamed beside the colour swatch, a bare "1" (D88).
  it("gives lines' width its own named row, reading 1pt for lines that set none", async () => {
    const a = state().addLine({ source: { x: 0, y: 0 }, target: { x: 100, y: 0 }, style: {} });
    const b = state().addLine({ source: { x: 0, y: 50 }, target: { x: 100, y: 50 }, style: {} });
    state().setSelection([], [a, b]);
    renderBar();
    await userEvent.click(screen.getByTestId("nd-bar-edge"));
    const width = screen.getByLabelText("Edge width") as HTMLInputElement;
    expect(width.value).toBe("1");
    const row = width.closest("div")!;
    expect(row.textContent).toContain("Width");
    expect(row.textContent).toContain("pt");
  });

  it("leaves a single line to its own line toolbar rather than showing a second bar", () => {
    const a = state().addLine({ source: { x: 0, y: 0 }, target: { x: 100, y: 0 }, style: {} });
    state().setSelection([], [a]);
    renderBar();
    expect(screen.queryByTestId("nd-context-bar")).not.toBeInTheDocument();
  });

  it("adds a Lines button when lines are selected with shapes", () => {
    const a = addRect();
    const b = addRect(200);
    const e = state().connect({ sourceNodeId: a, sourceHandleId: "right", targetNodeId: b, targetHandleId: "left" });
    state().setSelection([a, b], [e]);
    renderBar();
    expect(barIds()).toEqual(["fill", "line", "text", "arrange", "edge", "note", "more"]);
  });

  it("Arrange's position fields edit a single selected shape's position", async () => {
    const id = state().addShapeNode("general/rect", { x: 5, y: 5 }, { w: 100, h: 60 });
    state().setSelection([id]);
    const user = userEvent.setup();
    renderBar();
    await user.click(screen.getByTestId("nd-bar-arrange"));
    const xInput = screen.getByLabelText("X position") as HTMLInputElement;
    await user.clear(xInput);
    await user.type(xInput, "42");
    xInput.blur();
    expect(node(id)?.position.x).toBe(42);
  });

  it("Arrange groups a multi-selection, and Ungroup restores it", async () => {
    const a = addRect();
    const b = addRect(200);
    state().setSelection([a, b]);
    const user = userEvent.setup();
    renderBar();
    await user.click(screen.getByTestId("nd-bar-arrange"));
    await user.click(screen.getByText("Group"));
    const groupId = state().selection.nodeIds[0];
    expect(node(groupId)?.type).toBe("group");

    await user.click(screen.getByTestId("nd-bar-arrange"));
    await user.click(screen.getByText("Ungroup"));
    expect(node(groupId)).toBeUndefined();
    expect(state().selection.nodeIds.sort()).toEqual([a, b].sort());
  });

  it("Arrange offers Ungroup, not Group, when a group's members are selected directly (D32)", async () => {
    const a = addRect();
    const b = addRect(200);
    state().setSelection([a, b]);
    const groupId = state().groupSelection()!;
    state().setSelection([a, b]);
    renderBar();
    await userEvent.click(screen.getByTestId("nd-bar-arrange"));
    expect(screen.getByText("Ungroup")).toBeInTheDocument();
    expect(screen.queryByText("Group")).not.toBeInTheDocument();
    await userEvent.click(screen.getByText("Ungroup"));
    expect(node(groupId)).toBeUndefined();
  });

  it("Arrange offers Ungroup when the group's own id and its members are selected together (D33)", async () => {
    const a = addRect();
    const b = addRect(200);
    state().setSelection([a, b]);
    const groupId = state().groupSelection()!;
    state().setSelection([groupId, a, b]);
    renderBar();
    await userEvent.click(screen.getByTestId("nd-bar-arrange"));
    expect(screen.getByText("Ungroup")).toBeInTheDocument();
    expect(screen.queryByText("Group")).not.toBeInTheDocument();
  });

  it("gives a selected group what the panel did — Text has nothing to format, so Arrange", () => {
    const a = addRect();
    const b = addRect(200);
    state().setSelection([a, b]);
    state().groupSelection();
    // The group alone, as clicking its frame selects it.
    state().setSelection([state().selection.nodeIds[0]]);
    renderBar();
    expect(barIds()).toEqual(["arrange", "note"]);
  });

  it("gives a single Nested Block Open, Nested, Motion, Trace, Arrange and Note, with the Nested section in its popover", async () => {
    const { nestedNodeId } = state().addNestedNode({ x: 0, y: 0 }, { w: 200, h: 140 });
    state().setSelection([nestedNodeId]);
    renderBar();
    expect(barIds()).toEqual(["open", "nested", "motion", "trace", "arrange", "note"]);
    await userEvent.click(screen.getByTestId("nd-bar-nested"));
    expect(screen.getByTestId("nd-nested-format-section")).toBeInTheDocument();
  });

  it("opens a Nested Block's child from its Open button", async () => {
    const { nestedNodeId, childDiagramId } = state().addNestedNode({ x: 0, y: 0 }, { w: 200, h: 140 });
    state().setSelection([nestedNodeId]);
    renderBar();
    await userEvent.click(screen.getByTestId("nd-bar-open"));
    expect(state().currentDiagramId()).toBe(childDiagramId);
  });

  it("Esc closes an open popover first, and only the next Esc clears the selection", async () => {
    const id = addRect();
    state().setSelection([id]);
    renderBar();
    await userEvent.click(screen.getByTestId("nd-bar-more"));
    expect(screen.getByTestId("nd-effects-section")).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByTestId("nd-effects-section")).not.toBeInTheDocument();
    expect(state().selection.nodeIds).toEqual([id]);
    expect(screen.getByTestId("nd-bar-more")).toHaveFocus();
  });

  it("hides while a shape is dragged, resized or rotated, and comes back after", () => {
    state().setSelection([addRect()]);
    renderBar();
    expect(screen.getByTestId("nd-context-bar")).toBeInTheDocument();
    act(() => useDocStore.getState().setCanvasGesture(true));
    expect(screen.queryByTestId("nd-context-bar")).not.toBeInTheDocument();
    act(() => useDocStore.getState().setCanvasGesture(false));
    expect(screen.getByTestId("nd-context-bar")).toBeInTheDocument();
  });

  it("moves along the bar with the arrow keys", async () => {
    state().setSelection([addRect()]);
    renderBar();
    screen.getByTestId("nd-bar-fill").focus();
    fireEvent.keyDown(screen.getByTestId("nd-context-bar"), { key: "ArrowRight" });
    expect(screen.getByTestId("nd-bar-line")).toHaveFocus();
    fireEvent.keyDown(screen.getByTestId("nd-context-bar"), { key: "ArrowLeft" });
    // Back to the first, then past it: the focus wraps round to whatever is last on this bar.
    fireEvent.keyDown(screen.getByTestId("nd-context-bar"), { key: "ArrowLeft" });
    expect(screen.getByTestId("nd-bar-more")).toHaveFocus();
  });
});

describe("what the bar offers, by selection", () => {
  const open = () => {};
  const shape = { id: "s", type: "shape", shapeRef: "general/rect", position: { x: 0, y: 0 }, size: { w: 10, h: 10 }, z: 0, style: {} } as const;
  const picture = { ...shape, id: "p", shapeRef: "image", imageId: "a" } as const;

  it("puts Replace and Original size on the bar for one picture, then Image, Text and Arrange", () => {
    const ids = barButtonsFor([picture], [], [], { open, image: { replace: open, originalSize: open } }).map((b) => b.id);
    expect(ids).toEqual(["replace", "originalSize", "image", "text", "arrange", "note"]);
  });

  it("drops Replace and Original size for several pictures, as the panel did", () => {
    const ids = barButtonsFor([picture, { ...picture, id: "q" }], [], [], { open, image: null }).map((b) => b.id);
    expect(ids).toEqual(["image", "text", "arrange", "note"]);
  });

  it("measures the selection to place the bar, free line ends included", () => {
    const box = selectionBounds(
      [{ ...shape, position: { x: 10, y: 20 }, size: { w: 30, h: 40 } }],
      [{ id: "e", source: { point: { x: 100, y: 5 } }, target: { nodeId: "s" }, style: {} }],
      [shape],
    );
    expect(box).toEqual({ x: 5, y: 5, w: 95, h: 55 });
  });
});

describe("the canvas chip", () => {
  beforeEach(resetStore);

  it("toggles the grid and snap in one click each, saying which is on", async () => {
    renderBar();
    const grid = screen.getByTestId("nd-grid-toggle");
    const before = state().ui.gridEnabled;
    expect(grid).toHaveAttribute("aria-pressed", String(before));
    await userEvent.click(grid);
    expect(state().ui.gridEnabled).toBe(!before);
    expect(grid).toHaveAttribute("aria-pressed", String(!before));
    const snapBefore = state().ui.snapEnabled;
    await userEvent.click(screen.getByTestId("nd-snap-toggle"));
    expect(state().ui.snapEnabled).toBe(!snapBefore);
  });

  // Layers and Outline moved here from the View menu (R2, D91).
  it("toggles the Layers and Outline panels, saying which is open", async () => {
    renderBar();
    const layers = screen.getByTestId("nd-layers-toggle");
    const layersBefore = state().ui.layersPanelOpen;
    expect(layers).toHaveAttribute("aria-pressed", String(layersBefore));
    await userEvent.click(layers);
    expect(state().ui.layersPanelOpen).toBe(!layersBefore);
    const outline = screen.getByTestId("nd-outline-toggle");
    const outlineBefore = state().ui.minimapOpen;
    await userEvent.click(outline);
    expect(state().ui.minimapOpen).toBe(!outlineBefore);
    expect(outline).toHaveAttribute("aria-pressed", String(!outlineBefore));
  });

  it("opens the page size and background in a popover, and names the page size on the button", async () => {
    renderBar();
    expect(screen.getByTestId("nd-page-button")).toHaveTextContent("Infinite canvas");
    await userEvent.click(screen.getByTestId("nd-page-button"));
    await userEvent.selectOptions(screen.getByTestId("nd-page-size"), "a4");
    expect(page().pageSize).toBeDefined();
    expect(screen.getByTestId("nd-page-button")).toHaveTextContent(/A4/);
    fireEvent.change(screen.getByTestId("nd-background-color"), { target: { value: "#fafafa" } });
    expect(page().background).toBe("#fafafa");
  });

  it("is what Extras ▸ Diagram Settings opens", () => {
    renderBar();
    expect(screen.queryByTestId("nd-page-popover")).not.toBeInTheDocument();
    act(() => state().setPageSettingsOpen(true));
    expect(screen.getByTestId("nd-page-popover")).toBeInTheDocument();
  });
});

// A new object every render rebuilt the bar's buttons, which re-measured the bar, which rendered
// again: opening a popover on a plain shape hit React's update-depth limit and took the canvas down.
describe("useImageActions", () => {
  const shape = { id: "s", type: "shape", shapeRef: "general/rect", position: { x: 0, y: 0 }, size: { w: 10, h: 10 }, z: 0, style: {} } as const;
  const picture = { ...shape, id: "p", shapeRef: "image", imageId: "a" } as const;

  it("offers nothing for a plain shape, only for a single picture", () => {
    expect(renderHook(() => useImageActions([shape])).result.current).toBeNull();
    expect(renderHook(() => useImageActions([picture])).result.current).not.toBeNull();
  });

  it("keeps the same actions from render to render for the same picture", () => {
    const nodes = [picture];
    const { result, rerender } = renderHook(() => useImageActions(nodes));
    const first = result.current;
    rerender();
    expect(result.current).toBe(first);
  });
});

describe("Motion (D116)", () => {
  beforeEach(resetStore);

  it("turns Pulse on and off for the selected shape, with an optional ripple", async () => {
    const id = useDocStore.getState().addShapeNode("general/rect", { x: 0, y: 0 }, { w: 120, h: 60 });
    useDocStore.getState().setSelection([id], []);
    renderBar();
    await userEvent.click(screen.getByTestId("nd-bar-motion"));
    const ripple = screen.getByTestId("nd-motion-ripple") as HTMLInputElement;
    expect(ripple.disabled).toBe(true);
    await userEvent.click(screen.getByTestId("nd-motion-pulse"));
    const node = () => useDocStore.getState().doc.diagrams[useDocStore.getState().currentDiagramId()].nodes.find((n) => n.id === id)!;
    expect(node().motion).toEqual({ pulse: {} });
    await userEvent.click(screen.getByTestId("nd-motion-ripple"));
    expect(node().motion).toEqual({ pulse: { ripple: true } });
    await userEvent.click(screen.getByTestId("nd-motion-pulse"));
    expect("motion" in node()).toBe(false);
  });
});

describe("Trace (D117)", () => {
  beforeEach(resetStore);

  it("the bar's Trace traces the one selected shape, and pressed again stops", async () => {
    const id = useDocStore.getState().addShapeNode("general/rect", { x: 0, y: 0 }, { w: 120, h: 60 });
    useDocStore.getState().setSelection([id], []);
    renderBar();
    await userEvent.click(screen.getByTestId("nd-bar-trace"));
    expect(useDocStore.getState().trace).toEqual({ diagramId: useDocStore.getState().currentDiagramId(), focus: [id] });
    expect(screen.getByTestId("nd-bar-trace")).toHaveTextContent("Stop");
    await userEvent.click(screen.getByTestId("nd-bar-trace"));
    expect(useDocStore.getState().trace).toBeNull();
  });

  it("is offered for one shape only, not for several or for lines", () => {
    const a = useDocStore.getState().addShapeNode("general/rect", { x: 0, y: 0 }, { w: 120, h: 60 });
    const b = useDocStore.getState().addShapeNode("general/rect", { x: 200, y: 0 }, { w: 120, h: 60 });
    useDocStore.getState().setSelection([a, b], []);
    renderBar();
    expect(barIds()).not.toContain("trace");
  });
});

describe("Health (A4, D120)", () => {
  beforeEach(resetStore);

  it("sets, changes and clears a shape's status from the Motion popover", async () => {
    const id = useDocStore.getState().addShapeNode("general/rect", { x: 0, y: 0 }, { w: 120, h: 60 });
    useDocStore.getState().setSelection([id], []);
    renderBar();
    await userEvent.click(screen.getByTestId("nd-bar-motion"));
    const node = () => useDocStore.getState().doc.diagrams[useDocStore.getState().currentDiagramId()].nodes.find((n) => n.id === id)!;
    expect(screen.getByTestId("nd-motion-health-off")).toHaveAttribute("aria-checked", "true");
    await userEvent.click(screen.getByTestId("nd-motion-health-degraded"));
    expect(node().motion).toEqual({ health: "degraded" });
    await userEvent.click(screen.getByTestId("nd-motion-health-down"));
    expect(node().motion).toEqual({ health: "down" });
    await userEvent.click(screen.getByTestId("nd-motion-health-off"));
    expect("motion" in node()).toBe(false);
  });
});
