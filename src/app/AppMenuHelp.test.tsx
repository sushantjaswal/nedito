import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { useDocStore } from "../model/store";
import { AppMenu } from "./AppMenu";

// The Help menu's items, in the app menu since R2 (D91); its tests, moved with them.
describe("the app menu's help items", () => {
  beforeEach(() => {
    const blank = useDocStore.getState().doc;
    const root = blank.rootDiagramIds[0];
    useDocStore.getState().loadDoc({ ...blank, rootDiagramIds: [root], diagrams: { [root]: { id: root, title: "Page 1", nodes: [], edges: [] } } });
    const s = useDocStore.getState();
    useDocStore.setState({ ui: { ...s.ui, shortcutsDialogOpen: false, notice: null, onboarding: { ...s.ui.onboarding, tourStep: 4 } } });
  });

  it("opens the keyboard shortcuts", async () => {
    render(<AppMenu />);
    await userEvent.click(screen.getByTestId("nd-app-menu-trigger"));
    await userEvent.click(screen.getByTestId("nd-help-shortcuts"));
    expect(useDocStore.getState().ui.shortcutsDialogOpen).toBe(true);
  });

  it("Take the tour brings in the sample when the canvas is empty", async () => {
    render(<AppMenu />);
    await userEvent.click(screen.getByTestId("nd-app-menu-trigger"));
    await userEvent.click(screen.getByTestId("nd-help-tour"));
    const s = useDocStore.getState();
    expect(s.ui.onboarding.demoActive).toBe(true);
    expect(s.doc.diagrams[s.navStack[0]].nodes.some((n) => n.type === "nested")).toBe(true);
  });

  it("never replaces someone's own diagram with the sample", async () => {
    const id = useDocStore.getState().addShapeNode("general/rect", { x: 0, y: 0 }, { w: 100, h: 60 });
    render(<AppMenu />);
    await userEvent.click(screen.getByTestId("nd-app-menu-trigger"));
    await userEvent.click(screen.getByTestId("nd-help-tour"));
    const s = useDocStore.getState();
    expect(s.doc.diagrams[s.currentDiagramId()].nodes.some((n) => n.id === id)).toBe(true);
    expect(s.ui.notice?.message).toMatch(/menu › New/);
  });

  it("opens About (N4; the dialog's own tests are in AboutDialog.test.tsx)", async () => {
    render(<AppMenu />);
    await userEvent.click(screen.getByTestId("nd-app-menu-trigger"));
    await userEvent.click(screen.getByTestId("nd-help-about"));
    expect(useDocStore.getState().ui.aboutOpen).toBe(true);
  });
});
