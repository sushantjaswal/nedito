import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { encodeDoc } from "../file/documentFormat";
import { embedTextChunk } from "../file/pngChunks";
import { useDocStore } from "../model/store";
import type { DiagramDocument } from "../model/types";
import { AppMenu } from "./AppMenu";

function minimalPngBytes(): Uint8Array {
  const signature = Uint8Array.of(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);
  const ihdrData = new Uint8Array(13);
  const ihdr = new Uint8Array(8 + 13 + 4);
  ihdr.set(Uint8Array.of(0, 0, 0, 13), 0);
  ihdr.set(Uint8Array.from("IHDR", (c) => c.charCodeAt(0)), 4);
  ihdr.set(ihdrData, 8);
  const iend = Uint8Array.of(0, 0, 0, 0, 0x49, 0x45, 0x4e, 0x44, 0, 0, 0, 0);
  const out = new Uint8Array(signature.length + ihdr.length + iend.length);
  out.set(signature, 0);
  out.set(ihdr, signature.length);
  out.set(iend, signature.length + ihdr.length);
  return out;
}

function resetStore() {
  const initial = useDocStore.getState();
  const rootId = initial.doc.rootDiagramIds[0];
  useDocStore.setState({
    doc: {
      ...initial.doc,
      rootDiagramIds: [rootId],
      diagrams: { [rootId]: { id: rootId, title: "Page 1", nodes: [], edges: [] } },
    },
    navStack: [rootId],
    selection: { nodeIds: [], edgeIds: [] },
  });
  useDocStore.temporal.getState().clear();
}

// The app menu took over the File menu's document commands and the Help menu (R2, D91); these are
// the File menu's tests, moved with the commands they cover.
describe("the app menu", () => {
  beforeEach(resetStore);

  it("opens the dropdown on click and closes it on outside click", async () => {
    const user = userEvent.setup();
    render(<AppMenu />);

    expect(screen.queryByTestId("nd-app-menu-trigger-content")).not.toBeInTheDocument();
    await user.click(screen.getByTestId("nd-app-menu-trigger"));
    expect(screen.getByTestId("nd-app-menu-trigger-content")).toBeInTheDocument();

    await user.click(document.body);
    await waitFor(() => expect(screen.queryByTestId("nd-app-menu-trigger-content")).not.toBeInTheDocument());
  });

  it("New resets the document when the user confirms", async () => {
    useDocStore.getState().addShapeNode("general/rect", { x: 0, y: 0 }, { w: 100, h: 60 });
    const diagramId = useDocStore.getState().currentDiagramId();
    expect(useDocStore.getState().doc.diagrams[diagramId].nodes).toHaveLength(1);

    vi.spyOn(window, "confirm").mockReturnValue(true);
    const user = userEvent.setup();
    render(<AppMenu />);
    await user.click(screen.getByTestId("nd-app-menu-trigger"));
    await user.click(screen.getByText("New diagram"));

    const newDiagramId = useDocStore.getState().currentDiagramId();
    expect(useDocStore.getState().doc.diagrams[newDiagramId].nodes).toHaveLength(0);
  });

  it("New leaves the document untouched when the user cancels the confirm", async () => {
    useDocStore.getState().addShapeNode("general/rect", { x: 0, y: 0 }, { w: 100, h: 60 });
    const diagramId = useDocStore.getState().currentDiagramId();

    vi.spyOn(window, "confirm").mockReturnValue(false);
    const user = userEvent.setup();
    render(<AppMenu />);
    await user.click(screen.getByTestId("nd-app-menu-trigger"));
    await user.click(screen.getByText("New diagram"));

    expect(useDocStore.getState().doc.diagrams[diagramId].nodes).toHaveLength(1);
  });

  it("Open loads a valid .nedito file selected via the hidden file input", async () => {
    const user = userEvent.setup();
    render(<AppMenu />);

    const validDoc = {
      format: "nedito",
      formatVersion: 1,
      meta: { title: "Loaded", created: "2026-08-05", modified: "2026-08-05", appVersion: "0.0.1" },
      rootDiagramIds: ["loaded-root"],
      diagrams: { "loaded-root": { id: "loaded-root", title: "Loaded Page", nodes: [], edges: [] } },
    };
    const file = new File([JSON.stringify(validDoc)], "diagram.nedito", { type: "application/json" });
    const input = screen.getByTestId("nd-file-open-input") as HTMLInputElement;

    await user.upload(input, file);

    await waitFor(() => expect(useDocStore.getState().currentDiagramId()).toBe("loaded-root"));
  });

  it("Open loads a .nedito.png file via its embedded document", async () => {
    const user = userEvent.setup();
    render(<AppMenu />);

    const validDoc: DiagramDocument = {
      formatVersion: 1,
      meta: { title: "From PNG", created: "2026-08-10", modified: "2026-08-10", appVersion: "0.0.1" },
      rootDiagramIds: ["png-root"],
      diagrams: { "png-root": { id: "png-root", title: "PNG Page", nodes: [], edges: [] } },
    };
    const pngWithDoc = embedTextChunk(minimalPngBytes(), encodeDoc(validDoc));
    const file = new File([pngWithDoc as BlobPart], "diagram.nedito.png", { type: "image/png" });
    const input = screen.getByTestId("nd-file-open-input") as HTMLInputElement;

    await user.upload(input, file);

    await waitFor(() => expect(useDocStore.getState().currentDiagramId()).toBe("png-root"));
  });

  it("Open shows an alert for a plain PNG with no embedded document", async () => {
    const alertSpy = vi.spyOn(window, "alert").mockImplementation(() => {});
    const diagramId = useDocStore.getState().currentDiagramId();
    const user = userEvent.setup();
    render(<AppMenu />);

    const file = new File([minimalPngBytes() as BlobPart], "photo.png", { type: "image/png" });
    const input = screen.getByTestId("nd-file-open-input") as HTMLInputElement;
    await user.upload(input, file);

    await waitFor(() => expect(alertSpy).toHaveBeenCalled());
    expect(useDocStore.getState().currentDiagramId()).toBe(diagramId);
  });

  it("Open shows an alert and does not load an invalid file", async () => {
    const alertSpy = vi.spyOn(window, "alert").mockImplementation(() => {});
    const diagramId = useDocStore.getState().currentDiagramId();
    const user = userEvent.setup();
    render(<AppMenu />);

    const file = new File(["not valid json"], "bad.nedito", { type: "application/json" });
    const input = screen.getByTestId("nd-file-open-input") as HTMLInputElement;
    await user.upload(input, file);

    await waitFor(() => expect(alertSpy).toHaveBeenCalled());
    expect(useDocStore.getState().currentDiagramId()).toBe(diagramId);
  });
});
