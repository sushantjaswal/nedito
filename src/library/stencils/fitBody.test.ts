import { describe, expect, it } from "vitest";
import { fitStencilBody } from "./fitBody";

describe("fitStencilBody", () => {
  it("gives every self-stroked element a non-scaling stroke", () => {
    const out = fitStencilBody('<path d="M0,0 L100,100" /><circle cx="50" cy="50" r="10"/>', 200, 50);
    expect(out).toBe(
      '<path d="M0,0 L100,100"  vector-effect="non-scaling-stroke"/><circle cx="50" cy="50" r="10" vector-effect="non-scaling-stroke"/>',
    );
  });

  it("leaves an element that sets its own stroke weight scaling with the body", () => {
    const body = '<circle cx="50" cy="50" r="41" fill="none" stroke-width="6" />';
    expect(fitStencilBody(body, 56, 56)).toBe(body);
  });

  it("keeps rounded corners circular on a stretched box", () => {
    // 240×80: the author's 12-unit radius measured on the short side is 9.6px each way.
    const out = fitStencilBody('<rect x="1" y="1" width="98" height="98" rx="12" ry="12" />', 240, 80);
    expect(out).toContain('rx="4"');
    expect(out).toContain('ry="12"');
  });

  it("keeps an edge-to-edge rectangle one pixel inside a large box", () => {
    // 1% of a 1400px container was a 14px inset, leaving its top-left title outside the border.
    const out = fitStencilBody('<rect x="1" y="1" width="98" height="98" />', 1400, 700);
    expect(out).toContain('x="0.071"');
    expect(out).toContain('width="99.857"');
    expect(out).toContain('y="0.143"');
  });

  it("does not touch radii on a square box", () => {
    const out = fitStencilBody('<rect width="98" height="98" rx="12" />', 90, 90);
    expect(out).toBe('<rect width="98" height="98" rx="12"  vector-effect="non-scaling-stroke"/>');
  });
});
