import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { writeCollapsedSections } from "../library/collapsedSections";
import { AppShell } from "./AppShell";

describe("AppShell", () => {
  it("renders the top bar, the shape library, the canvas with its settings chip, and page tabs", async () => {
    // A first visit opens only General (D31, D87); this test wants General's shapes
    // visible, not the collapse affordance, so start pre-expanded.
    writeCollapsedSections(new Set());
    render(<AppShell />);

    expect(screen.getByText("Nedito")).toBeInTheDocument();
    expect(screen.getByTestId("nd-shape-library")).toBeInTheDocument();
    // No right-hand panel since R1 (D90): the canvas takes its width, and the diagram's settings
    // sit on the canvas chip.
    expect(screen.queryByTestId("nd-format-panel")).not.toBeInTheDocument();
    expect(screen.getByTestId("nd-canvas")).toBeInTheDocument();
    expect(screen.getByTestId("nd-canvas-chip")).toBeInTheDocument();
    expect(screen.getByTestId("nd-page-tabs")).toBeInTheDocument();

    // let the sidebar's lazy stencil-section loading settle before the test exits
    expect(await screen.findByTestId("nd-stencil-general/rect")).toBeInTheDocument();
  });
});
