import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { LocalOnlyBadge } from "./LocalOnlyBadge";
import { BRAND } from "./brand";

vi.mock("../file/saveDocument", () => ({ saveDocument: vi.fn() }));
const { saveDocument } = await import("../file/saveDocument");

function openPopover() {
  render(<LocalOnlyBadge />);
  const badge = screen.getByTestId("nd-local-only-badge");
  fireEvent.click(badge);
  return { badge, popover: screen.getByTestId("nd-local-only-popover") };
}

describe("LocalOnlyBadge", () => {
  it("renders the badge with the local-only label", () => {
    render(<LocalOnlyBadge />);
    expect(screen.getByTestId("nd-local-only-badge")).toHaveTextContent("Local only · nothing uploaded");
  });

  it("does not show the popover until the badge is clicked", () => {
    render(<LocalOnlyBadge />);
    expect(screen.queryByTestId("nd-local-only-popover")).toBeNull();
    fireEvent.click(screen.getByTestId("nd-local-only-badge"));
    expect(screen.getByTestId("nd-local-only-popover")).toBeInTheDocument();
  });

  // The copy accuracy rule, enforced rather than trusted: browser storage is
  // neither secure nor permanent, so any copy implying otherwise would be a false claim about
  // the user's data. "Nothing is uploaded" is the claim this app can actually stand behind.
  it("never claims the data is secure, encrypted, or private", () => {
    const { popover } = openPopover();
    const text = popover.textContent!.toLowerCase();
    for (const forbidden of ["secure", "encrypted", "private"]) {
      expect(text).not.toContain(forbidden);
    }
  });

  it("states the honest claim and the risk that comes with it", () => {
    const { popover } = openPopover();
    const text = popover.textContent!;
    expect(text).toContain("Your data never leaves this device");
    expect(text).toContain("Clearing browser data will erase your work");
  });

  it("reads the product name and file extension from BRAND, never hardcoded", () => {
    const { popover } = openPopover();
    expect(popover.textContent).toContain(BRAND.name);
    expect(popover.textContent).toContain(BRAND.fileExt);
  });

  it("closes on Escape and returns focus to the badge", () => {
    const { badge } = openPopover();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByTestId("nd-local-only-popover")).toBeNull();
    expect(document.activeElement).toBe(badge);
  });

  it("closes on an outside click", () => {
    openPopover();
    fireEvent.pointerDown(document.body);
    expect(screen.queryByTestId("nd-local-only-popover")).toBeNull();
  });

  it("stays open when clicking inside the popover", () => {
    const { popover } = openPopover();
    fireEvent.pointerDown(popover);
    expect(screen.getByTestId("nd-local-only-popover")).toBeInTheDocument();
  });

  it("exposes the badge as an expandable dialog trigger for assistive tech", () => {
    render(<LocalOnlyBadge />);
    const badge = screen.getByTestId("nd-local-only-badge");
    expect(badge).toHaveAttribute("aria-haspopup", "dialog");
    expect(badge).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(badge);
    expect(badge).toHaveAttribute("aria-expanded", "true");
  });

  it("downloads a copy through the shared save action and closes", () => {
    openPopover();
    fireEvent.click(screen.getByTestId("nd-local-only-download"));
    expect(saveDocument).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId("nd-local-only-popover")).toBeNull();
  });
});
