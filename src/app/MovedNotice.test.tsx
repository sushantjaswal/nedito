// The notice on an alias host that holds the visitor's own work (D100).
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MovedNotice } from "./MovedNotice";

const download = vi.hoisted(() => vi.fn());
vi.mock("../file/download", () => ({ downloadText: download }));

describe("MovedNotice", () => {
  beforeEach(() => {
    localStorage.clear();
    download.mockClear();
  });
  afterEach(() => vi.restoreAllMocks());

  it("says the app has moved, and offers the work for download before anything else", () => {
    localStorage.setItem("deepdraw:autosave", '{"format":"deepdraw","meta":{"title":"Q3 plan"},"diagrams":{}}');
    render(<MovedNotice to="https://nedito.app/" />);
    expect(screen.getByRole("alertdialog")).toHaveTextContent("Nedito has moved to nedito.app");
    expect(screen.getByTestId("nd-moved-download")).toHaveFocus();
    fireEvent.click(screen.getByTestId("nd-moved-download"));
    expect(download).toHaveBeenCalledWith(expect.stringContaining("Q3 plan"), "Q3 plan.nedito", "application/json");
  });

  it("asks before going on without the work, and stays if the answer is no", () => {
    localStorage.setItem("nedito:autosave", '{"meta":{"title":"x"},"diagrams":{}}');
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<MovedNotice to="https://nedito.app/" />);
    fireEvent.click(screen.getByTestId("nd-moved-continue"));
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
  });
});
