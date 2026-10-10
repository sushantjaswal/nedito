// Style presets.
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { cacheStencils, loadSection } from "../library/stencils";
import { useDocStore } from "../model/store";
import { renderBar, resetStore } from "../context-bar/renderBar.testutil";
import { presetOf, STYLE_PRESETS } from "./stylePresets";

const state = () => useDocStore.getState();
const node = (id: string) => state().doc.diagrams[state().currentDiagramId()].nodes.find((n) => n.id === id)!;

beforeAll(async () => {
  for (const id of ["general", "misc"] as const) {
    const section = await loadSection(id);
    if (section) cacheStencils(section.shapes);
  }
});

describe("the presets", () => {
  it("are a Default and seven colours, each a fill with an outline", () => {
    expect(STYLE_PRESETS[0]).toMatchObject({ id: "default", fill: null, stroke: null });
    expect(STYLE_PRESETS).toHaveLength(8);
    for (const p of STYLE_PRESETS.slice(1)) expect(p.fill && p.stroke).toBeTruthy();
  });

  it("recognise the preset a style matches, and Default for no colours at all", () => {
    expect(presetOf({ fill: "#E3EDFB", stroke: "#3b6fb6" })?.id).toBe("blue");
    expect(presetOf({})?.id).toBe("default");
    expect(presetOf({ fill: "#e3edfb" })).toBeUndefined();
  });
});

describe("applying one", () => {
  beforeEach(resetStore);

  it("sets fill and outline together in one undo step, and Default takes them away again", () => {
    const a = state().addShapeNode("general/rect", { x: 0, y: 0 }, { w: 100, h: 60 });
    const b = state().addShapeNode("general/rect", { x: 200, y: 0 }, { w: 100, h: 60 });
    useDocStore.temporal.getState().clear();
    state().applyStylePreset([a, b], { fill: "#e3edfb", stroke: "#3b6fb6" });
    expect(node(a).style).toMatchObject({ fill: "#e3edfb", stroke: "#3b6fb6" });
    expect(node(b).style).toMatchObject({ fill: "#e3edfb", stroke: "#3b6fb6" });
    expect(useDocStore.temporal.getState().pastStates).toHaveLength(1);
    state().applyStylePreset([a], { fill: null, stroke: null });
    expect(node(a).style).not.toHaveProperty("fill");
    expect(node(a).style).not.toHaveProperty("stroke");
    // Everything else about the shape is untouched.
    expect(node(a).style.shadow).toBe(true);
  });

  it("does nothing in the read-only viewer", () => {
    const a = state().addShapeNode("general/rect", { x: 0, y: 0 }, { w: 100, h: 60 });
    useDocStore.setState((s) => ({ ui: { ...s.ui, viewerMode: true } }));
    state().applyStylePreset([a], { fill: "#e3edfb", stroke: "#3b6fb6" });
    expect(node(a).style).not.toHaveProperty("fill");
    useDocStore.setState((s) => ({ ui: { ...s.ui, viewerMode: false } }));
  });
});

describe("the swatch row in Fill", () => {
  beforeEach(resetStore);

  it("applies a preset to the selected shapes and shows which one they have", async () => {
    const a = state().addShapeNode("general/rect", { x: 0, y: 0 }, { w: 100, h: 60 });
    state().setSelection([a]);
    renderBar();
    await userEvent.click(screen.getByTestId("nd-bar-fill"));
    expect(screen.getByRole("button", { name: "Style: Default" })).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(screen.getByRole("button", { name: "Style: Green" }));
    expect(node(a).style).toMatchObject({ fill: "#e4f3e5", stroke: "#3f8a4a" });
    expect(screen.getByRole("button", { name: "Style: Green" })).toHaveAttribute("aria-pressed", "true");
  });

  it("leaves a pictogram's own colours alone in a mixed selection", async () => {
    const rect = state().addShapeNode("general/rect", { x: 0, y: 0 }, { w: 100, h: 60 });
    const icon = state().addShapeNode("misc/anchor", { x: 200, y: 0 }, { w: 48, h: 48 });
    state().setSelection([rect, icon]);
    renderBar();
    await userEvent.click(screen.getByTestId("nd-bar-fill"));
    await userEvent.click(screen.getByRole("button", { name: "Style: Red" }));
    expect(node(rect).style.fill).toBe("#fbe3e1");
    expect(node(icon).style).not.toHaveProperty("fill");
  });
});
