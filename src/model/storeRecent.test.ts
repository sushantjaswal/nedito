// Replacing the document keeps the outgoing one under Recent, so New,
// Open and a template can never lose work.
import { beforeEach, describe, expect, it, vi } from "vitest";

const remembered = vi.hoisted(() => [] as unknown[]);
vi.mock("../file/recentDocs", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../file/recentDocs")>()),
  rememberDocument: vi.fn(async (doc: unknown) => void remembered.push(doc)),
}));

import { createEmptyDoc, useDocStore } from "./store";

const state = () => useDocStore.getState();

describe("loadDoc and Recent", () => {
  beforeEach(() => {
    state().loadDoc(createEmptyDoc());
    remembered.length = 0;
    useDocStore.setState((s) => ({ ui: { ...s.ui, viewerMode: false } }));
  });

  it("remembers the outgoing document when it has something in it", () => {
    state().addShapeNode("general/rect", { x: 0, y: 0 }, { w: 100, h: 60 });
    const outgoing = state().doc;
    state().loadDoc(createEmptyDoc());
    expect(remembered).toEqual([outgoing]);
  });

  it("does not remember an empty document", () => {
    state().loadDoc(createEmptyDoc());
    expect(remembered).toEqual([]);
  });

  it("does not remember a shared diagram opened read-only", () => {
    state().addShapeNode("general/rect", { x: 0, y: 0 }, { w: 100, h: 60 });
    useDocStore.setState((s) => ({ ui: { ...s.ui, viewerMode: true } }));
    state().loadDoc(createEmptyDoc());
    expect(remembered).toEqual([]);
  });
});
