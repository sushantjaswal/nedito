// The command palette. The Edit, View, Arrange and Extras menus' tests
// moved here with their commands: each case checks the same thing it did on its menu — an item
// greyed out there is offered but disabled here — plus what only a palette does: filtering,
// Enter and Esc, and going to a shape by name.
import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { useDocStore } from "../model/store";
import { CommandPalette } from "./CommandPalette";

function resetStore() {
  const initial = useDocStore.getState();
  const rootId = initial.doc.rootDiagramIds[0];
  useDocStore.setState({
    doc: { ...initial.doc, rootDiagramIds: [rootId], diagrams: { [rootId]: { id: rootId, title: "Page 1", nodes: [], edges: [] } } },
    navStack: [rootId],
    selection: { nodeIds: [], edgeIds: [] },
    ui: { ...initial.ui, paletteOpen: false, gridEnabled: true, snapEnabled: true, minimapOpen: false, darkMode: false, viewerMode: false, shortcutsDialogOpen: false },
  });
  useDocStore.temporal.getState().clear();
}

const state = () => useDocStore.getState();
const page = () => state().doc.diagrams[state().currentDiagramId()];
const addRect = (x = 0) => state().addShapeNode("general/rect", { x, y: 0 }, { w: 100, h: 60 });

function openPalette() {
  act(() => state().setPaletteOpen(true));
}
function renderPalette() {
  render(<CommandPalette />);
  openPalette();
}
/** A command in the list, by its label (exactly, for a string) — not its tick, shortcut or group. */
function option(label: RegExp | string): HTMLElement {
  const found = screen.getAllByRole("option").filter((o) => {
    const text = (o.firstElementChild?.textContent ?? "").replace(/^✓/, "");
    return typeof label === "string" ? text === label || text.startsWith(label + "…") : label.test(text);
  });
  if (found.length !== 1) throw new Error(`expected one option labelled ${String(label)}, found ${found.length}`);
  return found[0];
}
const ticked = (el: HTMLElement) => (el.firstElementChild?.textContent ?? "").startsWith("✓");
const isDisabled = (el: HTMLElement) => el.getAttribute("aria-disabled") === "true";

describe("the command palette", () => {
  beforeEach(resetStore);

  it("opens on request and lists the app's commands", () => {
    renderPalette();
    expect(screen.getByRole("dialog", { name: "Command palette" })).toBeInTheDocument();
    for (const name of ["New diagram", "Open…", "Undo", "Zoom In", "To Front", "Diagram Settings", "Keyboard Shortcuts", "Export to PowerPoint"]) {
      expect(option(name)).toBeInTheDocument();
    }
  });

  it("filters as you type, matching every word, by label, group or other names", async () => {
    renderPalette();
    await userEvent.type(screen.getByTestId("nd-command-input"), "align left");
    expect(screen.getAllByRole("option").map((o) => o.textContent)).toEqual([expect.stringMatching(/^Align Left/)]);
    await userEvent.clear(screen.getByTestId("nd-command-input"));
    await userEvent.type(screen.getByTestId("nd-command-input"), "minimap");
    expect(option("Outline")).toBeInTheDocument();
  });

  it("runs the highlighted command with Enter, moves with the arrow keys, and closes", async () => {
    renderPalette();
    const input = screen.getByTestId("nd-command-input");
    await userEvent.type(input, "show grid");
    fireEvent.keyDown(input, { key: "Enter" });
    expect(state().ui.gridEnabled).toBe(false);
    expect(state().ui.paletteOpen).toBe(false);

    openPalette();
    await userEvent.type(screen.getByTestId("nd-command-input"), "zoom");
    fireEvent.keyDown(screen.getByTestId("nd-command-input"), { key: "ArrowDown" });
    expect(screen.getAllByRole("option")[1]).toHaveAttribute("aria-selected", "true");
  });

  it("closes on Esc without running anything", async () => {
    renderPalette();
    fireEvent.keyDown(screen.getByTestId("nd-command-input"), { key: "Escape" });
    expect(state().ui.paletteOpen).toBe(false);
  });

  it("goes to a named shape on another level, selecting it", async () => {
    const { nestedNodeId, childDiagramId } = state().addNestedNode({ x: 0, y: 0 }, { w: 200, h: 140 });
    state().navigateInto(nestedNodeId);
    const inner = addRect();
    state().setNodeLabel(inner, { text: "Fraud Engine" });
    state().navigateToDiagram(state().doc.rootDiagramIds[0]);

    renderPalette();
    await userEvent.type(screen.getByTestId("nd-command-input"), "fraud");
    await userEvent.click(option(/^Go to: Fraud Engine/));
    expect(state().currentDiagramId()).toBe(childDiagramId);
    expect(state().selection.nodeIds).toEqual([inner]);
  });
});

// ---- the Edit menu's tests

describe("the palette's Edit commands (once the Edit menu)", () => {
  beforeEach(resetStore);

  it("Undo/Redo are disabled with no history and enable once a change is made", () => {
    renderPalette();
    expect(isDisabled(option("Undo"))).toBe(true);
    expect(isDisabled(option("Redo"))).toBe(true);
    act(() => void addRect());
    act(() => state().setPaletteOpen(false));
    openPalette();
    expect(isDisabled(option("Undo"))).toBe(false);
  });

  it("Undo reverts the last change", async () => {
    act(() => void addRect());
    expect(page().nodes).toHaveLength(1);
    renderPalette();
    await userEvent.click(option("Undo"));
    expect(page().nodes).toHaveLength(0);
  });

  it("Cut/Copy/Duplicate/Delete are disabled without a selection and enabled with one", () => {
    const id = addRect();
    state().setSelection([]);
    renderPalette();
    for (const name of ["Cut", "Copy", "Duplicate", "Delete"]) expect(isDisabled(option(name))).toBe(true);
    act(() => state().setPaletteOpen(false));
    act(() => state().setSelection([id]));
    openPalette();
    for (const name of ["Cut", "Copy", "Duplicate", "Delete"]) expect(isDisabled(option(name))).toBe(false);
  });

  it("Delete removes the selected node", async () => {
    const id = addRect();
    state().setSelection([id]);
    renderPalette();
    await userEvent.click(option("Delete"));
    expect(page().nodes).toHaveLength(0);
  });

  it("Find/Replace... toggles ui.findReplaceOpen", async () => {
    renderPalette();
    await userEvent.click(option("Find/Replace..."));
    expect(state().ui.findReplaceOpen).toBe(true);
    act(() => state().toggleFindReplace());
  });

  it("Select All selects every node", async () => {
    addRect();
    state().setSelection([]);
    renderPalette();
    await userEvent.click(option("Select All"));
    expect(state().selection.nodeIds).toHaveLength(1);
  });
});

// ---- the View menu's tests

describe("the palette's View commands (once the View menu)", () => {
  beforeEach(resetStore);

  it("Show Grid reflects and toggles ui.gridEnabled", async () => {
    renderPalette();
    expect(ticked(option("Show Grid"))).toBe(true);
    await userEvent.click(option(/Show Grid/));
    expect(state().ui.gridEnabled).toBe(false);
  });

  it("Snap to Grid reflects and toggles ui.snapEnabled", async () => {
    renderPalette();
    await userEvent.click(option(/Snap to Grid/));
    expect(state().ui.snapEnabled).toBe(false);
  });

  it("Outline reflects and toggles ui.minimapOpen", async () => {
    renderPalette();
    expect(ticked(option("Outline"))).toBe(false);
    await userEvent.click(option(/Outline/));
    expect(state().ui.minimapOpen).toBe(true);
  });

  it("Dark Mode reflects and toggles ui.darkMode", async () => {
    renderPalette();
    expect(ticked(option("Dark Mode"))).toBe(false);
    await userEvent.click(option(/Dark Mode/));
    expect(state().ui.darkMode).toBe(true);
    act(() => state().toggleDarkMode());
  });

  it("Zoom commands are present and runnable without a mounted canvas (no-op, no crash)", async () => {
    renderPalette();
    await userEvent.click(option("Zoom In"));
    openPalette();
    await userEvent.click(option("Zoom Out"));
    openPalette();
    await userEvent.click(option(/Reset Zoom/));
    openPalette();
    await userEvent.click(option("Fit Page"));
  });
});

// ---- the Arrange menu's tests

describe("the palette's Arrange commands (once the Arrange menu)", () => {
  beforeEach(resetStore);

  // Insert image… needs no selection.
  it("offers Insert image… with nothing selected, and not in the read-only viewer", () => {
    renderPalette();
    expect(isDisabled(option("Insert image"))).toBe(false);
    act(() => state().setPaletteOpen(false));
    act(() => useDocStore.setState((s) => ({ ui: { ...s.ui, viewerMode: true } })));
    openPalette();
    expect(isDisabled(option("Insert image"))).toBe(true);
  });

  // R3 (D92): the ＋ handles' click, from the keyboard.
  it("Add connected shape needs one shape selected, and adds it on that side", async () => {
    renderPalette();
    expect(isDisabled(option("Add connected shape to the right"))).toBe(true);
    act(() => state().setPaletteOpen(false));
    const a = addRect();
    act(() => state().setSelection([a]));
    openPalette();
    expect(isDisabled(option("Add connected shape below"))).toBe(false);
    await userEvent.click(option("Add connected shape below"));
    const copy = page().nodes.find((n) => n.id !== a)!;
    expect(copy.position.y).toBeGreaterThan(60);
    expect(page().edges).toHaveLength(1);
    expect(state().selection.nodeIds).toEqual([copy.id]);
  });

  it("z-order commands are disabled without a selection", () => {
    renderPalette();
    expect(isDisabled(option("To Front"))).toBe(true);
    expect(isDisabled(option("To Back"))).toBe(true);
  });

  it("To Front brings the selected node above its sibling", async () => {
    const a = addRect();
    const b = addRect(50);
    state().setSelection([a]);
    const zBefore = page().nodes.find((n) => n.id === a)!.z;
    renderPalette();
    await userEvent.click(option("To Front"));
    const zA = page().nodes.find((n) => n.id === a)!.z;
    const zB = page().nodes.find((n) => n.id === b)!.z;
    expect(zA).toBeGreaterThan(zBefore);
    expect(zA).toBeGreaterThan(zB);
  });

  it("Align/Distribute enable thresholds follow selection size (2 for align, 3 for distribute)", () => {
    const a = addRect();
    const b = addRect(200);
    state().setSelection([a, b]);
    renderPalette();
    expect(isDisabled(option("Align Left"))).toBe(false);
    expect(isDisabled(option("Distribute Horizontally"))).toBe(true);
  });

  it("Group creates a group node from 2+ selected shapes", async () => {
    const a = addRect();
    const b = addRect(200);
    state().setSelection([a, b]);
    renderPalette();
    await userEvent.click(option(/^Group/));
    expect(page().nodes.find((n) => n.type === "group")).toBeDefined();
  });
});

// ---- the Extras menu's tests

describe("the palette's Diagram Settings and Keyboard Shortcuts (once the Extras menu)", () => {
  beforeEach(resetStore);

  it("Diagram Settings clears the current selection and opens the canvas chip's Page popover", async () => {
    const id = addRect();
    state().setSelection([id]);
    renderPalette();
    await userEvent.click(option("Diagram Settings"));
    expect(state().selection.nodeIds).toEqual([]);
    expect(state().ui.pageSettingsOpen).toBe(true);
    act(() => state().setPageSettingsOpen(false));
  });

  it("Keyboard Shortcuts opens the shortcuts dialog", async () => {
    renderPalette();
    await userEvent.click(option("Keyboard Shortcuts"));
    expect(state().ui.shortcutsDialogOpen).toBe(true);
  });
});
