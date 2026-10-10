// About (N4): the words are docs/about-copy.md's exactly, the name and versions come from code,
// the little Nested Block opens and closes, and the keyboard reaches everything.
import { readFileSync } from "node:fs";
import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { CURRENT_FORMAT_VERSION } from "../file/documentFormat";
import { useDocStore } from "../model/store";
import pkg from "../../package.json";
import { AboutDialog } from "./AboutDialog";
import { AppMenu } from "./AppMenu";
import { BRAND } from "./brand";
import { getCommands } from "./commands";
import { personalWordsIn } from "./personalWords";

/** The copy between the first two rules of about-copy.md, as plain text blocks with the name put in. */
function copyBlocks(): string[] {
  const md = readFileSync("docs/about-copy.md", "utf8").replace(/\r\n/g, "\n");
  const [, copy, version] = md.split("\n---\n");
  return [...copy.split("\n\n"), version]
    .map((b) =>
      b
        .trim()
        .replace(/\{BRAND\.name\}/g, BRAND.name)
        .replace(/\{BRAND\.contact\}/g, BRAND.contact)
        .replace(/^#+ /, "")
        .replace(/^- /, "")
        .replace(/\*\*([^*]+)\*\*/g, "$1")
        .replace(/\*([^*]+)\*/g, "$1"),
    )
    .filter(Boolean)
    // the bulleted list is one block in the markdown, two items on the page
    .flatMap((b) => b.split("\n- "));
}

const text = (el: Element) => (el.textContent ?? "").replace(/\s+/g, " ").trim();

function openAbout() {
  act(() => useDocStore.getState().setAboutOpen(true));
}

describe("About", () => {
  beforeEach(() => {
    act(() => useDocStore.getState().setAboutOpen(false));
  });

  it("says exactly what about-copy.md says, block by block, with the name from BRAND", () => {
    render(<AboutDialog />);
    openAbout();
    const page = text(screen.getByTestId("nd-about-dialog"));
    const blocks = copyBlocks();
    expect(blocks.length).toBeGreaterThan(10);
    for (const block of blocks) {
      const expected = block
        .replace("{app version}", pkg.version)
        .replace("{formatVersion}", String(CURRENT_FORMAT_VERSION));
      expect(page, block).toContain(expected);
    }
    expect(page).not.toMatch(/\{|\}/);
    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent(`About ${BRAND.name}`);
  });

  it("reads the version and the file format's version from code", () => {
    render(<AboutDialog />);
    openAbout();
    expect(screen.getByTestId("nd-about-version")).toHaveTextContent(
      `Version ${pkg.version} · File format v${CURRENT_FORMAT_VERSION}`,
    );
  });

  it("names no one, and gives the contact address as plain text, with no mail link", () => {
    render(<AboutDialog />);
    openAbout();
    const page = text(screen.getByTestId("nd-about-dialog"));
    expect(personalWordsIn(page)).toEqual([]);
    expect(screen.getByTestId("nd-about-contact")).toHaveTextContent(BRAND.contact);
    // A mailto: did nothing where no mail client was set up (user, 2026-10-08).
    expect(screen.getByTestId("nd-about-dialog").querySelectorAll("a")).toHaveLength(0);
  });

  it("the Nested Block opens with ⤢ to the three boxes, and the breadcrumb climbs back out", async () => {
    render(<AboutDialog />);
    openAbout();
    expect(screen.queryByTestId("nd-about-demo-inside")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Open Why this exists?" }));
    const inside = screen.getByTestId("nd-about-demo-inside");
    expect([...inside.querySelectorAll("li")].map(text)).toEqual(["Too much detail", "Box holds a diagram", "Open to explore"]);
    expect(text(inside.querySelector("nav")!)).toMatch(/^About\s*›\s*Why this exists\?$/);
    await userEvent.click(screen.getByTestId("nd-about-demo-back"));
    expect(screen.queryByTestId("nd-about-demo-inside")).toBeNull();
  });

  it("Esc climbs out of the Nested Block first, then closes", async () => {
    render(<AboutDialog />);
    openAbout();
    await userEvent.click(screen.getByTestId("nd-about-demo-open"));
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByTestId("nd-about-demo-inside")).toBeNull();
    expect(useDocStore.getState().ui.aboutOpen).toBe(true);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(useDocStore.getState().ui.aboutOpen).toBe(false);
  });

  it("is a labelled modal dialog, and Tab stays inside it", async () => {
    render(<AboutDialog />);
    openAbout();
    const dialog = screen.getByRole("dialog", { name: `About ${BRAND.name}` });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    // The dialog's controls, in order: close, then the demo's ⤢. Tab past the last wraps to the
    // first and Shift+Tab before the first wraps to the last (a real browser walks it in m27).
    const close = screen.getByTestId("nd-about-close");
    const open = screen.getByTestId("nd-about-demo-open");
    open.focus();
    fireEvent.keyDown(window, { key: "Tab" });
    expect(document.activeElement).toBe(close);
    fireEvent.keyDown(window, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(open);
    // Focus somehow outside (the page behind) is brought back in.
    (document.body as HTMLElement).focus();
    fireEvent.keyDown(window, { key: "Tab" });
    expect(dialog.contains(document.activeElement)).toBe(true);
  });

  it("opens from the app menu and from the palette's 'about' command", async () => {
    render(
      <>
        <AppMenu />
        <AboutDialog />
      </>,
    );
    await userEvent.click(screen.getByTestId("nd-app-menu-trigger"));
    await userEvent.click(screen.getByTestId("nd-help-about"));
    expect(screen.getByTestId("nd-about-dialog")).toBeInTheDocument();
    act(() => useDocStore.getState().setAboutOpen(false));
    const about = getCommands().find((c) => c.id === "about")!;
    expect(about.label.toLowerCase()).toContain("about");
    act(() => about.run());
    expect(screen.getByTestId("nd-about-dialog")).toBeInTheDocument();
  });
});
