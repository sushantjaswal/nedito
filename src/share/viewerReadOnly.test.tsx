import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { PageTabStrip } from "../app/PageTabStrip";
import { TOUR_FINISHED, useDocStore } from "../model/store";
import { docAtDepth1, emptyDoc, withBlankPage } from "./testDocs";

// The viewer's read-only guarantee comes mainly from ViewerShell not mounting the editor's
// chrome (see app/App.test.tsx). These cover the pieces that ARE shared with the editor and so
// have to switch their own editing affordances off.
beforeEach(() => {
  useDocStore.getState().exitViewerMode();
  useDocStore.getState().loadDoc(emptyDoc());
});

describe("label editing in viewer mode", () => {
  it("is refused for nodes and edges", () => {
    useDocStore.getState().enterViewerMode(docAtDepth1());

    useDocStore.getState().setEditingNodeId("a");
    useDocStore.getState().setEditingEdgeId("e1");

    expect(useDocStore.getState().editingNodeId).toBeNull();
    expect(useDocStore.getState().editingEdgeId).toBeNull();
  });

  it("still works in the ordinary editor", () => {
    useDocStore.getState().loadDoc(docAtDepth1());
    useDocStore.getState().setEditingNodeId("a");
    expect(useDocStore.getState().editingNodeId).toBe("a");
  });
});

describe("page tabs in viewer mode", () => {
  it("can still switch pages but cannot change the page set", () => {
    const { doc } = withBlankPage(docAtDepth1());
    useDocStore.getState().enterViewerMode(doc);
    render(<PageTabStrip />);

    // Both pages listed and clickable — a shared multi-page document has to be readable.
    expect(screen.getAllByText(/^Page \d$/)).toHaveLength(2);
    // ...but nothing that would edit the page set.
    expect(screen.queryByTestId("nd-page-add")).not.toBeInTheDocument();
    expect(screen.queryByTitle("Delete page")).not.toBeInTheDocument();
  });

  it("offers add and delete in the ordinary editor", () => {
    const { doc } = withBlankPage(docAtDepth1());
    useDocStore.getState().loadDoc(doc);
    render(<PageTabStrip />);

    expect(screen.getByTestId("nd-page-add")).toBeInTheDocument();
    expect(screen.getAllByTitle("Delete page").length).toBeGreaterThan(0);
  });
});

describe("entering viewer mode", () => {
  it("stands the onboarding sample and its tour down", () => {
    useDocStore.getState().enterViewerMode(docAtDepth1());
    const { onboarding } = useDocStore.getState().ui;
    expect(onboarding.demoActive).toBe(false);
    expect(onboarding.tourStep).toBe(TOUR_FINISHED);
  });

  it("opens at the document's first page", () => {
    const doc = docAtDepth1();
    useDocStore.getState().enterViewerMode(doc);
    expect(useDocStore.getState().navStack).toEqual([doc.rootDiagramIds[0]]);
  });
});
