import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StencilGlyph } from "./StencilGlyph";

describe("StencilGlyph", () => {
  it("applies no content transform when aspectRatio is omitted (unchanged default behavior)", () => {
    const { container } = render(<StencilGlyph svgBody='<rect x="1" y="1" width="98" height="98" />' />);
    const wrapperG = container.querySelector("svg > g");
    expect(wrapperG?.getAttribute("transform")).toBeNull();
  });

  it("applies no content transform when aspectRatio is exactly 1 (already square)", () => {
    const { container } = render(<StencilGlyph svgBody='<rect x="1" y="1" width="98" height="98" />' aspectRatio={1} />);
    const wrapperG = container.querySelector("svg > g");
    expect(wrapperG?.getAttribute("transform")).toBeNull();
  });

  it("compresses the Y axis for a wide shape (aspectRatio > 1) — this is the Rectangle-preview fix", () => {
    // Rectangle: defaultSize 120x60 -> aspectRatio 2. Its square-drawn 100x100 path should
    // visually flatten to reflect that 2:1 ratio inside the preview, exactly like it does once
    // stretched onto the canvas.
    const { container } = render(<StencilGlyph svgBody='<rect x="1" y="1" width="98" height="98" />' aspectRatio={2} />);
    const wrapperG = container.querySelector("svg > g");
    expect(wrapperG?.getAttribute("transform")).toBe("translate(50 50) scale(1 0.5) translate(-50 -50)");
  });

  it("compresses the X axis for a tall shape (aspectRatio < 1)", () => {
    const { container } = render(<StencilGlyph svgBody='<rect x="1" y="1" width="98" height="98" />' aspectRatio={0.5} />);
    const wrapperG = container.querySelector("svg > g");
    expect(wrapperG?.getAttribute("transform")).toBe("translate(50 50) scale(0.5 1) translate(-50 -50)");
  });

  it("does not apply a content transform to raw (vendor icon) glyphs, which have no aspectRatio concept", () => {
    const { container } = render(<StencilGlyph svgBody="" raw="<svg><rect/></svg>" aspectRatio={2} />);
    // raw glyphs render their own markup directly, bypassing the viewBox/transform wrapper entirely.
    expect(container.querySelector("svg > g")).toBeNull();
  });
});
