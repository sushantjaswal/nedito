import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { useDocStore } from "../model/store";
import { createDefaultLayers } from "../model/layers";
import type { DiagramDocument } from "../model/types";
import { ImportNoticesPanel } from "./ImportNoticesPanel";

function twoPages(): DiagramDocument {
  const page = (id: string, title: string) => ({ id, title, layers: createDefaultLayers(), nodes: [], edges: [] });
  return {
    formatVersion: 2,
    meta: { title: "t", created: "2026-09-25T00:00:00.000Z", modified: "2026-09-25T00:00:00.000Z", appVersion: "0.0.1" },
    rootDiagramIds: ["pageA", "pageB"],
    diagrams: { pageA: page("pageA", "A"), pageB: page("pageB", "B") },
  };
}

describe("ImportNoticesPanel", () => {
  beforeEach(() => {
    act(() => useDocStore.getState().loadDoc(twoPages()));
  });

  it("shows nothing when the import changed nothing", () => {
    render(<ImportNoticesPanel />);
    act(() => useDocStore.getState().showImportNotices([]));
    expect(screen.queryByTestId("nd-import-notices")).toBeNull();
  });

  it("drops a note about a page that has since been deleted, rather than offering to open it", () => {
    render(<ImportNoticesPanel />);
    act(() =>
      useDocStore.getState().showImportNotices([
        { diagramId: "pageA", message: "A: drew x as a plain rectangle", nodeIds: [] },
        { diagramId: "gone", message: "Gone: skipped 1 connection", nodeIds: [] },
      ]),
    );
    expect(screen.getByTestId("nd-import-notices").textContent).toContain("A: drew x");
    expect(screen.getByTestId("nd-import-notices").textContent).not.toContain("Gone:");
    expect(screen.getByTestId("nd-import-notices").textContent).toContain("One thing");
  });

  it("closes on Escape", () => {
    render(<ImportNoticesPanel />);
    act(() => useDocStore.getState().showImportNotices([{ diagramId: "pageA", message: "note", nodeIds: [] }]));
    expect(screen.getByTestId("nd-import-notices")).toBeTruthy();
    act(() => {
      fireEvent.keyDown(window, { key: "Escape" });
    });
    expect(screen.queryByTestId("nd-import-notices")).toBeNull();
  });

  it("is cleared by loading a different document, whose pages the notes cannot refer to", () => {
    render(<ImportNoticesPanel />);
    act(() => useDocStore.getState().showImportNotices([{ diagramId: "pageA", message: "note", nodeIds: [] }]));
    act(() => useDocStore.getState().loadDoc(twoPages()));
    expect(screen.queryByTestId("nd-import-notices")).toBeNull();
  });
});
