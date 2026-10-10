// A component that asks for a stencil before its section has loaded must redraw when it arrives.
//
// It did not: the cache was read synchronously and announced nothing, so a canvas node rendered
// in the first second of a session — before ShapeLibrary had loaded, say, the Azure section —
// stayed blank for the rest of it, while an export made a moment later drew the icon perfectly.
// The render-parity sweep found it because its extra document is applied
// the instant the app starts.
import { act, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { cacheStencils, stencilCacheRevision } from "./index";
import type { StencilDef } from "./types";
import { useStencil, useStencilCacheRevision } from "./useStencil";

function stencil(id: string): StencilDef {
  return { id, label: id, defaultSize: { w: 10, h: 10 }, svgBody: "<rect />" };
}

function Probe({ id }: { id: string }) {
  const s = useStencil(id);
  return <span data-testid="probe">{s ? `found ${s.id}` : "missing"}</span>;
}

let renders = 0;
function Counter() {
  useStencilCacheRevision();
  renders += 1;
  return null;
}

describe("useStencil", () => {
  it("redraws when the stencil it asked for lands in the cache", () => {
    const id = "test-late/late-icon";
    render(<Probe id={id} />);
    expect(screen.getByTestId("probe").textContent).toBe("missing");

    act(() => cacheStencils([stencil(id)]));

    expect(screen.getByTestId("probe").textContent).toBe(`found ${id}`);
  });

  it("returns a stencil that is already cached on the first render", () => {
    const id = "test-early/early-icon";
    cacheStencils([stencil(id)]);
    render(<Probe id={id} />);
    expect(screen.getByTestId("probe").textContent).toBe(`found ${id}`);
  });

  it("does not redraw a component when an unrelated section loads", () => {
    const id = "test-stable/mine";
    cacheStencils([stencil(id)]);
    let draws = 0;
    function Counting() {
      useStencil(id);
      draws += 1;
      return null;
    }
    render(<Counting />);
    const before = draws;
    // Another section arriving must not churn every node on the canvas.
    act(() => cacheStencils([stencil("test-stable/someone-else")]));
    expect(draws).toBe(before);
  });

  it("bumps the revision, and redraws revision subscribers, every time the cache grows", () => {
    renders = 0;
    render(<Counter />);
    const firstRevision = stencilCacheRevision();
    const firstRenders = renders;

    act(() => cacheStencils([stencil("test-rev/one")]));

    expect(stencilCacheRevision()).toBe(firstRevision + 1);
    expect(renders).toBe(firstRenders + 1);
  });
});
