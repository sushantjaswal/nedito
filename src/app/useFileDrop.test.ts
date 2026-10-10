// D79: a dropped PNG opens as a document only when it carries one; any other PNG is a picture.
import { describe, expect, it } from "vitest";
import { embedTextChunk } from "../file/pngChunks";
import { carriesDiagram } from "./useFileDrop";

const PNG_1PX = Uint8Array.from(
  atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg=="),
  (c) => c.charCodeAt(0),
);

describe("carriesDiagram", () => {
  it("is true for a .nedito.png, which opens as the diagram it carries", async () => {
    const withDoc = embedTextChunk(PNG_1PX, '{"format":"nedito"}');
    expect(await carriesDiagram(new File([withDoc as BlobPart], "plan.nedito.png", { type: "image/png" }))).toBe(true);
  });

  it("is false for an ordinary PNG, which is inserted as a picture", async () => {
    expect(await carriesDiagram(new File([PNG_1PX as BlobPart], "photo.png", { type: "image/png" }))).toBe(false);
  });

  it("is false for anything that isn't a PNG", async () => {
    expect(await carriesDiagram(new File(["<svg/>"], "logo.svg", { type: "image/svg+xml" }))).toBe(false);
  });
});
