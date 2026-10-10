import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { useDocStore } from "../model/store";
import { ShortcutsDialog } from "./ShortcutsDialog";

beforeEach(() => {
  useDocStore.setState((s) => ({ ui: { ...s.ui, shortcutsDialogOpen: false } }));
});

describe("ShortcutsDialog", () => {
  it("renders nothing when closed", () => {
    render(<ShortcutsDialog />);
    expect(screen.queryByTestId("nd-shortcuts-dialog")).not.toBeInTheDocument();
  });

  it("renders the shortcut list when open, and closes on the close button", async () => {
    useDocStore.setState((s) => ({ ui: { ...s.ui, shortcutsDialogOpen: true } }));
    const user = userEvent.setup();
    render(<ShortcutsDialog />);

    expect(screen.getByTestId("nd-shortcuts-dialog")).toBeInTheDocument();
    expect(screen.getByText("Undo")).toBeInTheDocument();

    await user.click(screen.getByLabelText("Close"));
    expect(useDocStore.getState().ui.shortcutsDialogOpen).toBe(false);
  });

  it("closes when the overlay backdrop is clicked", async () => {
    useDocStore.setState((s) => ({ ui: { ...s.ui, shortcutsDialogOpen: true } }));
    const user = userEvent.setup();
    render(<ShortcutsDialog />);

    await user.click(screen.getByTestId("nd-shortcuts-dialog"));
    expect(useDocStore.getState().ui.shortcutsDialogOpen).toBe(false);
  });
});
