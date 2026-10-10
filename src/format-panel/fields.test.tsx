// The formatting fields: what typing, clearing and dragging actually write, and how many undo
// steps an edit leaves. Driven through the context bar's popovers, where the
// right panel's fields now live (R1, D90).
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { useDocStore } from "../model/store";
import { renderBar, resetStore } from "../context-bar/renderBar.testutil";

const shape = () => {
  const s = useDocStore.getState();
  return s.doc.diagrams[s.currentDiagramId()].nodes[0];
};
const undoSteps = () => useDocStore.temporal.getState().pastStates.length;

async function selectNewShape() {
  const id = useDocStore.getState().addShapeNode("general/rect", { x: 10, y: 20 }, { w: 120, h: 60 });
  useDocStore.getState().setNodeLabel(id, { text: "Alpha" });
  useDocStore.getState().setSelection([id]);
  useDocStore.temporal.getState().clear();
  return id;
}

describe("number fields", () => {
  beforeEach(resetStore);

  it("never writes an empty field, so clearing the width to retype it does not collapse the shape", async () => {
    await selectNewShape();
    renderBar();
    await userEvent.click(screen.getByTestId("nd-bar-arrange"));
    const width = screen.getByLabelText("Width");
    await userEvent.clear(width);
    expect(shape().size.w).toBe(120);
    await userEvent.type(width, "200");
    await userEvent.tab();
    expect(shape().size.w).toBe(200);
  });

  it("makes a typed value one undo step, and undo restores the value from before the edit", async () => {
    await selectNewShape();
    renderBar();
    await userEvent.click(screen.getByTestId("nd-bar-arrange"));
    const width = screen.getByLabelText("Width");
    await userEvent.clear(width);
    await userEvent.type(width, "200");
    await userEvent.tab();
    expect(undoSteps()).toBe(1);
    useDocStore.temporal.getState().undo();
    expect(shape().size.w).toBe(120);
  });

  it("keeps a value inside its range", async () => {
    await selectNewShape();
    renderBar();
    await userEvent.click(screen.getByTestId("nd-bar-text"));
    const size = screen.getByLabelText("Font size");
    await userEvent.clear(size);
    await userEvent.type(size, "500");
    await userEvent.tab();
    expect(shape().label?.fontSize).toBe(96);
  });

  it("records separate edits as separate steps", async () => {
    await selectNewShape();
    renderBar();
    await userEvent.click(screen.getByTestId("nd-bar-arrange"));
    await userEvent.clear(screen.getByLabelText("Width"));
    await userEvent.type(screen.getByLabelText("Width"), "200");
    await userEvent.clear(screen.getByLabelText("Height"));
    await userEvent.type(screen.getByLabelText("Height"), "90");
    await userEvent.tab();
    expect(undoSteps()).toBe(2);
  });
});

describe("the shape style controls", () => {
  beforeEach(resetStore);

  it("offers No fill, a line pattern and a shadow, under Fill, Line and More", async () => {
    await selectNewShape();
    renderBar();
    await userEvent.click(screen.getByTestId("nd-bar-fill"));
    await userEvent.click(screen.getByLabelText("No fill"));
    expect(shape().style.fill).toBe("none");
    await userEvent.click(screen.getByLabelText("No fill"));
    expect(shape().style.fill).toBe("#ffffff");
    await userEvent.click(screen.getByTestId("nd-bar-line"));
    await userEvent.selectOptions(screen.getByLabelText("Line pattern"), "dashed");
    expect(shape().style.dash).toBe("dashed");
    await userEvent.click(screen.getByTestId("nd-bar-more"));
    await userEvent.click(screen.getByLabelText("Shadow"));
    expect(shape().style.shadow).toBe(true);
  });
});
