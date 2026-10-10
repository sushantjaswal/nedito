// D82: Edit ▸ Paste and the canvas menu's Paste read the system clipboard, as Ctrl+V does.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createEmptyDoc, useDocStore } from "../model/store";
import { pasteFromMenu } from "./insertImage";

const nodes = () => {
  const s = useDocStore.getState();
  return s.doc.diagrams[s.currentDiagramId()].nodes;
};

function clipboardWith(read: () => Promise<unknown>) {
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { read } });
}

/** A ClipboardItem as the async Clipboard API returns one. */
function item(type: string, content: BlobPart) {
  return { types: [type], getType: async () => new Blob([content], { type }) };
}

describe("pasteFromMenu", () => {
  beforeEach(() => {
    useDocStore.getState().loadDoc(createEmptyDoc());
    // Something copied here, so we can tell which kind of paste happened.
    const id = useDocStore.getState().addShapeNode("general/rect", { x: 0, y: 0 }, { w: 100, h: 60 });
    useDocStore.getState().setSelection([id]);
    useDocStore.getState().copySelection();
  });
  afterEach(() => {
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: undefined });
    vi.restoreAllMocks();
  });

  it("places an image found on the system clipboard, where it was asked to", async () => {
    clipboardWith(async () => [item("image/svg+xml", '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="20"/>')]);
    await pasteFromMenu({ x: 300, y: 200 });
    const pasted = nodes().at(-1)!;
    expect(pasted).toMatchObject({ shapeRef: "image" });
    expect(pasted.position.x + pasted.size.w / 2).toBe(300);
    expect(pasted.position.y + pasted.size.h / 2).toBe(200);
  });

  it("pastes the shapes copied here when the system clipboard holds no image", async () => {
    clipboardWith(async () => [item("text/plain", "Nedito shapes")]);
    await pasteFromMenu();
    expect(nodes()).toHaveLength(2);
    expect(nodes().at(-1)).toMatchObject({ shapeRef: "general/rect" });
  });

  it("still pastes the shapes copied here when reading the clipboard is refused", async () => {
    clipboardWith(async () => {
      throw new DOMException("denied", "NotAllowedError");
    });
    await pasteFromMenu();
    expect(nodes()).toHaveLength(2);
  });

  it("still pastes the shapes copied here where the browser has no Clipboard API", async () => {
    await pasteFromMenu();
    expect(nodes()).toHaveLength(2);
  });
});
