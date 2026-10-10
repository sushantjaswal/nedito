// D78: a label's default colour follows the fill behind it, not the app theme.
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { defaultLabelColor, labelBackdrop, LABEL_INK_DARK, LABEL_INK_LIGHT } from "./labelColor";
import { LabelEditor } from "./LabelEditor";
import type { StencilDef } from "../library/stencils/types";

const outline: StencilDef = { id: "t/box", label: "Box", defaultSize: { w: 100, h: 60 }, svgBody: "<rect />" };

describe("defaultLabelColor", () => {
  it("puts dark ink on the default white paper fill — the dark-mode bug", () => {
    expect(defaultLabelColor("#ffffff")).toBe(LABEL_INK_DARK);
    expect(defaultLabelColor("white")).toBe(LABEL_INK_DARK);
  });

  it("puts light ink on a dark fill", () => {
    expect(defaultLabelColor("#1e2733")).toBe(LABEL_INK_LIGHT);
    expect(defaultLabelColor("#4B3BC4")).toBe(LABEL_INK_LIGHT); // the nesting deep violet
    expect(defaultLabelColor("rgb(20, 26, 34)")).toBe(LABEL_INK_LIGHT);
  });

  it("keeps dark ink on light tints and mid tones that still read dark-on-light", () => {
    expect(defaultLabelColor("#EEEBFC")).toBe(LABEL_INK_DARK); // soft violet fill
    expect(defaultLabelColor("#fff2cc")).toBe(LABEL_INK_DARK);
    expect(defaultLabelColor("#f0f")).toBe(LABEL_INK_DARK);
  });

  it("defers to the theme when nothing opaque is behind the text", () => {
    expect(defaultLabelColor(undefined)).toBeNull();
    expect(defaultLabelColor("none")).toBeNull();
    expect(defaultLabelColor("transparent")).toBeNull();
    expect(defaultLabelColor("var(--nd-color-ink)")).toBeNull();
    expect(defaultLabelColor("#ffffff", 0.2)).toBeNull(); // mostly canvas showing through
    expect(defaultLabelColor("#ffffff00")).toBeNull();
    expect(defaultLabelColor("rgba(255,255,255,0.1)")).toBeNull();
  });

  it("still contrasts with a fill that is only partly see-through", () => {
    expect(defaultLabelColor("#1e2733", 0.8)).toBe(LABEL_INK_LIGHT);
  });
});

describe("labelBackdrop", () => {
  it("is the author's fill when one is set", () => {
    expect(labelBackdrop("#123456", outline)).toBe("#123456");
  });

  // White in both looks (R6, D95: the new look changed the outline, not the fill).
  it("is the white paper for an outline shape with no fill set, in either look", () => {
    expect(labelBackdrop(undefined, outline)).toBe("#ffffff");
    expect(labelBackdrop(undefined, outline, true)).toBe("#ffffff");
  });

  it("is nothing fixed for a vendor icon, which paints itself", () => {
    expect(labelBackdrop("#000000", { ...outline, raw: "<svg/>" })).toBeUndefined();
  });

  it("is white for a shape whose stencil has not loaded, as the canvas draws it", () => {
    expect(labelBackdrop(undefined, undefined)).toBe("#ffffff");
  });
});

describe("LabelEditor", () => {
  // It used to start at the light-theme ink and always commit it, freezing every edited label
  // to dark text as though the author had chosen that colour.
  it("does not commit a colour the author never picked", async () => {
    const onCommit = vi.fn();
    render(<LabelEditor initial={{ text: "Old" }} defaultColor={LABEL_INK_DARK} onCommit={onCommit} onCancel={() => {}} />);
    const box = screen.getByRole("textbox");
    await userEvent.clear(box);
    await userEvent.type(box, "New{Enter}");
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit.mock.calls[0][0].text).toBe("New");
    expect(onCommit.mock.calls[0][0]).not.toHaveProperty("color");
  });

  it("keeps a colour the author had already chosen", async () => {
    const onCommit = vi.fn();
    render(<LabelEditor initial={{ text: "Hi", color: "#ff0000" }} onCommit={onCommit} onCancel={() => {}} />);
    await userEvent.type(screen.getByRole("textbox"), "{Enter}");
    expect(onCommit.mock.calls[0][0].color).toBe("#ff0000");
  });

  // The editor's own formatting strip went in review (D98): the context bar's Text popover has
  // every control it had. What typing shows still matches the label as drawn.
  it("types in the colour the label is actually showing, with no formatting strip of its own", () => {
    render(<LabelEditor initial={{ text: "Hi" }} defaultColor="#ffffff" onCommit={() => {}} onCancel={() => {}} />);
    expect(screen.getByRole("textbox")).toHaveStyle({ color: "#ffffff" });
    expect(screen.queryByLabelText("Text color")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Font size")).not.toBeInTheDocument();
  });

  it("writes back only the new text and what was already set, never a size it invented", async () => {
    const onCommit = vi.fn();
    render(<LabelEditor initial={{ text: "Old", align: "left" }} onCommit={onCommit} onCancel={() => {}} />);
    await userEvent.clear(screen.getByRole("textbox"));
    await userEvent.type(screen.getByRole("textbox"), "New{Enter}");
    expect(onCommit.mock.calls[0][0]).toEqual({ text: "New", align: "left", bold: false, italic: false });
  });

  it("still makes the label bold or italic with Ctrl+B and Ctrl+I", async () => {
    const onCommit = vi.fn();
    render(<LabelEditor initial={{ text: "Hi" }} onCommit={onCommit} onCancel={() => {}} />);
    await userEvent.type(screen.getByRole("textbox"), "{Control>}b{/Control}{Control>}i{/Control}{Enter}");
    expect(onCommit.mock.calls[0][0]).toMatchObject({ bold: true, italic: true });
  });
});
