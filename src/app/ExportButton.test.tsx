// The Export split button (R2, CLAUDE_HISTORY.md D91): the main part repeats the last format used,
// PNG until the first export, and the arrow lists every format.
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BRAND } from "./brand";
import { ExportButton } from "./ExportButton";
import { EXPORT_FORMATS } from "./fileActions";

const runs = new Map(EXPORT_FORMATS.map((f) => [f.id, vi.spyOn(f, "run").mockResolvedValue(undefined)]));

describe("the Export button", () => {
  beforeEach(() => {
    localStorage.removeItem(`${BRAND.storagePrefix}:lastExport`);
    for (const run of runs.values()) run.mockClear();
  });

  it("exports PNG until something else has been used", async () => {
    render(<ExportButton />);
    expect(screen.getByTestId("nd-export-main")).toHaveTextContent("Export PNG");
    await userEvent.click(screen.getByTestId("nd-export-main"));
    expect(runs.get("png")).toHaveBeenCalledTimes(1);
  });

  it("lists every format, Copy image with live link and Print under its arrow", async () => {
    render(<ExportButton />);
    await userEvent.click(screen.getByTestId("nd-export-menu-trigger"));
    for (const f of EXPORT_FORMATS) expect(screen.getByTestId(f.testId)).toBeInTheDocument();
    expect(screen.getByTestId("nd-copy-image-link")).toBeInTheDocument();
    expect(screen.getByTestId("nd-print")).toBeInTheDocument();
  });

  it("repeats the last format chosen, and remembers it next time", async () => {
    const { unmount } = render(<ExportButton />);
    await userEvent.click(screen.getByTestId("nd-export-menu-trigger"));
    await userEvent.click(screen.getByTestId("nd-export-svg"));
    expect(runs.get("svg")).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("nd-export-main")).toHaveTextContent("Export SVG");
    unmount();

    render(<ExportButton />);
    expect(screen.getByTestId("nd-export-main")).toHaveTextContent("Export SVG");
    await userEvent.click(screen.getByTestId("nd-export-main"));
    expect(runs.get("svg")).toHaveBeenCalledTimes(2);
  });
});
